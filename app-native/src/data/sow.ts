// Schedule of Works data and actions. Ported from 480/481.
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { compressOne, makeSizes, type Picked } from '@/lib/photos';
import { allDone, completePatch, oneDriveName, photoPaths, statusPatch, type TaskStatus } from '@/lib/rules/sow';
import { supabase } from '@/lib/supabase';
import { cancelUpload, dropPatch, enqueuePatch, enqueueUpload, registerAfterHook } from '@/lib/uploadQueue';
import type { Profile, Site, SubAddress } from '@/lib/types';

export type Task = {
  id: string; site_id: string; name: string; status: string | null; section_id: string | null; sub_site_id: string | null;
  percent_complete: number | null; completed_at: string | null; created_at: string | null; position: number | null;
  visibility_mode: string | null; subcontractor_company_id?: string | null;
};
export type Section = { id: string; site_id: string; name: string; position: number | null; visibility_mode: string | null };
export type Photo = { id: string; task_id: string; storage_path: string; mid_path: string | null; thumb_path: string | null; uploaded_by: string | null; uploaded_at: string | null; stage: string | null };
export type Flag = {
  id: string; site_id: string; section_id: string | null; waste_to_clear: boolean; leftover_material: boolean;
  leftover_photo_path: string | null; closeout_saved_at: string | null;
};
export type SowDoc = { id: string; name: string; storage_path: string; visibility: string };

type Bundle = { tasks: Task[]; sections: Section[]; photos: Photo[]; flags: Flag[]; docs: SowDoc[]; addresses: SubAddress[]; hereSubId: string | null };

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export function useSchedule(site: Site | undefined) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['sow', site?.id, me?.id],
    enabled: !!site && !!me,
    queryFn: () => cachedQuery<Bundle>(`sow:${site?.id}:${me?.id}`, async () => {
      const s = site as Site;
      const [tasks, sections, photos, flags, docs, addresses, lastCk] = await Promise.all([
        db.from('schedule_tasks').select('*').eq('site_id', s.id).order('position', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }),
        db.from('schedule_sections').select('*').eq('site_id', s.id).order('position', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }),
        db.from('schedule_photos').select('id,task_id,storage_path,mid_path,thumb_path,uploaded_by,uploaded_at,stage,schedule_tasks!inner(site_id)').eq('schedule_tasks.site_id', s.id).order('uploaded_at', { ascending: true }),
        db.from('schedule_section_flags').select('*').eq('site_id', s.id),
        db.from('schedule_documents').select('id,name,storage_path,visibility').eq('site_id', s.id).order('created_at', { ascending: true }),
        s.multi_site ? db.from('site_sub_addresses').select('*').eq('site_id', s.id).order('name', { ascending: true }) : Promise.resolve({ data: [], error: null }),
        s.multi_site ? db.from('checkins').select('type,sub_site_id').eq('site_id', s.id).eq('user_id', (me as Profile).id).order('ts', { ascending: false }).limit(1) : Promise.resolve({ data: [], error: null }),
      ]);
      const ck = (orThrow(lastCk) as { type: string; sub_site_id: string | null }[])[0];
      return {
        tasks: orThrow(tasks) as Task[],
        sections: orThrow(sections) as Section[],
        photos: (orThrow(photos) as (Photo & { schedule_tasks?: unknown })[]).map(({ schedule_tasks: _x, ...p }) => p),
        flags: orThrow(flags) as Flag[],
        docs: orThrow(docs) as SowDoc[],
        addresses: orThrow(addresses) as SubAddress[],
        hereSubId: ck && ck.type === 'in' && ck.sub_site_id ? ck.sub_site_id : null,
      };
    }),
  });
}

/* ---------- photos ---------- */
// After a photo is in: copy it to the job's OneDrive folder (best effort, same as today).
registerAfterHook('sowOneDrive', async (args, { paths }) => {
  if (!paths[0]) return;
  await supabase.functions.invoke('onedrive-upload', { body: { filename: args.filename, photo_path: paths[0], site_id: args.siteId } });
});

// After "complete" lands: a live variation tied to this section closes when all its tasks are done.
registerAfterHook('sowVariationClose', async (args, { row }) => {
  const sectionId = row?.section_id as string | undefined;
  if (!sectionId) return;
  const v = await db.from('variations').select('id,description').eq('schedule_section_id', sectionId).eq('status', 'live');
  const variation = (v.data as { id: string; description: string }[] | null)?.[0];
  if (!variation) return;
  const t = await db.from('schedule_tasks').select('status').eq('section_id', sectionId);
  if (!allDone((t.data as { status: string }[] | null) ?? [])) return;
  const c = await db.from('variations').update({ closed_at: new Date().toISOString(), status: 'closed' } as never).eq('id', variation.id).select();
  if (!c.error && args.orgId) {
    await db.from('site_activity_log').insert({
      site_id: args.siteId, org_id: args.orgId, actor_id: args.userId, action: 'variation_closed',
      description: `Auto-closed variation "${variation.description || ''}" (all Schedule of Works tasks complete)`,
    } as never);
  }
});

const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${Math.random().toString(16).slice(2)}`);

/** Queues photos for a task. Each is resized to three sizes, uploaded, then recorded. */
export async function addPhotos(me: Profile, site: Site, task: Task, picked: Picked[], stage: TaskStatus): Promise<number> {
  let n = 0;
  for (const p of picked) {
    const id = newId();
    const sizes = await makeSizes(p);
    const paths = photoPaths(site.id, task.id, id);
    const files = [
      { bucket: 'site-photos', path: paths.full, uri: sizes.full, contentType: 'image/jpeg' },
      ...(sizes.mid ? [{ bucket: 'site-photos', path: paths.mid, uri: sizes.mid, contentType: 'image/jpeg', optional: true }] : []),
      ...(sizes.thumb ? [{ bucket: 'site-photos', path: paths.thumb, uri: sizes.thumb, contentType: 'image/jpeg', optional: true }] : []),
    ];
    const pathFields: Record<string, number> = { storage_path: 0 };
    if (sizes.mid) pathFields.mid_path = 1;
    if (sizes.thumb) pathFields.thumb_path = sizes.mid ? 2 : 1;
    await enqueueUpload({
      id, files, waitKey: task.id, label: task.name,
      insert: { table: 'schedule_photos', row: { id, task_id: task.id, uploaded_by: me.id, stage }, pathFields },
      after: { name: 'sowOneDrive', args: { siteId: site.id, filename: oneDriveName(task.name, new Date(), id) } },
    });
    n++;
  }
  return n;
}

/** Complete = photos first, then the task flips to done once they're up. */
export async function completeWithPhotos(me: Profile, site: Site, task: Task, picked: Picked[]): Promise<number> {
  const n = await addPhotos(me, site, task, picked, 'done');
  if (n) {
    await enqueuePatch({
      table: 'schedule_tasks', rowId: task.id, patch: completePatch(), waitKey: task.id,
      after: { name: 'sowVariationClose', args: { siteId: site.id, orgId: me.org_id, userId: me.id } },
    });
  }
  return n;
}

/** A photo on a To Commence task can move it to In Progress (after its photo is in). */
export async function moveToProgressAfterPhotos(task: Task): Promise<void> {
  await enqueuePatch({ table: 'schedule_tasks', rowId: task.id, patch: { status: 'progress' }, waitKey: task.id });
}

export async function setStatus(task: Task, next: 'todo' | 'progress'): Promise<boolean> {
  await dropPatch('schedule_tasks', task.id);
  const r = await db.from('schedule_tasks').update(statusPatch(next) as never).eq('id', task.id).select();
  if (r.error) return false;
  const row = (r.data as Task[] | null)?.[0];
  if (row && next === 'progress' && row.percent_complete === 100) {
    await db.from('schedule_tasks').update({ percent_complete: null } as never).eq('id', task.id);
  }
  return true;
}

export async function setPercent(task: Task, pct: number): Promise<boolean> {
  const r = await db.from('schedule_tasks').update({ percent_complete: pct } as never).eq('id', task.id);
  return !r.error;
}

export async function deletePhoto(p: Photo): Promise<boolean> {
  const r = await db.from('schedule_photos').delete().eq('id', p.id);
  if (r.error) return false;
  const base = p.storage_path.replace(/\.[a-z0-9]+$/i, '');
  try { await supabase.storage.from('site-photos').remove([p.storage_path, `${base}_m.jpg`, `${base}_t.jpg`]); } catch { /* non-fatal */ }
  return true;
}

export { cancelUpload };

/* ---------- section flags / site condition ---------- */
async function flagRow(siteId: string, sectionId: string | null): Promise<Flag | null> {
  let q = db.from('schedule_section_flags').select('*').eq('site_id', siteId);
  q = sectionId ? q.eq('section_id', sectionId) : q.is('section_id', null);
  const r = await q;
  return ((r.data as Flag[] | null) ?? [])[0] ?? null;
}

/** Waste / leftover flag. Turning one on tells the managers (it lands in Deliveries › To schedule). */
export async function saveFlag(me: Profile, site: Site, sectionId: string | null, sectionLabel: string, field: 'waste_to_clear' | 'leftover_material', value: boolean, photoPath?: string): Promise<boolean> {
  const row = await flagRow(site.id, sectionId);
  const wasOn = row ? !!row[field] : false;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { [field]: value, updated_at: now };
  if (field === 'waste_to_clear' && value) { patch.waste_flagged_by = me.id; patch.waste_flagged_at = now; }
  if (field === 'leftover_material' && value) { patch.leftover_flagged_by = me.id; patch.leftover_flagged_at = now; if (photoPath) patch.leftover_photo_path = photoPath; }
  const r = row
    ? await db.from('schedule_section_flags').update(patch as never).eq('id', row.id)
    : await db.from('schedule_section_flags').insert({ site_id: site.id, section_id: sectionId, ...patch } as never);
  if (r.error) return false;
  if (!wasOn && value && me.org_id) {
    const label = field === 'waste_to_clear' ? 'Waste to clear' : 'Leftover material';
    void db.from('messages').insert({
      org_id: me.org_id, site_id: site.id, sender_id: me.id, audience: 'managers', kind: 'schedule_flag',
      body: `${me.name} flagged "${label}" on ${sectionLabel} at ${site.name} — it's waiting in Deliveries › To schedule.`,
    } as never);
  }
  return true;
}

export async function addLeftoverPhoto(site: Site, sectionId: string | null, p: Picked): Promise<boolean> {
  const uri = await compressOne(p);
  const path = `${site.id}/schedule-flags/${sectionId || 'ungrouped'}/${newId()}.jpg`;
  const bytes = await (await fetch(uri)).arrayBuffer();
  const up = await supabase.storage.from('site-photos').upload(path, bytes, { contentType: 'image/jpeg' });
  if (up.error) return false;
  const row = await flagRow(site.id, sectionId);
  if (!row) return false;
  const r = await db.from('schedule_section_flags').update({ leftover_photo_path: up.data.path, updated_at: new Date().toISOString() } as never).eq('id', row.id);
  return !r.error;
}

export async function closeOutSiteCondition(me: Profile, siteId: string, reopen = false): Promise<boolean> {
  let row = await flagRow(siteId, null);
  if (!row) {
    const ins = await db.from('schedule_section_flags').insert({ site_id: siteId, section_id: null, waste_to_clear: false, leftover_material: false, updated_at: new Date().toISOString() } as never).select();
    row = ((ins.data as Flag[] | null) ?? [])[0] ?? null;
  }
  if (!row) return false;
  const r = await db.from('schedule_section_flags').update((reopen
    ? { closeout_saved_at: null, closeout_saved_by: null }
    : { closeout_saved_at: new Date().toISOString(), closeout_saved_by: me.id }) as never).eq('id', row.id);
  return !r.error;
}

/* ---------- documents and "viewed" ---------- */
export async function documentLink(doc: SowDoc): Promise<string | null> {
  const r = await supabase.storage.from('schedule-docs').createSignedUrl(doc.storage_path, 600);
  return r.data?.signedUrl ?? null;
}

// Operatives: the first time they open a Schedule of Works it's recorded on their profile.
export async function markViewedOnce(me: Profile & { viewed_schedule_at?: string | null }): Promise<void> {
  if (me.viewed_schedule_at || ['pm', 'admin', 'site_manager'].includes(me.role)) return;
  await db.from('profiles').update({ viewed_schedule_at: new Date().toISOString() } as never).eq('id', me.id);
}
