// Material PO's (770): managers' folders of order files per job. The main folder can
// sync from a linked OneDrive folder (daily, or Sync Now); a file's delivery date is
// kept in step with one entry on the job calendar.
import { useQuery } from '@tanstack/react-query';

import { orThrow } from '@/lib/offlineCache';
import { supabase } from '@/lib/supabase';
import { invokeAsUser } from '@/lib/userFunctions';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type MOFolder = { id: string; site_id: string; parent_id: string | null; name: string; position: number | null };
export type MOFile = { id: string; site_id: string; folder_id: string | null; name: string; storage_path: string | null; synced_at: string | null; position: number | null; scheduled_delivery_date: string | null; calendar_event_id: string | null };

export function useMaterialOrders(siteId: string | undefined, folderId: string | null) {
  return useQuery({
    queryKey: ['matOrders', siteId, folderId],
    enabled: !!siteId,
    queryFn: async () => {
      const f = db.from('material_order_folders').select('*').eq('site_id', siteId as string);
      const d = db.from('material_order_files').select('*').eq('site_id', siteId as string);
      const [folders, files, all] = await Promise.all([
        (folderId ? f.eq('parent_id', folderId) : f.is('parent_id', null)).order('position', { ascending: true, nullsFirst: false }).order('name'),
        (folderId ? d.eq('folder_id', folderId) : d.is('folder_id', null)).order('position', { ascending: true, nullsFirst: false }).order('synced_at', { ascending: false }),
        db.from('material_order_folders').select('*').eq('site_id', siteId as string).order('name'),
      ]);
      const everyFolder = orThrow(all) as MOFolder[];
      return { folders: orThrow(folders) as MOFolder[], files: orThrow(files) as MOFile[], all: everyFolder, folder: everyFolder.find((x) => x.id === folderId) ?? null };
    },
  });
}

/** "Parent / Child" path for the move-to-folder list. */
export function folderPath(all: MOFolder[], id: string): string {
  const by: Record<string, MOFolder | undefined> = Object.fromEntries(all.map((f) => [f.id, f]));
  const parts: string[] = []; let cur = by[id]; let guard = 0;
  while (cur && guard++ < 20) { parts.unshift(cur.name); cur = cur.parent_id ? by[cur.parent_id] : undefined; }
  return parts.join(' / ');
}

function log(me: Profile, siteId: string, action: string, description: string) {
  if (me.org_id) void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action, description } as never).then(undefined, () => undefined);
}

export const createMOFolder = async (me: Profile, siteId: string, parentId: string | null, name: string) =>
  !(await db.from('material_order_folders').insert({ site_id: siteId, parent_id: parentId, name, created_by: me.id } as never)).error;
export const renameMOFolder = async (id: string, name: string) => !(await db.from('material_order_folders').update({ name } as never).eq('id', id)).error;

/** Deleting a folder moves its documents back to the main folder — nothing is deleted. */
export async function deleteMOFolder(me: Profile, f: MOFolder) {
  await db.from('material_order_files').update({ folder_id: null } as never).eq('folder_id', f.id);
  const r = await db.from('material_order_folders').delete().eq('id', f.id);
  if (!r.error) log(me, f.site_id, 'material_order_folder_deleted', `Deleted Material PO folder "${f.name || ''}"`);
  return !r.error;
}

export async function moveSibling(table: 'material_order_folders' | 'material_order_files', siblings: { id: string }[], id: string, dir: -1 | 1) {
  const idx = siblings.findIndex((f) => f.id === id), swap = idx + dir;
  if (idx < 0 || swap < 0 || swap >= siblings.length) return true;
  const res = await Promise.all(siblings.map((f, i) => db.from(table).update({ position: i === idx ? swap : i === swap ? idx : i } as never).eq('id', f.id)));
  return res.every((r) => !r.error);
}

export const moveMOFileTo = async (fileId: string, folderId: string | null) => !(await db.from('material_order_files').update({ folder_id: folderId } as never).eq('id', fileId)).error;

export async function deleteMOFile(me: Profile, f: MOFile) {
  const r = await db.from('material_order_files').delete().eq('id', f.id);
  if (r.error) return false;
  if (f.storage_path) void supabase.storage.from('material-orders').remove([f.storage_path]).catch(() => undefined);
  if (f.calendar_event_id) await db.from('site_calendar_events').delete().eq('id', f.calendar_event_id);
  log(me, f.site_id, 'material_order_file_deleted', `Deleted Material PO document "${f.name || ''}"`);
  return true;
}

export async function uploadMOFiles(me: Profile, siteId: string, folderId: string | null, assets: { uri: string; name: string; mimeType?: string | null; size?: number | null }[], onStep: (s: string) => void) {
  let n = 0;
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    onStep(`Uploading ${i + 1} of ${assets.length}…`);
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${i}`;
    try {
      const up = await supabase.storage.from('material-orders').upload(`${siteId}/manual/${rid}-${a.name.replace(/[^a-z0-9.\-]+/gi, '_')}`, await (await fetch(a.uri)).arrayBuffer(), { contentType: a.mimeType || 'application/octet-stream' });
      if (up.error) continue;
      const r = await db.from('material_order_files').insert({ site_id: siteId, org_id: me.org_id, folder_id: folderId, name: a.name, item_id: `manual-${rid}`, storage_path: up.data.path, size: a.size ?? null } as never);
      if (!r.error) n++;
    } catch { /* not counted */ }
  }
  return n;
}

/** Set, move or clear the delivery date, keeping its one calendar entry in step. */
export async function setDeliveryDate(me: Profile, siteId: string, f: MOFile, date: string | null) {
  let ev = f.calendar_event_id;
  if (!date) { if (ev) await db.from('site_calendar_events').delete().eq('id', ev); ev = null; }
  else if (ev) await db.from('site_calendar_events').update({ event_date: date, reminder_sent: false } as never).eq('id', ev);
  else {
    const r = await db.from('site_calendar_events').insert({ site_id: siteId, org_id: me.org_id, title: `Delivery: ${f.name}`, event_date: date, is_private: false, reminder_recipient_ids: [], created_by: me.id } as never).select('id').single();
    ev = (r.data as { id: string } | null)?.id ?? null;
  }
  return !(await db.from('material_order_files').update({ scheduled_delivery_date: date, calendar_event_id: ev } as never).eq('id', f.id)).error;
}

export async function viewMOFile(siteId: string, path: string) {
  const r = await invokeAsUser<{ url: string }>('material-order-file-access', { site_id: siteId, storage_path: path });
  return r.data?.url ?? null;
}

export async function syncMaterialOrders(siteId: string): Promise<string> {
  const r = await invokeAsUser<{ synced?: number; dupSkipped?: number }>('sync-material-orders', { site_id: siteId });
  if (r.error) return `Sync failed — ${r.error}`;
  void db.from('sites').update({ material_orders_last_synced_at: new Date().toISOString() } as never).eq('id', siteId).then(undefined, () => undefined);
  const d = r.data ?? {};
  return d.synced ? `Synced ${d.synced} new file${d.synced === 1 ? '' : 's'}${d.dupSkipped ? ` (${d.dupSkipped} duplicate${d.dupSkipped === 1 ? '' : 's'} skipped)` : ''}`
    : d.dupSkipped ? `Already up to date — ${d.dupSkipped} duplicate${d.dupSkipped === 1 ? '' : 's'} skipped.` : 'Already up to date.';
}
