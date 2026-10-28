// Drawings, Spec's & Programme (810): per-job folders of files. Everyone on the job
// can view (RLS hides folders set to "assigned" people only); managers add folders,
// upload, supersede, rename, reorder and delete.
import { useQuery } from '@tanstack/react-query';

import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { publicUrl, resolveStorageUrl } from '@/lib/privateFiles';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type DFolder = { id: string; site_id: string; parent_id: string | null; name: string; position: number | null; visibility_mode?: string | null };
export type DFile = { id: string; site_id: string; folder_id: string | null; name: string; storage_path: string; status: string; supersedes: string | null; superseded_by: string | null; uploaded_at: string };

export function useDrawings(siteId: string | undefined, folderId: string | null) {
  return useQuery({
    queryKey: ['drawings', siteId, folderId],
    enabled: !!siteId,
    queryFn: () => cachedQuery(`drawings:${siteId}:${folderId ?? 'root'}`, async () => {
      const f = db.from('drawing_folders').select('*').eq('site_id', siteId as string);
      const d = db.from('drawing_files').select('*').eq('site_id', siteId as string);
      const [folders, files, current] = await Promise.all([
        (folderId ? f.eq('parent_id', folderId) : f.is('parent_id', null)).order('position', { ascending: true, nullsFirst: false }).order('name'),
        (folderId ? d.eq('folder_id', folderId) : d.is('folder_id', null)).order('name'),
        folderId ? db.from('drawing_folders').select('*').eq('id', folderId) : Promise.resolve({ data: [], error: null }),
      ]);
      const all = orThrow(files) as DFile[];
      return {
        folder: ((current.data as DFolder[] | null) ?? [])[0] ?? null,
        folders: orThrow(folders) as DFolder[],
        files: all.filter((x) => x.status === 'current'),
        superseded: all.filter((x) => x.status === 'superseded').sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at))),
        nameById: Object.fromEntries(all.map((x) => [x.id, x.name])) as Record<string, string>,
      };
    }),
  });
}

function log(me: Profile, siteId: string, action: string, description: string) {
  if (me.org_id) void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action, description } as never);
}

export async function createFolder(me: Profile, siteId: string, parentId: string | null, name: string) {
  return !(await db.from('drawing_folders').insert({ site_id: siteId, parent_id: parentId, name, created_by: me.id } as never)).error;
}
export async function renameFolder(id: string, name: string) { return !(await db.from('drawing_folders').update({ name } as never).eq('id', id)).error; }
export async function deleteFolder(me: Profile, f: DFolder) {
  const r = await db.from('drawing_folders').delete().eq('id', f.id);
  if (!r.error) log(me, f.site_id, 'drawing_folder_deleted', `Deleted drawings folder "${f.name || ''}"`);
  return !r.error;
}
/** Swap a folder with its neighbour, renumbering every sibling in one pass. */
export async function moveFolder(siblings: DFolder[], id: string, dir: -1 | 1) {
  const idx = siblings.findIndex((f) => f.id === id), swap = idx + dir;
  if (idx < 0 || swap < 0 || swap >= siblings.length) return true;
  const res = await Promise.all(siblings.map((f, i) => db.from('drawing_folders').update({ position: i === idx ? swap : i === swap ? idx : i } as never).eq('id', f.id)));
  return res.every((r) => !r.error);
}

const MIME: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', txt: 'text/plain', rtf: 'application/rtf',
  dwg: 'application/acad', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip: 'application/zip',
};
export const mimeFromName = (name: string) => MIME[((/\.([a-z0-9]+)$/i.exec(name) || [])[1] || '').toLowerCase()] || 'application/octet-stream';
export function fileIcon(f: { storage_path?: string; name?: string }) {
  const n = (f.storage_path || f.name || '').toLowerCase();
  if (/\.(jpe?g|png|gif|webp|heic)$/.test(n)) return '🖼';
  if (/\.(xlsx|xlsm|xls|csv)$/.test(n)) return '📊';
  if (/\.(docx?|rtf|odt|txt)$/.test(n)) return '📝';
  if (/\.pdf$/.test(n)) return '📐';
  return '📎';
}

/** The "Drawings" folder itself takes PDF / JPEG / PNG only; every other folder takes any file. */
export const drawingsOnlyOk = (mime: string) => ['application/pdf', 'image/jpeg', 'image/png'].includes(mime);

export async function uploadFiles(me: Profile, siteId: string, folderId: string | null, assets: { uri: string; name: string; mimeType?: string | null }[], supersedesId: string | null, onStep: (s: string) => void): Promise<{ uploaded: number; last: DFile | null }> {
  let uploaded = 0; let last: DFile | null = null;
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    onStep(`Uploading ${i + 1} of ${assets.length}…`);
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${i}`;
    const path = `${siteId}/${folderId || 'root'}/${rid}-${a.name.replace(/[^a-z0-9.\-]+/gi, '_')}`;
    try {
      const up = await supabase.storage.from('drawings').upload(path, await (await fetch(a.uri)).arrayBuffer(), { contentType: a.mimeType || mimeFromName(a.name) });
      if (up.error) continue;
      const r = await db.from('drawing_files').insert({ site_id: siteId, folder_id: folderId, name: a.name, storage_path: up.data.path, uploaded_by: me.id, supersedes: supersedesId } as never).select('*').single();
      if (r.error) continue;
      uploaded++; last = r.data as DFile;
      if (supersedesId) await db.from('drawing_files').update({ status: 'superseded', superseded_by: last.id } as never).eq('id', supersedesId);
    } catch { /* counted as not uploaded */ }
  }
  return { uploaded, last };
}

export async function renameFile(id: string, name: string) { return !(await db.from('drawing_files').update({ name } as never).eq('id', id)).error; }
export async function deleteFile(me: Profile, f: DFile) {
  const r = await db.from('drawing_files').delete().eq('id', f.id);
  if (r.error) return false;
  void supabase.storage.from('drawings').remove([f.storage_path]).catch(() => undefined);
  log(me, f.site_id, 'drawing_file_deleted', `Deleted drawing "${f.name || ''}"`);
  return true;
}

/** A signed link (the bucket is private) to open the file in the phone's viewer or a browser tab. */
export const fileUrl = (f: DFile) => resolveStorageUrl(publicUrl('drawings', f.storage_path));

/** After a programme upload: put a key date on the job calendar. */
export async function addKeyDate(me: Profile, siteId: string, date: string, title: string) {
  return !(await db.from('site_calendar_events').insert({ org_id: me.org_id, site_id: siteId, title, event_date: date, is_private: false, reminder_recipient_ids: [], created_by: me.id } as never)).error;
}
