// New job pack: the company's rules, setting a job's folder up, and putting a file where the rules say. All of it
// does nothing for a company whose pack isn't switched on, or a job set up before it was: those carry on as before.
import { useQuery } from '@tanstack/react-query';

import type { PackConfig } from '@/lib/rules/jobPack';
import { supabase } from '@/lib/supabase';
import { invokeAsUser } from '@/lib/userFunctions';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
export type JobPack = { at: string; path: string; root_id: string; drive_id: string | null; drawings_folder_id: string | null; week1: string | null };
type Settings = { enabled: boolean; config: PackConfig | null };

export const useJobPackSettings = (orgId: string | null | undefined) => useQuery({
  queryKey: ['jobPackSettings', orgId], enabled: !!orgId,
  queryFn: async () => ((await db.from('job_pack_settings').select('enabled,config').eq('org_id', orgId as string).maybeSingle()).data as Settings | null),
});
export async function saveJobPackSettings(orgId: string, meId: string, s: Settings): Promise<boolean> {
  return !(await db.from('job_pack_settings').upsert({ org_id: orgId, enabled: s.enabled, config: s.config, updated_at: new Date().toISOString(), updated_by: meId } as never)).error;
}

export type SetupResult = { error: string } | { path: string; made: number; copied: number; failed: string[] };
export async function setupJobPack(siteId: string): Promise<SetupResult> {
  const r = await invokeAsUser<{ path: string; made: number; copied: number; failed: string[] }>('onedrive-job-pack', { action: 'setup', site_id: siteId });
  if (r.error || !r.data) return { error: r.error === 'not_enabled' ? 'The job pack isn’t switched on for this company.' : r.error === 'not_connected' ? 'OneDrive isn’t connected.' : r.error || 'Could not set up the job pack.' };
  packs.delete(siteId);
  return r.data;
}
/** After a new job: sets its folder up if the company uses the pack. Best effort: a button on the job can do it later.
 *  want: the new job form's "Create OneDrive folder" tick (Andy, 8 Nov 2026); false leaves the job without one. */
export async function setupNewJobPack(orgId: string | null | undefined, siteId: string, want = true): Promise<void> {
  if (!orgId || !want) return;
  const s = (await db.from('job_pack_settings').select('enabled').eq('org_id', orgId).maybeSingle()).data as { enabled: boolean } | null;
  if (s?.enabled) void setupJobPack(siteId).catch(() => undefined);
}

/** May a new job for this client get a folder? No only when the Directory says so (Andy, 8 Nov 2026). */
export async function clientWantsFolders(name: string | null | undefined): Promise<boolean> {
  if (!String(name || '').trim()) return true;
  const r = await (supabase.rpc as unknown as (n: string, a: object) => Promise<{ data: unknown; error: unknown }>)('client_onedrive_folders', { p_name: name });
  return r.error ? true : r.data !== false;
}
/** The new job form's tick: shown when the company uses the pack; starts on unless the company or the client says no. */
export function useNewJobFolderDefault(orgId: string | null | undefined, client: string) {
  const { data: s } = useJobPackSettings(orgId);
  const on = !!s?.enabled && !!s.config;
  const { data: clientOk = true } = useQuery({ queryKey: ['clientFolders', orgId, client.trim().toLowerCase()], enabled: on && !!client.trim(), staleTime: 60000, queryFn: () => clientWantsFolders(client) });
  return { shown: on, start: on && s?.config?.create_new !== false && clientOk, clientOff: on && !clientOk };
}

const packs = new Map<string, boolean>();
export async function hasJobPack(siteId: string): Promise<boolean> {
  const known = packs.get(siteId);
  if (known !== undefined) return known;
  const r = await db.from('sites').select('job_pack').eq('id', siteId).limit(1);
  const has = !!(r.data as { job_pack: JobPack | null }[] | null)?.[0]?.job_pack;
  if (!r.error) packs.set(siteId, has);
  return has;
}
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
type Src = { photo_path: string } | { file: { bucket: string; path: string } } | { bytes: Uint8Array };
/** Puts a file in the job's pack by rule. false if the job has no pack, so the caller can do what it did before. */
export async function packPut(siteId: string, rule: string, filename: string, src: Src): Promise<boolean> {
  if (!(await hasJobPack(siteId))) return false;
  let source: object;
  if ('bytes' in src) source = { content_base64: b64(src.bytes) };
  else if ('file' in src && !src.file.path.startsWith(`${siteId}/`)) {
    // A company library copy (a Bank toolbox talk, say) isn't under the job, so it's sent from here.
    const d = await supabase.storage.from(src.file.bucket).download(src.file.path);
    if (d.error || !d.data) return true;
    source = { content_base64: b64(new Uint8Array(await d.data.arrayBuffer())) };
  } else source = src;
  await invokeAsUser('onedrive-job-pack', { action: 'put', site_id: siteId, rule, filename, ...source });
  return true;
}
const pdfName = (name: string) => (/\.pdf$/i.test(name) ? name : `${name}.pdf`);
/** A Finance PDF (application, invoice) into the job's folder when the company has added that item (8 Nov 2026).
 *  Fire and forget: the server skips it when the item is off or not added. */
const filedOnce = new Set<string>(); // the same PDF made twice in one go is filed once (OneDrive would keep both)
export const packPdfBytes = (siteId: string | null | undefined, rule: string, name: string, bytes: Uint8Array) => {
  const k = `${siteId}|${rule}|${name}|${bytes.length}`;
  if (!siteId || filedOnce.has(k)) return;
  filedOnce.add(k); void packPut(siteId, rule, pdfName(name), { bytes }).catch(() => undefined);
};
/** For the rules that fire and forget: never stops or slows what the person is doing. */
export const packDoc = (siteId: string, rule: string, name: string, bucket: string, path: string) => { void packPut(siteId, rule, pdfName(name), { file: { bucket, path } }).catch(() => undefined); };
