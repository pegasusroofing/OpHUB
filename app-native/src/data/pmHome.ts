// PM / admin home data. Ported from 185-pm-home.js: who's on site now, open to-dos,
// reports in progress.
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type OnSite = { site_id: string; user_id: string; type: string; ts: string };

/** Everyone whose latest check-in today is an "in", on jobs I can see. Newest first so a busy day never drops someone's latest. */
export function useOnSiteNow(sites: Site[] | undefined) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['onSiteNow', me?.id],
    enabled: !!me && !!sites,
    staleTime: 30000,
    queryFn: () => cachedQuery(`onSiteNow:${me?.id}`, async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const rows = orThrow(await db.from('checkins').select('site_id,user_id,type,ts').gte('ts', start.toISOString()).order('ts', { ascending: false }).limit(1000)) as OnSite[];
      const last: Record<string, OnSite> = {};
      rows.forEach((c) => { if (c.user_id && !last[c.user_id]) last[c.user_id] = c; });
      const ids = new Set((sites ?? []).map((s) => s.id));
      return Object.values(last).filter((c) => c.type === 'in' && ids.has(c.site_id));
    }),
  });
}

export type Todo = { id: string; site_id: string | null; text: string; assigned_to: string | null; created_by: string | null; date_required_by: string | null; created_at: string };

/** Open to-dos: general ones, and on jobs I run, are assigned to, or created. */
export function usePmTodos(sites: Site[] | undefined) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['pmTodos', me?.id],
    enabled: !!me && !!sites,
    staleTime: 30000,
    queryFn: () => cachedQuery(`pmTodos:${me?.id}`, async () => {
      const p = me as Profile;
      const all = orThrow(await db.from('todos').select('id,site_id,text,assigned_to,created_by,date_required_by,created_at')
        .or(`site_id.not.is.null,org_id.eq.${p.org_id}`).eq('done', false)
        .order('date_required_by', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }).limit(500)) as Todo[];
      const mine = new Set((sites ?? []).filter((s) => s.responsible_pm_id === p.id).map((s) => s.id));
      const visible = new Set((sites ?? []).map((s) => s.id));
      return all.filter((t) => !t.site_id || (visible.has(t.site_id) && (mine.has(t.site_id) || t.assigned_to === p.id || t.created_by === p.id)));
    }),
  });
}

export type ReportRow = { id: string; site_id: string | null; template_id: string; template_name: string | null; general_label: string | null; status: string; submitted_at: string; submitted_by: string | null };

/** Reports & surveys (not daily briefings or LOLER). */
export function usePmReports() {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['pmReports', me?.id],
    enabled: !!me,
    staleTime: 30000,
    queryFn: () => cachedQuery(`pmReports:${me?.id}`, async () => {
      const p = me as Profile;
      const [subs, tpls] = await Promise.all([
        db.from('report_submissions').select('id,site_id,template_id,template_name,general_label,status,submitted_at,submitted_by').eq('org_id', p.org_id as string).order('submitted_at', { ascending: false }).limit(300),
        db.from('report_templates').select('id,is_daily_briefing,is_loler_inspection').eq('org_id', p.org_id as string),
      ]);
      const skip = new Set(((orThrow(tpls) as { id: string; is_daily_briefing: boolean; is_loler_inspection: boolean }[]) ?? []).filter((t) => t.is_daily_briefing || t.is_loler_inspection).map((t) => t.id));
      return (orThrow(subs) as ReportRow[]).filter((s) => !skip.has(s.template_id));
    }),
  });
}
