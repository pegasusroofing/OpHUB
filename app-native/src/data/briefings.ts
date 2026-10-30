// Daily briefings: list by week, read one, sign it once issued; managers start,
// fill (the report engine), issue for signing and edit until the first signature.
// Ported from 700-daily-briefings.js and renderReportView (430, fromBriefing).
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { cachedQuery, orThrow } from '@/lib/offlineCache';
import type { Answers, ReportSection } from '@/lib/rules/reports';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

import type { Template } from './reports';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type Submission = {
  id: string; template_id: string; site_id: string; template_name: string; sections: ReportSection[]; answers: Answers;
  submitted_by: string | null; submitted_at: string; status: string; issued_at: string | null;
};
export type BriefingSig = { id: string; submission_id: string; user_id: string; signature_image_path: string | null; signed_at: string };

export function useBriefings(siteId: string | undefined) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['briefings', siteId],
    enabled: !!siteId && !!me,
    queryFn: () => cachedQuery(`briefings:${siteId}`, async () => {
      const t = await db.from('report_templates').select('id').eq('org_id', (me as Profile).org_id as string).eq('is_daily_briefing', true).eq('archived', false);
      const ids = ((orThrow(t) as { id: string }[]) ?? []).map((x) => x.id);
      if (!ids.length) return { subs: [] as Submission[], sigs: [] as BriefingSig[], hasTemplate: false };
      const s = await db.from('report_submissions').select('id,template_id,site_id,template_name,submitted_by,submitted_at,status,issued_at').eq('site_id', siteId as string).in('template_id', ids).order('submitted_at', { ascending: false });
      const subs = orThrow(s) as Submission[];
      const g = subs.length ? await db.from('daily_briefing_signatures').select('*').in('submission_id', subs.map((x) => x.id)) : { data: [], error: null };
      return { subs, sigs: orThrow(g) as BriefingSig[], hasTemplate: true };
    }),
  });
}

export function useBriefing(subId: string | undefined) {
  return useQuery({
    queryKey: ['briefing', subId],
    enabled: !!subId,
    queryFn: () => cachedQuery(`briefing:${subId}`, async () => {
      const [s, g] = await Promise.all([
        db.from('report_submissions').select('*').eq('id', subId as string).limit(1),
        db.from('daily_briefing_signatures').select('*').eq('submission_id', subId as string).order('signed_at', { ascending: true }),
      ]);
      const sub = ((orThrow(s) as Submission[]) ?? [])[0] ?? null;
      // "Show unanswered questions" follows the template as it is now (as today).
      if (sub?.template_id && sub.sections?.[0]) {
        const live = await db.from('report_templates').select('sections').eq('id', sub.template_id).limit(1);
        const first = ((live.data as { sections: ReportSection[] }[] | null) ?? [])[0]?.sections?.[0];
        if (first) { if (first.showUnanswered === false) sub.sections[0].showUnanswered = false; else delete sub.sections[0].showUnanswered; }
      }
      return { sub, sigs: orThrow(g) as BriefingSig[] };
    }),
  });
}

export async function signBriefing(me: Profile & { signature_path?: string | null }, subId: string): Promise<{ ok: boolean; needSignature?: boolean; msg: string }> {
  if (!me.signature_path) return { ok: false, needSignature: true, msg: "Adopt your signature first — one tap and it's used everywhere." };
  const r = await db.from('daily_briefing_signatures').insert({ submission_id: subId, user_id: me.id, signature_image_path: me.signature_path } as never);
  return r.error ? { ok: false, msg: 'Could not save — check your signal and try again.' } : { ok: true, msg: 'Signed' };
}

/* ---------- manager side (700) ---------- */
/** The company's Daily Briefing template (the first one flagged), if any. */
export async function briefingTemplate(orgId: string) {
  const r = await db.from('report_templates').select('*').eq('org_id', orgId).eq('is_daily_briefing', true).eq('archived', false).order('name').limit(1);
  return ((r.data as Template[] | null) ?? [])[0] ?? null;
}
export async function issueBriefing(me: Profile, subId: string) {
  return !!(await db.from('report_submissions').update({ issued_at: new Date().toISOString(), issued_by: me.id } as never).eq('id', subId).select('id')).data?.length;
}
/** Admins can remove a briefing that was started but never completed. */
/** An unfinished briefing deleted by an admin, written to the job's Activity History (700 deleteBriefingSubmission). */
export async function deleteBriefing(subId: string, me?: Profile, siteId?: string, name?: string | null) {
  const ok = !(await db.from('report_submissions').delete().eq('id', subId).eq('status', 'in_progress')).error;
  if (ok && me?.org_id && siteId) void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action: 'briefing_submission_deleted', description: `Deleted daily briefing "${name || ''}"` } as never).then(undefined, () => undefined);
  return ok;
}
