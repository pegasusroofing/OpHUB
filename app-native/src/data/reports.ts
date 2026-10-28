// Reports & inspections (430): start one from a company template, fill it in (photos
// upload as you go and the answers save in the background), save & exit, complete,
// edit a completed one (kept as edit history), delete. Daily briefings and LOLER use
// the same engine. Templates are built in the Admin Centre (phase 3).
import { useQuery } from '@tanstack/react-query';

import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { publicUrl } from '@/lib/privateFiles';
import { localISODate } from '@/lib/rules/driver';
import { autofillValue, type Answers, type ReportSection } from '@/lib/rules/reports';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type Template = { id: string; name: string; description: string | null; sections: ReportSection[]; is_daily_briefing?: boolean; is_mc_inspection?: boolean; is_loler_inspection?: boolean };
export type Sub = {
  id: string; site_id: string | null; template_id: string | null; template_name: string; sections: ReportSection[]; answers: Answers;
  status: string; submitted_by: string | null; submitted_at: string | null; plant_item_id?: string | null; issued_at?: string | null;
};

export function useTemplates(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['reportTemplates', orgId],
    enabled: !!orgId,
    queryFn: () => cachedQuery(`reportTemplates:${orgId}`, async () => orThrow(await db.from('report_templates').select('*').eq('org_id', orgId as string).eq('archived', false).order('name')) as Template[]),
  });
}

/** A job's reports, leaving out daily briefings (they live under H&S). */
export function useSiteReports(siteId: string | undefined, orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['reports', siteId],
    enabled: !!siteId && !!orgId,
    queryFn: () => cachedQuery(`reports:${siteId}`, async () => {
      const b = await db.from('report_templates').select('id').eq('org_id', orgId as string).eq('is_daily_briefing', true);
      const briefing = new Set(((b.data as { id: string }[] | null) ?? []).map((x) => x.id));
      const subs = orThrow(await db.from('report_submissions').select('id,site_id,template_id,template_name,status,submitted_by,submitted_at').eq('site_id', siteId as string).order('submitted_at', { ascending: false }).limit(100)) as Sub[];
      return subs.filter((s) => !s.template_id || !briefing.has(s.template_id));
    }),
  });
}

export function useSubmission(id: string | undefined) {
  return useQuery({
    queryKey: ['reportSub', id],
    enabled: !!id,
    queryFn: () => cachedQuery(`reportSub:${id}`, async () => {
      const r = orThrow(await db.from('report_submissions').select('*').eq('id', id as string).limit(1)) as Sub[];
      const sub = r[0] ?? null;
      let isBriefing = false; let signed = false;
      if (sub?.template_id) {
        const t = await db.from('report_templates').select('is_daily_briefing').eq('id', sub.template_id).limit(1);
        isBriefing = !!((t.data as { is_daily_briefing?: boolean }[] | null) ?? [])[0]?.is_daily_briefing;
        if (isBriefing) signed = ((await db.from('daily_briefing_signatures').select('id').eq('submission_id', sub.id).limit(1)).data ?? []).length > 0;
      }
      return { sub, isBriefing, signed };
    }),
  });
}

export async function startReport(me: Profile, site: Site, t: Template, extra: Record<string, unknown> = {}, preset: Answers = {}): Promise<string | null> {
  const answers: Answers = { ...preset };
  const ctx = { siteAddress: fullSiteAddress(site) || '', today: localISODate(new Date()), me: me.name || '' };
  (t.sections || []).forEach((s) => (s.items || []).forEach((it) => {
    if (!it.autofill) return;
    const v = autofillValue(it.autofill, ctx);
    if (v !== undefined) answers[it.id] = v;
  }));
  const r = await db.from('report_submissions').insert({
    template_id: t.id, org_id: me.org_id, site_id: site.id, template_name: t.name, sections: t.sections, answers, submitted_by: me.id, status: 'in_progress', ...extra,
  } as never).select('id').single();
  return (r.data as { id: string } | null)?.id ?? null;
}

/** "Operatives on site" starts as everyone assigned to the job, ticked. */
export async function defaultOperatives(siteId: string) {
  const [a, p] = await Promise.all([db.from('site_assignments').select('user_id').eq('site_id', siteId), db.from('profiles').select('id,name,role').eq('role', 'operative')]);
  const on = new Set(((a.data as { user_id: string }[] | null) ?? []).map((x) => x.user_id));
  return (((p.data as { id: string; name: string }[] | null) ?? []).filter((x) => on.has(x.id)).sort((x, y) => x.name.localeCompare(y.name)))
    .map((x) => ({ id: `${Date.now()}${x.id.slice(0, 6)}`, userId: x.id, name: x.name, role: '', included: true }));
}

const isLocal = (v: unknown) => typeof v === 'string' && !/^https?:\/\//.test(v) && (v.startsWith('file:') || v.startsWith('blob:') || v.startsWith('data:') || v.startsWith('content:') || v.startsWith('ph:'));

/** Photos still only on this phone. */
export function pendingPhotos(answers: Answers): number {
  return Object.values(answers).reduce<number>((n, v) => n + (Array.isArray(v) ? v.filter(isLocal).length : 0), 0);
}

/** Photos are compressed when picked. Uploads waiting ones three at a time, writing each URL back as soon as it lands. */
export async function uploadPhotos(siteId: string, answers: Answers, onStep?: (done: number, total: number, failed: number) => void): Promise<{ total: number; failed: number }> {
  const refs: { k: string; val: string }[] = [];
  Object.entries(answers).forEach(([k, v]) => { if (Array.isArray(v)) v.forEach((x) => { if (isLocal(x)) refs.push({ k, val: x as string }); }); });
  let next = 0, done = 0, failed = 0;
  const worker = async () => {
    while (next < refs.length) {
      const r = refs[next++];
      let url: string | null = null;
      try {
        const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${next}`;
        const up = await supabase.storage.from('site-photos').upload(`${siteId}/reports/${rid}.jpg`, await (await fetch(r.val)).arrayBuffer(), { contentType: 'image/jpeg' });
        if (!up.error) url = publicUrl('site-photos', up.data.path);
      } catch { url = null; }
      const arr = answers[r.k];
      if (url && Array.isArray(arr)) { const at = arr.indexOf(r.val); if (at > -1) arr[at] = url; } else if (!url) failed++;
      done++; onStep?.(done, refs.length, failed);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { total: refs.length, failed };
}

/** Saves the answers as they stand, leaving out photos not uploaded yet. */
export async function saveAnswers(id: string, answers: Answers, sections?: ReportSection[]): Promise<boolean> {
  const out: Answers = {};
  Object.entries(answers).forEach(([k, v]) => { out[k] = Array.isArray(v) ? v.filter((x) => !isLocal(x)) : v; });
  const r = await db.from('report_submissions').update({ answers: out, ...(sections ? { sections } : {}) } as never).eq('id', id).select('id');
  return !r.error && !!(r.data as unknown[] | null)?.length;
}

/**
 * Completes the report. A manager editing an already-completed one keeps the
 * original submitter/time and adds to the edit history; signatures are only
 * filled where still empty, so nobody else's is replaced. A LOLER inspection on
 * a plant item moves that item's last / next inspection dates on.
 */
export async function completeReport(me: Profile & { signature_path?: string | null }, sub: Sub, answers: Answers, sections: ReportSection[], editingCompleted: boolean, sectionsChanged: boolean): Promise<boolean> {
  const a: Answers = { ...answers };
  sections.forEach((s) => (s.items || []).forEach((it) => { if (it.type === 'signature' && me.signature_path && (!editingCompleted || !a[it.id])) a[it.id] = me.signature_path; }));
  const payload: Record<string, unknown> = editingCompleted
    ? { answers: { ...a, _editHistory: [...(Array.isArray(a._editHistory) ? (a._editHistory as unknown[]) : []), { by: me.id, byName: me.name, at: new Date().toISOString() }] }, status: 'completed' }
    : { answers: a, status: 'completed', submitted_at: new Date().toISOString() };
  if (sectionsChanged) payload.sections = sections;
  const r = await db.from('report_submissions').update(payload as never).eq('id', sub.id).select('id');
  if (r.error || !(r.data as unknown[] | null)?.length) return false;
  if (sub.plant_item_id) {
    try {
      const p = ((await db.from('plant_items').select('id,inspection_interval_months').eq('id', sub.plant_item_id).limit(1)).data as { id: string; inspection_interval_months: number | null }[] | null)?.[0];
      if (p) {
        const due = new Date(); due.setMonth(due.getMonth() + (p.inspection_interval_months || 12));
        await db.from('plant_items').update({ last_inspection_date: localISODate(new Date()), next_inspection_due: localISODate(due) } as never).eq('id', p.id);
      }
    } catch { /* the inspection itself is saved */ }
  }
  return true;
}

export async function deleteReports(me: Profile, siteId: string, ids: string[]): Promise<number> {
  let n = 0;
  for (const id of ids) if (!(await db.from('report_submissions').delete().eq('id', id)).error) n++;
  if (n && me.org_id) void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action: 'reports_deleted', description: `Deleted ${n} report${n > 1 ? 's' : ''} / inspection${n > 1 ? 's' : ''}` } as never);
  return n;
}

/* ---------- LOLER (750): lifting equipment, tied to a plant register item or a one-off name ---------- */
export type PlantItem = { id: string; name: string; description: string | null; serial_number: string | null };
export function useLoler(siteId: string | undefined, orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['loler', siteId],
    enabled: !!siteId && !!orgId,
    queryFn: () => cachedQuery(`loler:${siteId}`, async () => {
      const tpls = orThrow(await db.from('report_templates').select('*').eq('org_id', orgId as string).eq('is_loler_inspection', true).eq('archived', false).order('name')) as Template[];
      const subs = tpls.length ? orThrow(await db.from('report_submissions').select('id,template_id,template_name,status,submitted_by,submitted_at,answers').eq('site_id', siteId as string).in('template_id', tpls.map((t) => t.id)).order('submitted_at', { ascending: false }).limit(100)) as Sub[] : [];
      return { template: tpls[0] ?? null, subs };
    }),
  });
}
export function usePlantItems(orgId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['plantItems', orgId],
    enabled: !!orgId && enabled,
    queryFn: async () => orThrow(await db.from('plant_items').select('id,name,description,serial_number').eq('org_id', orgId as string).order('name')) as PlantItem[],
  });
}
/** The template's fixed equipment questions are pre-filled from the plant item (or the typed name). */
export function startLoler(me: Profile, site: Site, t: Template, item: PlantItem | null, manualName: string | null) {
  const preset: Answers = {};
  if (item) { preset.loler_make_model = item.name; if (item.description) preset.loler_equipment_desc = item.description; if (item.serial_number) preset.loler_serial = item.serial_number; }
  else if (manualName) preset.loler_make_model = manualName;
  return startReport(me, site, t, { plant_item_id: item?.id ?? null }, preset);
}
