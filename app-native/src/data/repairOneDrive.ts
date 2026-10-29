// Repair jobs to OneDrive (340 repairSyncPending / exportRepairJobSurveyPdf): photos (each in its
// category folder), the work order, and the Survey / Completed Works reports, rebuilt whenever they
// change. They go to the job's own linked folder, or a job-number subfolder of the site's folder.
// Photos are sent one at a time and marked once OneDrive has them; anything not sent is retried when
// the job is opened again or the app comes back to the front. All best-effort: never blocks a save.
import { publicUrl } from '@/lib/privateFiles';
import { buildRepairReport } from '@/lib/repairReportPdf';
import type { RepairJob } from '@/lib/rules/repairs';
import { supabase } from '@/lib/supabase';
import type { Organization } from '@/lib/types';
import { invokeAsUser } from '@/lib/userFunctions';

type Row = Record<string, any>;
const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from>; rpc: typeof supabase.rpc };
export const REPAIR_PHOTO_FOLDER: Record<string, string> = { survey: 'Survey Photos', access: 'Access Photos', scaffold: 'Scaffold Photos', progress: 'Progress Photos', completion: 'Completion Photos' };
const seg = (s: string) => String(s || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || 'Job';
/** The subfolder in the site's folder: the job number, or the address. */
export const repairJobFolder = (job: Row) => seg(String(job.job_number || '').trim() || job.address || 'Job');
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

async function target(job: Row): Promise<{ folder_id: string; drive_id?: string } | { site_id: string; prefix: string } | null> {
  if (job.onedrive_folder_id) return { folder_id: job.onedrive_folder_id, drive_id: job.onedrive_drive_id || undefined };
  const s = (await db.from('sites').select('onedrive_folder_id').eq('id', job.site_id).maybeSingle()).data as Row | null;
  return s?.onedrive_folder_id ? { site_id: job.site_id, prefix: `${repairJobFolder(job)}/` } : null;
}
async function put(t: NonNullable<Awaited<ReturnType<typeof target>>>, filename: string, bytes: Uint8Array): Promise<boolean> {
  const body = 'folder_id' in t ? { filename, content_base64: b64(bytes), folder_id: t.folder_id, drive_id: t.drive_id } : { filename: t.prefix + filename, content_base64: b64(bytes), site_id: t.site_id };
  return !(await invokeAsUser('onedrive-upload', body)).error;
}
const fetchBytes = async (path: string) => new Uint8Array(await (await fetch(publicUrl('site-photos', path))).arrayBuffer());

const running: Record<string, boolean> = {}, again: Record<string, boolean> = {};
/** Sends photos OneDrive doesn't have yet (all of them with `force`, plus the work order and the reports). */
export async function syncRepairPhotos(jobId: string, opts: { force?: boolean; onProgress?: (t: string) => void; reports?: { org: Organization | null; surveyor: string } } = {}): Promise<{ done: number; failed: number; linked: boolean }> {
  if (running[jobId]) { again[jobId] = true; return { done: 0, failed: 0, linked: true }; }
  running[jobId] = true;
  let done = 0, failed = 0, linked = false;
  try {
    const job = (await db.from('repair_jobs').select('*').eq('id', jobId).maybeSingle()).data as Row | null;
    if (!job) return { done, failed, linked };
    const t = await target(job); if (!t) return { done, failed, linked };
    linked = true;
    let q = db.from('repair_job_photos').select('*').eq('repair_job_id', jobId).is('deleted_at', null);
    if (!opts.force) q = q.is('onedrive_synced_at', null);
    const photos = ((await q.order('created_at')).data as Row[] | null) || [];
    opts.onProgress?.(`0 of ${photos.length}`);
    for (const p of photos) {
      try {
        const name = String(p.storage_path || '').split('/').pop() || `${p.id}.jpg`;
        if (await put(t, `${REPAIR_PHOTO_FOLDER[p.category] || p.category}/${name}`, await fetchBytes(p.hires_path || p.storage_path))) {
          done++;
          // Retried later if this fails; same file name, so no duplicate.
          await db.rpc('mark_repair_photos_synced' as never, { p_ids: [p.id] } as never).then(() => {}, () => {});
        } else failed++;
      } catch { failed++; }
      opts.onProgress?.(`${done + failed} of ${photos.length}`);
    }
    if (opts.force) {
      await pushWorkOrder(job as never);
      if (opts.reports) {
        if (job.survey_required === 'Y') void pushRepairReport('survey', job as never, opts.reports.org, opts.reports.surveyor);
        if (job.works_completed) void pushRepairReport('completion', job as never, opts.reports.org, '');
      }
    }
  } finally {
    running[jobId] = false;
    if (again[jobId]) { again[jobId] = false; setTimeout(() => { void syncRepairPhotos(jobId); }, 500); }
  }
  return { done, failed, linked };
}

export async function pushWorkOrder(job: RepairJob & Row): Promise<void> {
  try {
    if (!job.work_order_path) return;
    const t = await target(job); if (!t) return;
    await put(t, `Work Order/${seg(String(job.work_order_name || String(job.work_order_path).split('/').pop()))}`, await fetchBytes(job.work_order_path));
  } catch { /* OneDrive copy is best-effort */ }
}

/** Rebuilds a report and puts it in the job's OneDrive folder (best-effort, silent). */
export async function pushRepairReport(kind: 'survey' | 'completion', job: RepairJob & Row, org: Organization | null, surveyor: string): Promise<void> {
  try {
    const t = await target(job); if (!t) return;
    const site = (await db.from('sites').select('*').eq('id', job.site_id).maybeSingle()).data as never;
    const r = await buildRepairReport(kind, job, site, org, surveyor);
    if (!(await put(t, r.filename, r.bytes))) console.error(`repair ${kind} report: onedrive-upload failed`);
  } catch (e) { console.error(`repair ${kind} report failed`, e); }
}
const timers: Record<string, ReturnType<typeof setTimeout>> = {};
/** A report rebuilt 2.5 s after the last change (so a burst of saves makes one upload). */
export function scheduleRepairReport(kind: 'survey' | 'completion', jobId: string, org: Organization | null, surveyor: string) {
  const key = `${kind}:${jobId}`;
  clearTimeout(timers[key]);
  timers[key] = setTimeout(async () => {
    delete timers[key];
    const job = (await db.from('repair_jobs').select('*').eq('id', jobId).maybeSingle()).data as (RepairJob & Row) | null;
    if (job) await pushRepairReport(kind, job, org, surveyor);
  }, 2500);
}
/** After a change on the job: which reports to rebuild (only once the survey is done / works completed). */
export function repairReportsAfter(job: Row, changed: { keys?: string[]; photoCategory?: string }): ('survey' | 'completion')[] {
  const out: ('survey' | 'completion')[] = [];
  const k = changed.keys || [], cat = changed.photoCategory;
  if (job.survey_required === 'Y' && (cat === 'survey' || cat === 'access' || k.some((x) => /^(survey|access)/.test(x)))) out.push('survey');
  if (job.works_completed && (cat === 'completion' || k.some((x) => /^(works_|completed|completion)/.test(x)))) out.push('completion');
  return out;
}
