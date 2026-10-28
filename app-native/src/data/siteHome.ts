// Counts for a job's home page. Ported from renderSiteHome (330).
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { currentCycleSigs, signers } from '@/lib/rules/hs';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Doc = { id: string; resign_cycle_start: string | null; uploaded_at: string | null };

/** Price tile: only when Price is switched on for the job, and only for the admin, the job's PM, or someone given access. */
export async function canSeePrice(me: Profile, site: Site): Promise<boolean> {
  if (!site.price_enabled) return false;
  if (me.role === 'admin' || site.responsible_pm_id === me.id) return true;
  const g = await db.from('site_price_access').select('user_id').eq('site_id', site.id).eq('user_id', me.id).limit(1);
  return ((g.data as unknown[] | null) ?? []).length > 0;
}

export function useSiteHome(site: Site | undefined) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['siteHome', site?.id, me?.id],
    enabled: !!site && !!me,
    queryFn: () => cachedQuery(`siteHome:${site?.id}:${me?.id}`, async () => {
      const p = me as Profile, s = site as Site, mgr = isManager(p);
      const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const [tasks, snags, rams, myRams, mats, todos, team, cal, price] = await Promise.all([
        db.from('schedule_tasks').select('status,percent_complete').eq('site_id', s.id),
        db.from('snags').select('id').eq('site_id', s.id).eq('status', 'open'),
        db.from('rams_docs').select('id,resign_cycle_start,uploaded_at').eq('site_id', s.id).eq('status', 'current').is('subcontractor_company_id', null),
        db.from('rams_signatures').select('rams_id,signed_at,user_id').eq('user_id', p.id).order('signed_at', { ascending: false }).limit(500),
        db.from('materials').select('id').eq('site_id', s.id).in('status', ['pending', 'sent']),
        mgr ? db.from('todos').select('id').eq('site_id', s.id).eq('done', false) : Promise.resolve({ data: [], error: null }),
        mgr ? db.from('checkins').select('user_id,type').eq('site_id', s.id).order('ts', { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
        db.from('site_calendar_events').select('title').eq('site_id', s.id).eq('event_date', iso).order('created_at', { ascending: true }),
        canSeePrice(p, s),
      ]);
      const ramsDocs = orThrow(rams) as Doc[];
      const signed = new Set(currentCycleSigs((orThrow(myRams) as { rams_id: string; signed_at: string; user_id: string }[]), ramsDocs, 'rams_id', s).map((x) => x.rams_id));
      const latest: Record<string, string> = {};
      ((orThrow(team) as { user_id: string; type: string }[]) ?? []).forEach((c) => { if (!(c.user_id in latest)) latest[c.user_id] = c.type; });
      // Managers: "!" on H&S when an operative on the job still needs to sign the current RAMS or COSHH.
      let hsGap = false;
      if (mgr) {
        const [a, ops, coshh] = await Promise.all([
          db.from('site_assignments').select('user_id').eq('site_id', s.id),
          db.from('profiles').select('id').eq('role', 'operative'),
          db.from('coshh_docs').select('id,resign_cycle_start,uploaded_at').eq('site_id', s.id).is('subcontractor_company_id', null),
        ]);
        const opSet = new Set(((ops.data as { id: string }[] | null) ?? []).map((x) => x.id));
        const roster = ((a.data as { user_id: string }[] | null) ?? []).map((x) => x.user_id).filter((id) => opSet.has(id));
        const gap = async (table: string, key: 'rams_id' | 'coshh_id', docs: Doc[]) => {
          if (!docs.length || !roster.length) return false;
          const r = await db.from(table).select(`${key},user_id,signed_at`).in(key, docs.map((d) => d.id));
          const sigs = currentCycleSigs(((r.data as Record<string, string>[] | null) ?? []) as never[], docs, key as never, s) as unknown as { user_id: string; signed_at: string; [k: string]: string }[];
          return docs.some((d) => signers(roster, sigs.filter((x) => x[key] === d.id)).waiting.length > 0);
        };
        hsGap = (await gap('rams_signatures', 'rams_id', ramsDocs)) || (await gap('coshh_signatures', 'coshh_id', (coshh.data as Doc[] | null) ?? []));
      }
      const t = orThrow(tasks) as { status: string; percent_complete: number | null }[];
      return {
        tasks: t,
        openSnags: (orThrow(snags) as unknown[]).length,
        pendingRams: ramsDocs.filter((d) => !signed.has(d.id)).length,
        pendingMaterials: (orThrow(mats) as unknown[]).length,
        openTodos: ((todos.data as unknown[] | null) ?? []).length,
        onSiteCount: Object.values(latest).filter((x) => x === 'in').length,
        todayEvents: ((cal.data as { title: string }[] | null) ?? []).map((e) => e.title),
        canSeePrice: price,
        hsGap,
      };
    }),
  });
}
