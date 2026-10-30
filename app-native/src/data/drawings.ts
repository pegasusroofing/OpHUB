// Drawings, Spec's & Programme (810): per-job folders of files. Everyone on the job
// can view (RLS hides folders set to "assigned" people only); managers add folders,
// upload, supersede, rename, reorder and delete.
import { useQuery } from '@tanstack/react-query';

import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { publicUrl, resolveStorageUrl } from '@/lib/privateFiles';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { invokeAsUser } from '@/lib/userFunctions';
import { mustHit } from '@/lib/mustHit';

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
      const [folders, files, current, every] = await Promise.all([
        (folderId ? f.eq('parent_id', folderId) : f.is('parent_id', null)).order('position', { ascending: true, nullsFirst: false }).order('name'),
        (folderId ? d.eq('folder_id', folderId) : d.is('folder_id', null)).order('name'),
        folderId ? db.from('drawing_folders').select('*').eq('id', folderId) : Promise.resolve({ data: [], error: null }),
        folderId ? db.from('drawing_folders').select('id,name,parent_id').eq('site_id', siteId as string) : Promise.resolve({ data: [], error: null }),
      ]);
      // The folders above this one, top first (for the trail under the header).
      const byId: Record<string, { id: string; name: string; parent_id: string | null }> = {};
      (((every.data as { id: string; name: string; parent_id: string | null }[] | null) ?? [])).forEach((x) => { byId[x.id] = x; });
      const parents: { id: string; name: string }[] = [];
      for (let p = folderId ? byId[folderId]?.parent_id : null, n = 0; p && byId[p] && n < 20; p = byId[p].parent_id, n++) parents.unshift({ id: p, name: byId[p].name });
      const all = orThrow(files) as DFile[];
      return {
        folder: ((current.data as DFolder[] | null) ?? [])[0] ?? null,
        parents,
        folders: orThrow(folders) as DFolder[],
        files: all.filter((x) => x.status === 'current'),
        superseded: all.filter((x) => x.status === 'superseded').sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at))),
        nameById: Object.fromEntries(all.map((x) => [x.id, x.name])) as Record<string, string>,
      };
    }),
  });
}

function log(me: Profile, siteId: string, action: string, description: string) {
  if (me.org_id) void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action, description } as never).then(undefined, () => undefined);
}

export async function createFolder(me: Profile, siteId: string, parentId: string | null, name: string) {
  return !(await db.from('drawing_folders').insert({ site_id: siteId, parent_id: parentId, name, created_by: me.id } as never)).error;
}
export async function renameFolder(id: string, name: string) { return !!(await db.from('drawing_folders').update({ name } as never).eq('id', id).select('id')).data?.length; }
export async function deleteFolder(me: Profile, f: DFolder) {
  const r = mustHit(await db.from('drawing_folders').delete().eq('id', f.id).select('id'));
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

export async function renameFile(id: string, name: string) { return !!(await db.from('drawing_files').update({ name } as never).eq('id', id).select('id')).data?.length; }
export async function deleteFile(me: Profile, f: DFile) {
  const r = mustHit(await db.from('drawing_files').delete().eq('id', f.id).select('id'));
  if (r.error) return false;
  void supabase.storage.from('drawings').remove([f.storage_path]).catch(() => undefined);
  log(me, f.site_id, 'drawing_file_deleted', `Deleted drawing "${f.name || ''}"`);
  return true;
}

/** A signed link (the bucket is private) to open the file in the phone's viewer or a browser tab. */
export const fileUrl = (f: DFile) => resolveStorageUrl(publicUrl('drawings', f.storage_path));

/** After a programme upload: put a key date on the job calendar. */
export async function addKeyDate(me: Profile, siteId: string, date: string, title: string, fileId?: string) {
  const r = await db.from('site_calendar_events').insert({ org_id: me.org_id, site_id: siteId, title, event_date: date, is_private: false, reminder_recipient_ids: [], created_by: me.id } as never).select('id').single();
  if (r.error) return false;
  if (fileId) await db.from('drawing_files').update({ calendar_event_id: (r.data as { id: string }).id } as never).eq('id', fileId);
  return true;
}

// Two-way OneDrive sync for Drawings (810), only when the job has a OneDrive folder linked.
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
/** Push half: a copy of an uploaded file into the job's linked folder. Best-effort and silent, as today. */
export async function pushDrawingToOneDrive(siteId: string, name: string, uri: string) {
  try { const bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer()); await invokeAsUser('onedrive-upload', { filename: name, content_base64: b64(bytes), site_id: siteId }); } catch { /* OneDrive sync is opportunistic */ }
}
export type OdItem = { id: string; name: string; driveId?: string | null };
/** One level of the linked folder: sub-folders and files. */
export async function listOneDriveLevel(at: { id: string; driveId?: string | null }): Promise<{ folders: OdItem[]; files: OdItem[]; error?: string }> {
  const r = await invokeAsUser<{ folders?: OdItem[]; files?: OdItem[]; error?: string }>('onedrive-list-folders', { includeFiles: true, parent_id: at.id, ...(at.driveId ? { drive_id: at.driveId } : {}) });
  if (r.error || r.data?.error) return { folders: [], files: [], error: r.data?.error || 'Could not load OneDrive folders.' };
  return { folders: r.data?.folders || [], files: r.data?.files || [] };
}
/** Pull half: copy the ticked OneDrive files into this Drawings folder. */
export async function importFromOneDrive(me: Profile, siteId: string, folderId: string | null, files: OdItem[], onStep: (s: string) => void): Promise<{ imported: number; failed: number }> {
  let imported = 0, failed = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i]; onStep(`Importing ${i + 1} of ${files.length}…`);
    try {
      const d = await invokeAsUser<{ content_base64?: string; error?: string }>('onedrive-download-file', { item_id: f.id, drive_id: f.driveId || null, name: f.name });
      if (d.error || !d.data?.content_base64) { failed++; continue; }
      const bin = atob(d.data.content_base64), bytes = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
      const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${i}`;
      const up = await supabase.storage.from('drawings').upload(`${siteId}/${folderId || 'root'}/${rid}-${f.name.replace(/[^a-z0-9.\-]+/gi, '_')}`, bytes, { contentType: mimeFromName(f.name) || 'application/octet-stream' });
      if (up.error) { failed++; continue; }
      const r = await db.from('drawing_files').insert({ site_id: siteId, folder_id: folderId, name: f.name, storage_path: up.data.path, uploaded_by: me.id } as never);
      if (r.error) failed++; else imported++;
    } catch { failed++; }
  }
  return { imported, failed };
}

/** Manual Sync (310): new top-level files in the job's linked folder come into Drawings; last-synced stamped. */
export async function syncSiteFolder(me: Profile, site: { id: string; onedrive_folder_id?: string | null; onedrive_drive_id?: string | null }, onStep: (s: string) => void): Promise<string> {
  if (!site.onedrive_folder_id) return 'No folder linked.';
  const lvl = await listOneDriveLevel({ id: site.onedrive_folder_id, driveId: site.onedrive_drive_id });
  if (lvl.error) return `Sync failed — ${lvl.error}`;
  const have = new Set((((await db.from('drawing_files').select('name').eq('site_id', site.id).is('folder_id', null)).data as { name: string }[] | null) ?? []).map((f) => f.name));
  const r = await importFromOneDrive(me, site.id, null, lvl.files.filter((f) => !have.has(f.name)), onStep);
  await db.from('sites').update({ onedrive_last_synced_at: new Date().toISOString() } as never).eq('id', site.id);
  return `Synced — ${r.imported} pulled in${r.failed ? `, ${r.failed} failed` : ''}. Uploads here already push out automatically.`;
}
