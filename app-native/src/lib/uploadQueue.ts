// Upload queue: photos taken with no signal are kept on the phone and sent when
// signal comes back. Each job copies the photo into the app's own folder first, so
// it survives the camera roll being cleared or the app being closed.
// After a successful upload the job's onDone row (if any) is inserted, e.g. the
// photo's database record, so the record only appears once the file is really there.
import { Directory, File, Paths } from 'expo-file-system';
import { AppState, Platform } from 'react-native';

import { plainGet, plainSet } from './kv';
import { supabase } from './supabase';

const KEY = 'ophub-upload-queue-v1';

export type UploadJob = {
  id: string;
  bucket: string;
  path: string;
  localUri: string;
  contentType: string;
  onDone?: { table: string; row: Record<string, unknown> };
  tries: number;
  lastError?: string;
};

let running = false;
const listeners = new Set<(jobs: UploadJob[]) => void>();

async function load(): Promise<UploadJob[]> { return plainGet<UploadJob[]>(KEY, []); }
async function save(jobs: UploadJob[]) { await plainSet(KEY, jobs); listeners.forEach((l) => l(jobs)); }

export function onQueueChange(fn: (jobs: UploadJob[]) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export const pendingUploads = load;

export async function enqueueUpload(job: Omit<UploadJob, 'id' | 'tries' | 'localUri'> & { uri: string }): Promise<void> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let localUri = job.uri;
  if (Platform.OS !== 'web') {
    const dir = new Directory(Paths.document, 'upload-queue');
    if (!dir.exists) dir.create({ intermediates: true });
    const dest = new File(dir, id);
    new File(job.uri).copy(dest);
    localUri = dest.uri;
  }
  const { uri: _uri, ...rest } = job;
  await save([...(await load()), { ...rest, id, localUri, tries: 0 }]);
  void processQueue();
}

async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  const bytes = await new File(uri).bytes();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function processQueue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (const job of await load()) {
      try {
        const body = await readBytes(job.localUri);
        const up = await supabase.storage.from(job.bucket).upload(job.path, body, { contentType: job.contentType, upsert: true });
        if (up.error) throw up.error;
        if (job.onDone) {
          // Table names come from our own code, never from the server.
          const ins = await supabase.from(job.onDone.table as 'profiles').insert(job.onDone.row as never);
          if (ins.error) throw ins.error;
        }
        if (Platform.OS !== 'web') { try { new File(job.localUri).delete(); } catch { /* already gone */ } }
        await save((await load()).filter((j) => j.id !== job.id));
      } catch (e) {
        // Kept for next time: nothing is ever dropped silently.
        const msg = e instanceof Error ? e.message : String(e);
        await save((await load()).map((j) => (j.id === job.id ? { ...j, tries: j.tries + 1, lastError: msg } : j)));
      }
    }
  } finally {
    running = false;
  }
}

// Retry when the app comes back to the front, and every 2 minutes while it is open.
let started = false;
export function startUploadQueue(): void {
  if (started) return;
  started = true;
  AppState.addEventListener('change', (s) => { if (s === 'active') void processQueue(); });
  setInterval(() => { if (AppState.currentState === 'active') void processQueue(); }, 120000);
  void processQueue();
}
