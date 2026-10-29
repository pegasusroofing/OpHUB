// The HUB (200 computeHubItems): one list of everything a manager needs to act on
// across live and upcoming jobs — Toolbox Talk due this month, open snags, RAMS /
// COSHH not signed by operatives (once work has started), open to-dos, new
// Schedule of Works photos, and unread manager messages. Defaults to the jobs you
// run (or are assigned to); can switch to all PMs or one colleague.
import { useQuery } from '@tanstack/react-query';

import { siteStatusKey } from '@/lib/rules/checkin';
import { currentCycleSigs } from '@/lib/rules/hs';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type HubItem = { key: string; type: 'tbt' | 'snag' | 'rams' | 'coshh' | 'task' | 'sowphoto' | 'message'; typeLbl: string; label: string; siteId: string | null; siteName: string; due: Date | null; at: Date | null; route: string };

const rows = <T,>(r: { data: unknown }) => ((r.data as T[] | null) ?? []);

export function useHub(me: Profile | null, allSites: Site[] | undefined, pmId: string) {
  return useQuery({
    queryKey: ['hub', me?.id, pmId, (allSites ?? []).length],
    enabled: !!me && !!allSites,
    queryFn: async () => {
      const p = me as Profile;
      const open = (allSites ?? []).filter((s) => ['live', 'upcoming'].includes(siteStatusKey(s)));
      let sites = open;
      if (pmId !== 'all') {
        const who = pmId || p.id;
        const mine = new Set(rows<{ site_id: string }>(await db.from('site_assignments').select('site_id').eq('user_id', who)).map((a) => a.site_id));
        sites = open.filter((s) => s.responsible_pm_id === who || mine.has(s.id));
      }
      const ids = sites.map((s) => s.id);
      if (!ids.length) return { items: [] as HubItem[], sites };
      const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a: object) => Promise<{ data: unknown; error: unknown }>;
      const since = new Date(Date.now() - 180 * 864e5).toISOString();
      const [rams, coshh, talks, snags, tasks, assigned, todos, msgs, ops, alerts] = await Promise.all([
        db.from('rams_docs').select('id,site_id,uploaded_at,resign_cycle_start').eq('status', 'current').in('site_id', ids).is('subcontractor_company_id', null),
        db.from('coshh_docs').select('id,site_id,uploaded_at,resign_cycle_start').in('site_id', ids).is('subcontractor_company_id', null),
        db.from('toolbox_talks').select('id,site_id,status,created_at').in('site_id', ids).is('subcontractor_company_id', null),
        db.from('snags').select('id,site_id,created_at').in('site_id', ids).eq('status', 'open'),
        db.from('schedule_tasks').select('site_id,status').in('site_id', ids),
        db.from('site_assignments').select('site_id,user_id').in('site_id', ids),
        db.from('todos').select('id,site_id,text,date_required_by').in('site_id', ids).eq('done', false).order('created_at'),
        db.from('messages').select('id,site_id,created_at').eq('audience', 'managers').or(`site_id.in.(${ids.join(',')}),site_id.is.null`).neq('sender_id', p.id).gte('created_at', since),
        db.from('profiles').select('id').eq('role', 'operative'),
        // A database request has then() but no catch(): wrapped so a failure here can't empty the whole HUB.
        Promise.resolve(rpc('sow_photo_alerts', {})).catch(() => ({ data: [], error: null })),
      ]);
      type Doc = { id: string; site_id: string; uploaded_at: string; resign_cycle_start: string | null };
      const ramsD = rows<Doc>(rams), coshhD = rows<Doc>(coshh);
      const [rs, cs] = await Promise.all([
        ramsD.length ? db.from('rams_signatures').select('rams_id,user_id,signed_at').in('rams_id', ramsD.map((d) => d.id)) : Promise.resolve({ data: [] }),
        coshhD.length ? db.from('coshh_signatures').select('coshh_id,user_id,signed_at').in('coshh_id', coshhD.map((d) => d.id)) : Promise.resolve({ data: [] }),
      ]);
      const msgList = rows<{ id: string; site_id: string | null; created_at: string }>(msgs);
      const readIds = new Set<string>();
      for (let i = 0; i < msgList.length; i += 120) {
        rows<{ message_id: string }>(await db.from('message_reads').select('message_id').eq('user_id', p.id).in('message_id', msgList.slice(i, i + 120).map((m) => m.id))).forEach((r) => readIds.add(r.message_id));
      }
      const opSet = new Set(rows<{ id: string }>(ops).map((o) => o.id));
      const roster: Record<string, string[]> = {};
      rows<{ site_id: string; user_id: string }>(assigned).forEach((a) => { if (opSet.has(a.user_id)) (roster[a.site_id] ||= []).push(a.user_id); });
      const started = new Set(rows<{ site_id: string; status: string }>(tasks).filter((t) => t.status && t.status !== 'todo').map((t) => t.site_id));
      const live = { status: 'active' };
      const rsCur = currentCycleSigs(rows<{ rams_id: string; user_id: string; signed_at: string }>(rs), ramsD, 'rams_id', live);
      const csCur = currentCycleSigs(rows<{ coshh_id: string; user_id: string; signed_at: string }>(cs), coshhD, 'coshh_id', live);
      const missing = (siteId: string, docs: Doc[], sigs: { user_id: string; [k: string]: string }[], key: string) => {
        let n = 0;
        docs.filter((d) => d.site_id === siteId).forEach((d) => { const who = new Set(sigs.filter((s) => s[key] === d.id).map((s) => s.user_id)); n += (roster[siteId] ?? []).filter((u) => !who.has(u)).length; });
        return n;
      };
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const dueTbt = new Date(now.getFullYear(), now.getMonth(), 7, 23, 59, 59);
      const talkList = rows<{ site_id: string; status: string; created_at: string }>(talks);
      const items: HubItem[] = [];
      for (const s of sites) {
        const t = talkList.filter((x) => x.site_id === s.id);
        const issued = t.some((x) => (x.status === 'live' || x.status === 'completed') && new Date(x.created_at) >= monthStart);
        const ever = t.some((x) => x.status === 'completed');
        if (siteStatusKey(s) === 'live' && (!issued || !ever)) items.push({ key: `tbt-${s.id}`, type: 'tbt', typeLbl: 'Toolbox Talk', label: ever ? 'Toolbox Talk due for this month' : 'Toolbox Talk — none ever completed at this site', siteId: s.id, siteName: s.name, due: dueTbt, at: null, route: `/sites/${s.id}/hs/tbt` });
        rows<{ id: string; site_id: string }>(snags).filter((x) => x.site_id === s.id).forEach((x) => items.push({ key: `snag-${x.id}`, type: 'snag', typeLbl: 'Snag', label: 'Open snag', siteId: s.id, siteName: s.name, due: null, at: null, route: `/sites/${s.id}/snagging/list` }));
        if (started.has(s.id)) {
          const r = missing(s.id, ramsD, rsCur as never, 'rams_id');
          if (r) items.push({ key: `rams-${s.id}`, type: 'rams', typeLbl: 'RAMS', label: `RAMS not signed by operatives (${r})`, siteId: s.id, siteName: s.name, due: null, at: null, route: `/sites/${s.id}/hs/rams` });
          const c = missing(s.id, coshhD, csCur as never, 'coshh_id');
          if (c) items.push({ key: `coshh-${s.id}`, type: 'coshh', typeLbl: 'COSHH', label: `COSHH not signed by operatives (${c})`, siteId: s.id, siteName: s.name, due: null, at: null, route: `/sites/${s.id}/hs/coshh` });
        }
      }
      rows<{ id: string; site_id: string; text: string; date_required_by: string | null }>(todos).forEach((t) => {
        const s = sites.find((x) => x.id === t.site_id);
        if (s) items.push({ key: `task-${t.id}`, type: 'task', typeLbl: 'Task', label: t.text, siteId: s.id, siteName: s.name, due: t.date_required_by ? new Date(`${t.date_required_by}T00:00:00`) : null, at: null, route: `/sites/${s.id}/todos` });
      });
      (Array.isArray(alerts.data) ? (alerts.data as { site_id: string; photos: number; latest: string }[]) : []).forEach((a) => {
        const s = sites.find((x) => x.id === a.site_id);
        if (s) items.push({ key: `sow-${s.id}`, type: 'sowphoto', typeLbl: 'SOW photos', label: `${a.photos} new photo${a.photos === 1 ? '' : 's'} on the Schedule of Works`, siteId: s.id, siteName: s.name, due: null, at: new Date(a.latest), route: `/sites/${s.id}/schedule` });
      });
      msgList.filter((m) => !readIds.has(m.id)).forEach((m) => {
        const s = m.site_id ? sites.find((x) => x.id === m.site_id) : null;
        items.push({ key: `msg-${m.id}`, type: 'message', typeLbl: 'Message', label: s ? 'New message' : 'New message (all sites)', siteId: m.site_id, siteName: s ? s.name : 'All sites', due: null, at: new Date(m.created_at), route: s ? `/sites/${s.id}/messages` : '/inbox' });
      });
      items.sort((a, b) => (a.due && b.due ? +a.due - +b.due : a.due ? -1 : b.due ? 1 : a.at && b.at ? +b.at - +a.at : a.at ? -1 : b.at ? 1 : 0));
      return { items, sites };
    },
  });
}
