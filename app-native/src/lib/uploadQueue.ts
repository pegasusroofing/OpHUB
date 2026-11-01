// Upload queue: photos taken with no signal are kept on the phone and sent when
// signal comes back. Same idea as the current app's Schedule of Works queue (481, 435).
//
// Two kinds of job:
//  - upload: one or more files (e.g. full + mid + thumb), then a database row that
//    records them. Optional files (mid/thumb) may fail without stopping the job.
//  - patch: a database update that waits until no uploads with the same waitKey are
//    left, e.g. "mark task complete" only after its completion photos are in.
// Each file is copied into the app's own folder first, so it survives the camera roll
// being cleared or the app being closed. Nothing is dropped silently: failures stay
// queued and are retried (backing off up to 5 minutes).
import { Directory, File, Paths } from 'expo-file-system';
import { AppState, Platform } from 'react-native';

import { plainGet, plainSet } from './kv';
import { isUuid, makeUuid } from './uuidPolyfill';
import { supabase } from './supabase';

const KEY = 'ophub-upload-queue-v2';

export type QueuedFile = { bucket: string; path: string; localUri: string; contentType: string; optional?: boolean };
export type UploadJob = {
  kind: 'upload';
  id: string;
  files: QueuedFile[];
  // Row inserted once the files are up. pathFields maps a column to the index of
  // the file whose stored path goes in it (null if an optional file failed).
  insert?: { table: string; row: Record<string, unknown>; pathFields?: Record<string, number> };
  waitKey?: string;
  label?: string;  // shown in the app, e.g. the task name
  after?: AfterHook;
  tries: number;
  lastError?: string;
  at: number;
};
export type PatchJob = {
  kind: 'patch';
  id: string;
  table: string;
  rowId: string;
  patch: Record<string, unknown>;
  waitKey?: string;
  after?: AfterHook;
  tries: number;
  lastError?: string;
  at: number;
};
export type Job = UploadJob | PatchJob;
// Follow-up work registered by feature code (e.g. OneDrive copy, variation auto-close).
export type AfterHook = { name: string; args: Record<string, unknown> };

const hooks: Record<string, (args: Record<string, unknown>, result: { paths: (string | null)[]; row?: Record<string, unknown> }) => Promise<void>> = {};
export function registerAfterHook(name: string, fn: (typeof hooks)[string]) { hooks[name] = fn; }

let running = false;
let again = false;
let fails = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(jobs: Job[]) => void>();

async function load(): Promise<Job[]> { return plainGet<Job[]>(KEY, []); }
async function save(jobs: Job[]) { await plainSet(KEY, jobs); listeners.forEach((l) => l(jobs)); }
async function update(fn: (jobs: Job[]) => Job[]) { await save(fn(await load())); }

export function onQueueChange(fn: (jobs: Job[]) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export const pendingJobs = load;
export async function pendingUploads(): Promise<UploadJob[]> {
  return (await load()).filter((j): j is UploadJob => j.kind === 'upload');
}

const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// Keeps a copy of a picked/taken photo in the app's own storage (phones only).
function keepLocal(uri: string, name: string): string {
  if (Platform.OS === 'web') return uri;
  const dir = new Directory(Paths.document, 'upload-queue');
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, name);
  new File(uri).copy(dest);
  return dest.uri;
}

export async function enqueueUpload(job: {
  id?: string;
  files: (Omit<QueuedFile, 'localUri'> & { uri: string })[];
  insert?: UploadJob['insert'];
  waitKey?: string;
  label?: string;
  after?: AfterHook;
}): Promise<string> {
  const id = job.id ?? newId();
  await Promise.all(job.files.map((f) => keepWebBytes(f.uri).catch(() => undefined)));
  const files = job.files.map((f, i) => ({ bucket: f.bucket, path: f.path, contentType: f.contentType, optional: f.optional, localUri: keepLocal(f.uri, `${id}-${i}`) }));
  await update((jobs) => [...jobs, { kind: 'upload', id, files, insert: job.insert, waitKey: job.waitKey, label: job.label, after: job.after, tries: 0, at: Date.now() }]);
  void processQueue();
  return id;
}

// A later patch for the same row replaces an earlier one still waiting.
export async function enqueuePatch(p: { table: string; rowId: string; patch: Record<string, unknown>; waitKey?: string; after?: AfterHook }): Promise<void> {
  await update((jobs) => [
    ...jobs.filter((j) => !(j.kind === 'patch' && j.table === p.table && j.rowId === p.rowId)),
    { kind: 'patch', id: newId(), ...p, tries: 0, at: Date.now() },
  ]);
  void processQueue();
}

export async function dropPatch(table: string, rowId: string): Promise<void> {
  await update((jobs) => jobs.filter((j) => !(j.kind === 'patch' && j.table === table && j.rowId === rowId)));
}

// Removes a photo that hasn't finished uploading. If that leaves a "complete" patch
// with no photo behind it, that patch goes too (a task is never completed without one).
export async function cancelUpload(id: string): Promise<{ revertedComplete: boolean }> {
  const jobs = await load();
  const job = jobs.find((j) => j.id === id);
  if (!job || job.kind !== 'upload') return { revertedComplete: false };
  let rest = jobs.filter((j) => j.id !== id);
  let revertedComplete = false;
  if (job.waitKey && !rest.some((j) => j.kind === 'upload' && j.waitKey === job.waitKey)) {
    const before = rest.length;
    rest = rest.filter((j) => !(j.kind === 'patch' && j.waitKey === job.waitKey && j.patch.status === 'done'));
    revertedComplete = rest.length !== before;
  }
  await save(rest);
  deleteLocal(job);
  return { revertedComplete };
}

// On the website a picked photo is only a browser link, gone when the page closes and sometimes sooner. So the
// photo itself is kept as soon as it's queued: in memory, and in the browser's own store so a reload doesn't lose it.
const webBytes = new Map<string, ArrayBuffer>();
const GONE = 'The photo is no longer on this device: add it again.';
const webStore = (): Promise<IDBDatabase> => new Promise((ok, bad) => { const r = indexedDB.open('ophub-upload-files', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });
const webDo = async <T,>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> => {
  try { const db = await webStore(); return await new Promise<T>((ok, bad) => { const q = run(db.transaction('files', mode).objectStore('files')); q.onsuccess = () => ok(q.result); q.onerror = () => bad(q.error); }); } catch { return undefined; }
};
async function keepWebBytes(uri: string) {
  if (Platform.OS !== 'web' || webBytes.has(uri)) return;
  const bytes = await (await fetch(uri)).arrayBuffer();
  webBytes.set(uri, bytes);
  await webDo('readwrite', (st) => st.put(bytes, uri));
}

function deleteLocal(job: UploadJob) {
  if (Platform.OS === 'web') { for (const f of job.files) { webBytes.delete(f.localUri); void webDo('readwrite', (st) => st.delete(f.localUri)); } return; }
  for (const f of job.files) { try { new File(f.localUri).delete(); } catch { /* already gone */ } }
}

async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return webBytes.get(uri) ?? (await webDo<ArrayBuffer>('readonly', (st) => st.get(uri))) ?? (await fetch(uri).then((r) => r.arrayBuffer()).catch(() => { throw new Error(GONE); }));
  const bytes = await new File(uri).bytes();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function runUpload(job: UploadJob): Promise<void> {
  // All the sizes at once: quicker than one after the other.
  const paths = await Promise.all(job.files.map(async (f): Promise<string | null> => {
    try {
      const up = await supabase.storage.from(f.bucket).upload(f.path, await readBytes(f.localUri), { contentType: f.contentType, upsert: true });
      if (up.error) throw up.error;
      return up.data.path;
    } catch (e) {
      if (!f.optional) throw e;
      return null;
    }
  }));
  let row: Record<string, unknown> | undefined;
  if (job.insert) {
    row = { ...job.insert.row };
    // A photo queued before ids were fixed: its id would be refused for good.
    if ('id' in row && !isUuid(row.id)) row.id = makeUuid();
    for (const [col, idx] of Object.entries(job.insert.pathFields ?? {})) row[col] = paths[idx] ?? null;
    // Table names come from our own code, never from the server.
    const ins = await supabase.from(job.insert.table as 'profiles').insert(row as never);
    // 23505 = already there (a retry after the row went in): that's fine.
    if (ins.error && ins.error.code !== '23505') throw ins.error;
  }
  // Copying to OneDrive and the like carries on behind: the photo is in, so it isn't "uploading" any more.
  if (job.after && hooks[job.after.name]) void Promise.resolve().then(() => hooks[(job.after as AfterHook).name]((job.after as AfterHook).args, { paths, row })).catch(() => undefined);
}

async function runPatch(job: PatchJob): Promise<void> {
  const r = await supabase.from(job.table as 'profiles').update(job.patch as never).eq('id', job.rowId).select();
  if (r.error) throw r.error;
  if (job.after && hooks[job.after.name]) {
    try { await hooks[job.after.name](job.after.args, { paths: [], row: (r.data?.[0] ?? undefined) as Record<string, unknown> | undefined }); } catch { /* best effort */ }
  }
}

export async function processQueue(): Promise<void> {
  if (running) { again = true; return; }
  running = true;
  if (timer) { clearTimeout(timer); timer = null; }
  let sent = 0, failed = 0;
  try {
    const failedIds = new Set<string>();
    // Uploads first.
    for (const job of (await load()).filter((j): j is UploadJob => j.kind === 'upload')) {
      try {
        // Several photos at once can trip a request on a poor signal: try again straight away before saying it hasn't gone.
        const again = (ms: number) => async (e: unknown) => { if (String((e as Error)?.message).includes(GONE)) throw e; await new Promise((r) => setTimeout(r, ms)); return runUpload(job); };
        await runUpload(job).catch(again(1500)).catch(again(4000));
        await update((jobs) => jobs.filter((j) => j.id !== job.id));
        deleteLocal(job);
        sent++;
      } catch (e) {
        failed++; failedIds.add(job.id);
        const msg = e instanceof Error ? e.message : String(e);
        await update((jobs) => jobs.map((j) => (j.id === job.id ? { ...j, tries: j.tries + 1, lastError: msg } : j)));
      }
    }
    // Then patches whose photos are all in.
    const now = await load();
    const waiting = new Set(now.filter((j) => j.kind === 'upload').map((j) => j.waitKey).filter(Boolean));
    for (const job of now.filter((j): j is PatchJob => j.kind === 'patch')) {
      if (job.waitKey && waiting.has(job.waitKey)) continue;
      try {
        await runPatch(job);
        await update((jobs) => jobs.filter((j) => j.id !== job.id));
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        await update((jobs) => jobs.map((j) => (j.id === job.id ? { ...j, tries: j.tries + 1, lastError: msg } : j)));
      }
    }
  } finally {
    running = false;
  }
  if (sent) sentListeners.forEach((l) => l(sent));
  const left = (await load()).length;
  if (left) {
    fails = sent ? 0 : fails + (failed ? 1 : 0);
    timer = setTimeout(() => { void processQueue(); }, Math.min(300000, 10000 * 2 ** Math.max(0, fails - 1)));
  } else {
    fails = 0;
  }
  if (again) { again = false; void processQueue(); }
}

// "✓ 3 photos uploaded" messages.
const sentListeners = new Set<(n: number) => void>();
export function onUploadsSent(fn: (n: number) => void): () => void {
  sentListeners.add(fn);
  return () => { sentListeners.delete(fn); };
}

// Retry when the app comes back to the front, and on the back-off timer above.
let started = false;
export function startUploadQueue(): void {
  if (started) return;
  started = true;
  AppState.addEventListener('change', (s) => { if (s === 'active') void processQueue(); });
  if (Platform.OS === 'web') globalThis.addEventListener?.('online', () => { void processQueue(); });
  void processQueue();
}
