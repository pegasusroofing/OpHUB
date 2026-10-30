// Maintenance / repair contract (340): the job list, one job, its photos, and
// every save. Key dates go on the job's site Calendar (same linked-event idea
// as the old app); notes saves email the PM through the existing function.
import { useQuery } from '@tanstack/react-query';

import { compressOne, type Picked } from '@/lib/photos';
import type { RepairJob } from '@/lib/rules/repairs';
import { supabase } from '@/lib/supabase';
import { pushWorkOrder, syncRepairPhotos } from '@/data/repairOneDrive';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type RepairPhoto = { id: string; category: string; storage_path: string; hires_path: string | null; deleted_at: string | null; uploaded_at?: string };

export function useRepairJobs(siteId: string | undefined) {
  return useQuery({
    queryKey: ['repairJobs', siteId],
    enabled: !!siteId,
    queryFn: async () => ((await db.from('repair_jobs').select('*').eq('site_id', siteId as string).order('created_at', { ascending: false })).data as RepairJob[] | null) ?? [],
  });
}
export function useRepairJob(jobId: string | undefined) {
  return useQuery({
    queryKey: ['repairJob', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const [j, p] = await Promise.all([
        db.from('repair_jobs').select('*').eq('id', jobId as string).maybeSingle(),
        db.from('repair_job_photos').select('*').eq('repair_job_id', jobId as string).order('uploaded_at'),
      ]);
      return { job: (j.data as RepairJob | null) ?? null, photos: (p.data as RepairPhoto[] | null) ?? [] };
    },
  });
}
/** Tiles hidden from operatives (company-wide, set by managers). */
export function useRepairHiddenTiles(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['repairHidden', orgId], enabled: !!orgId,
    queryFn: async () => (((await db.from('organizations').select('repair_hidden_tiles').eq('id', orgId as string).maybeSingle()).data as { repair_hidden_tiles: string[] | null } | null)?.repair_hidden_tiles) ?? [],
  });
}
export async function setRepairHiddenTiles(orgId: string, keys: string[]): Promise<boolean> {
  return !!(await db.from('organizations').update({ repair_hidden_tiles: keys } as never).eq('id', orgId).select('id')).data?.length;
}

export async function addRepairJob(me: Profile, siteId: string, f: { address: string; job_number: string; description: string }): Promise<string | null> {
  const r = await db.from('repair_jobs').insert({ site_id: siteId, org_id: me.org_id, address: f.address, job_number: f.job_number || null, description: f.description || null, survey_required: 'N', job_status: 'To Survey', created_by: me.id } as never).select('id').single();
  return r.error || !r.data ? null : (r.data as { id: string }).id;
}
export async function patchRepairJob(id: string, patch: Partial<RepairJob> & Record<string, unknown>): Promise<boolean> {
  return !!(await db.from('repair_jobs').update(patch as never).eq('id', id).select('id')).data?.length;
}
export async function patchRepairJobs(ids: string[], patch: Record<string, unknown>): Promise<boolean> {
  return !(await db.from('repair_jobs').update(patch as never).in('id', ids)).error;
}

/** Keeps a key date on the site Calendar; returns the event id to store (null when cleared). */
export async function syncRepairEvent(me: Profile, siteId: string, existing: string | null, date: string | null, title: string, recipients: string[] = []): Promise<string | null> {
  try {
    if (!date) { if (existing) await db.from('site_calendar_events').delete().eq('id', existing); return null; }
    if (existing) { await db.from('site_calendar_events').update({ title, event_date: date, site_id: siteId, reminder_recipient_ids: recipients, reminder_sent: false } as never).eq('id', existing); return existing; }
    const r = await db.from('site_calendar_events').insert({ org_id: me.org_id, site_id: siteId, title, event_date: date, is_private: false, reminder_recipient_ids: recipients, created_by: me.id } as never).select('id').single();
    return r.data ? (r.data as { id: string }).id : null;
  } catch { return existing; }
}

/** Tells the PM a survey / progress / completion note was saved (best effort). */
export function notifyPmOfRepairNotes(jobId: string, siteId: string, section: 'survey' | 'progress' | 'completion', notes: string) {
  void supabase.functions.invoke('send-repair-job-notes-email', { body: { site_id: siteId, job_id: jobId, section, notes } }).catch(() => undefined);
}

export async function hasRepairPhoto(jobId: string, category: string): Promise<boolean> {
  return (((await db.from('repair_job_photos').select('id').eq('repair_job_id', jobId).eq('category', category).is('deleted_at', null).limit(1)).data) ?? []).length > 0;
}

const rid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${Math.random().toString(16).slice(2)}`);
export async function addRepairPhotos(me: Profile, jobId: string, category: string, picked: Picked[]): Promise<number> {
  let failed = 0;
  for (const p of picked) {
    try {
      const pid = rid();
      const small = await compressOne(p);
      const up = await supabase.storage.from('site-photos').upload(`${me.org_id}/repairjobs/${jobId}/${category}/${pid}.jpg`, await (await fetch(small)).arrayBuffer(), { contentType: 'image/jpeg' });
      if (up.error) { failed++; continue; }
      // Full-size copy kept too, so it's never only on OneDrive.
      let hires: string | null = null;
      try { const h = await supabase.storage.from('site-photos').upload(`${me.org_id}/repairjobs/${jobId}/${category}/full/${pid}.jpg`, await (await fetch(p.uri)).arrayBuffer(), { contentType: 'image/jpeg' }); hires = h.error ? null : h.data.path; } catch { hires = null; }
      const r = await db.from('repair_job_photos').insert({ repair_job_id: jobId, category, storage_path: up.data.path, uploaded_by: me.id, ...(hires ? { hires_path: hires } : {}) } as never);
      if (r.error) failed++;
    } catch { failed++; }
  }
  // Each photo goes to OneDrive in the background, one at a time, marked once it's there (retried if not).
  void syncRepairPhotos(jobId);
  return failed;
}
/** Hidden, not deleted — it can be restored from "Deleted photos". */
export async function hideRepairPhoto(me: Profile, id: string, restore = false): Promise<boolean> {
  return !!(await db.from('repair_job_photos').update((restore ? { deleted_at: null, deleted_by: null } : { deleted_at: new Date().toISOString(), deleted_by: me.id }) as never).eq('id', id).select('id')).data?.length;
}
export async function uploadWorkOrder(me: Profile, job: RepairJob, f: { uri: string; name: string; mimeType?: string | null }): Promise<boolean> {
  const path = `${me.org_id}/repairjobs/${job.id}/workorder/${rid()}-${f.name.replace(/[^a-z0-9.-]+/gi, '_')}`;
  const up = await supabase.storage.from('site-photos').upload(path, await (await fetch(f.uri)).arrayBuffer(), { contentType: f.mimeType || 'application/pdf' });
  if (up.error || !(await patchRepairJob(job.id, { work_order_path: up.data.path, work_order_name: f.name }))) return false;
  void pushWorkOrder({ ...job, work_order_path: up.data.path, work_order_name: f.name } as never);
  return true;
}
/** Managers only. Permanent: the job and its photo records go. */
export async function deleteRepairJob(job: RepairJob): Promise<boolean> {
  const photos = ((await db.from('repair_job_photos').select('storage_path,hires_path').eq('repair_job_id', job.id)).data as { storage_path: string; hires_path: string | null }[] | null) ?? [];
  if (!(await db.from('repair_jobs').delete().eq('id', job.id).select('id')).data?.length) return false;
  const paths = photos.flatMap((p) => [p.storage_path, p.hires_path]).concat(job.work_order_path).filter((x): x is string => !!x);
  if (paths.length) { try { await supabase.storage.from('site-photos').remove(paths); } catch { /* harmless */ } }
  return true;
}
