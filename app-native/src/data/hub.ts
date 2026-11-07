// The HUB (200 computeHubItems): one list of everything a manager needs to act on
// across live and upcoming jobs — Toolbox Talk due this month, open snags, RAMS /
// COSHH not signed by operatives (once work has started), open to-dos, new
// Schedule of Works photos, and unread manager messages. Defaults to the jobs you
// run (or are assigned to); can switch to all PMs or one colleague.
// 7 Nov 2026 (Andy): it also pulls in Finance — purchase invoices and expense receipts sent to you to book, wages
// waiting on your jobs' prices, invoice queries and PM replies, and (for Finance users) Finance's own to-do list —
// and "tagged you" messages from the Company Chat. Each item is Projects, Finance or Chat (the HUB's tabs), and
// each one drops off by itself once it's dealt with (booked, replied to, signed, read…).
import { useQuery } from '@tanstack/react-query';

import { isChatTag, useChatUnread } from '@/data/companyChat';
import { useFinOverview } from '@/data/finance';
import { msgDest, SPECIAL_LABEL } from '@/data/siteMessages';
import { isFinanceUser, isManager } from '@/lib/roles';
import { siteStatusKey } from '@/lib/rules/checkin';
import { currentCycleSigs } from '@/lib/rules/hs';
import { supabase } from '@/lib/supabase';
import type { Organization, Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type HubArea = 'projects' | 'finance' | 'chat';
/** markRead: a message that counts as dealt with once it's opened (so tapping it in the HUB marks it read). */
export type HubItem = { key: string; type: 'tbt' | 'snag' | 'rams' | 'coshh' | 'task' | 'sowphoto' | 'message' | 'fin_book' | 'fin_rcpt' | 'fin_wage' | 'fin_query' | 'fin_reply' | 'fin_todo' | 'chat_tag'; area: HubArea; typeLbl: string; label: string; siteId: string | null; siteName: string; due: Date | null; at: Date | null; route: string; amount?: number | null; markRead?: string };
/** Where the Company Chat is: the HUB for managers, Inbox for everyone else. */
export const chatRoute = (me: Profile | null) => (isManager(me) ? '/pm/hub?tab=chat' : '/inbox?tab=chat');
type Row = Record<string, any>;

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
      // 9219zr (PB-07): unread messages sent to me alone (delivery problems, invoice queries, time off,
      // delivery assigned, sub form…) — on my own HUB (or All), not when looking at a colleague's.
      const direct: HubItem[] = [];
      if (pmId === '' || pmId === p.id || pmId === 'all') {
        const since0 = new Date(Date.now() - 180 * 864e5).toISOString();
        const dm = rows<{ id: string; site_id: string | null; kind: string; body: string | null; related_id: string | null; created_at: string }>(await db.from('messages').select('id,site_id,kind,body,related_id,created_at').eq('audience', 'single').eq('recipient_id', p.id).neq('sender_id', p.id).is('parent_id', null).gte('created_at', since0).order('created_at', { ascending: false }).limit(50));
        const read = dm.length ? new Set(rows<{ message_id: string }>(await db.from('message_reads').select('message_id').eq('user_id', p.id).in('message_id', dm.map((m) => m.id))).map((r) => r.message_id)) : new Set<string>();
        dm.filter((m) => !read.has(m.id)).forEach((m) => {
          const s = m.site_id ? (allSites ?? []).find((x) => x.id === m.site_id) : null;
          const at = new Date(m.created_at);
          // Tagged in the Company Chat: cleared by opening the chat.
          if (isChatTag(m.body)) { direct.push({ key: `dm-${m.id}`, type: 'chat_tag', area: 'chat', typeLbl: 'Tagged You', label: String(m.body).slice(0, 160), siteId: null, siteName: 'Company Chat', due: null, at, route: chatRoute(p) }); return; }
          const lbl = SPECIAL_LABEL[m.kind]?.replace(/\b\w/g, (c) => c.toUpperCase()); // Invoice Query, Delivery Problem
          const fin = m.kind === 'pi_query' || m.kind === 'pi_query_reply';
          // An invoice query stays until you reply on its page (or the office sorts it); everything else once it's opened.
          direct.push({ key: `dm-${m.id}`, type: m.kind === 'pi_query' ? 'fin_query' : m.kind === 'pi_query_reply' ? 'fin_reply' : 'message', area: fin ? 'finance' : 'projects', typeLbl: m.kind === 'pi_query_reply' ? 'PM Reply' : lbl || 'Message', label: String(m.body || lbl || 'New message').slice(0, 120), siteId: m.site_id, siteName: s ? s.name : fin ? 'Finance' : 'All sites', due: null, at, route: msgDest(m, p) || (s ? `/sites/${s.id}/messages` : '/inbox'), markRead: m.kind === 'pi_query' ? undefined : m.id });
        });
        // Finance: invoices and receipts sent to you to book (gone once booked or sent back), and wages waiting to go
        // against a price on your jobs (gone once booked). Admins see every job's wages, as on To Book.
        if (isManager(p)) {
        const [inb, wp] = await Promise.all([
          db.from('fin_inbox').select('id,site_id,file_name,extracted,assigned_at,received_at').eq('assigned_pm', p.id).eq('status', 'new').order('assigned_at'),
          db.from('wage_pushes').select('id,site_id,amount,week_start').eq('status', 'pending'),
        ]);
        rows<Row>(inb).forEach((it) => {
          const ex = (it.extracted || {}) as Row, rc = ex.receipt === true;
          const s = it.site_id ? (allSites ?? []).find((x) => x.id === it.site_id) : null;
          const what = rc ? `Receipt from ${ex.sent_by || 'the team'}${ex.label ? ` — ${ex.label}` : ''}` : `${ex.supplier || it.file_name || 'Supplier invoice'}${ex.invoice_no ? ` — Inv ${ex.invoice_no}` : ''}`;
          direct.push({ key: `fi-${it.id}`, type: rc ? 'fin_rcpt' : 'fin_book', area: 'finance', typeLbl: rc ? 'Expense Receipt To Book' : 'Purchase Invoice To Book', label: what, siteId: s?.id ?? null, siteName: s ? s.name : rc ? 'Job not chosen yet' : 'Choose the job', due: null, at: new Date(it.assigned_at || it.received_at || Date.now()), route: rc ? `/fin/inbox/${it.id}` : '/pm/tobook', amount: ex.total != null && ex.total !== '' ? Number(ex.total) : null });
        });
        const wageSites = (allSites ?? []).filter((s) => pmId === 'all' || p.role === 'admin' || (s as Site & { responsible_pm_id?: string | null }).responsible_pm_id === p.id);
        const wBy: Record<string, Row[]> = {};
        rows<Row>(wp).forEach((w) => { if (wageSites.some((s) => s.id === w.site_id)) (wBy[w.site_id] ||= []).push(w); });
        Object.entries(wBy).forEach(([sid, ws]) => {
          const s = wageSites.find((x) => x.id === sid);
          direct.push({ key: `fw-${sid}`, type: 'fin_wage', area: 'finance', typeLbl: 'Wages To Book', label: `${ws.length} week${ws.length === 1 ? '' : 's'} of wages to put against a price`, siteId: sid, siteName: s?.name || 'Job', due: null, at: null, route: `/sites/${sid}/price`, amount: ws.reduce((t, w) => t + Number(w.amount || 0), 0) });
        });
        }
      }
      if (!ids.length) return { items: direct, sites };
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
        if (siteStatusKey(s) === 'live' && (!issued || !ever)) items.push({ key: `tbt-${s.id}`, type: 'tbt', area: 'projects', typeLbl: 'Toolbox Talk', label: ever ? 'Toolbox Talk due for this month' : 'Toolbox Talk — none ever completed at this site', siteId: s.id, siteName: s.name, due: dueTbt, at: null, route: `/sites/${s.id}/hs/tbt` });
        rows<{ id: string; site_id: string }>(snags).filter((x) => x.site_id === s.id).forEach((x) => items.push({ key: `snag-${x.id}`, type: 'snag', area: 'projects', typeLbl: 'Snag', label: 'Open snag', siteId: s.id, siteName: s.name, due: null, at: null, route: `/sites/${s.id}/snagging/list` }));
        if (started.has(s.id)) {
          const r = missing(s.id, ramsD, rsCur as never, 'rams_id');
          if (r) items.push({ key: `rams-${s.id}`, type: 'rams', area: 'projects', typeLbl: 'RAMS', label: `RAMS not signed by operatives (${r})`, siteId: s.id, siteName: s.name, due: null, at: null, route: `/sites/${s.id}/hs/rams` });
          const c = missing(s.id, coshhD, csCur as never, 'coshh_id');
          if (c) items.push({ key: `coshh-${s.id}`, type: 'coshh', area: 'projects', typeLbl: 'COSHH', label: `COSHH not signed by operatives (${c})`, siteId: s.id, siteName: s.name, due: null, at: null, route: `/sites/${s.id}/hs/coshh` });
        }
      }
      rows<{ id: string; site_id: string; text: string; date_required_by: string | null }>(todos).forEach((t) => {
        const s = sites.find((x) => x.id === t.site_id);
        if (s) items.push({ key: `task-${t.id}`, type: 'task', area: 'projects', typeLbl: 'Task', label: t.text, siteId: s.id, siteName: s.name, due: t.date_required_by ? new Date(`${t.date_required_by}T00:00:00`) : null, at: null, route: `/sites/${s.id}/todos` });
      });
      (Array.isArray(alerts.data) ? (alerts.data as { site_id: string; photos: number; latest: string }[]) : []).forEach((a) => {
        const s = sites.find((x) => x.id === a.site_id);
        if (s) items.push({ key: `sow-${s.id}`, type: 'sowphoto', area: 'projects', typeLbl: 'SOW photos', label: `${a.photos} new photo${a.photos === 1 ? '' : 's'} on the Schedule of Works`, siteId: s.id, siteName: s.name, due: null, at: new Date(a.latest), route: `/sites/${s.id}/schedule` });
      });
      msgList.filter((m) => !readIds.has(m.id)).forEach((m) => {
        const s = m.site_id ? sites.find((x) => x.id === m.site_id) : null;
        items.push({ key: `msg-${m.id}`, type: 'message', area: 'projects', typeLbl: 'Message', label: s ? 'New message' : 'New message (all sites)', siteId: m.site_id, siteName: s ? s.name : 'All sites', due: null, at: new Date(m.created_at), route: s ? `/sites/${s.id}/messages` : '/inbox', markRead: m.id });
      });
      items.push(...direct);
      items.sort((a, b) => (a.due && b.due ? +a.due - +b.due : a.due ? -1 : b.due ? 1 : a.at && b.at ? +b.at - +a.at : a.at ? -1 : b.at ? 1 : 0));
      return { items, sites };
    },
  });
}

/** The whole HUB: the list above, plus Finance's to-do list for Finance users (looking at their own HUB), and the
 *  Company Chat's unread count. Used by the HUB page and the menu's red count. */
export function useHubAll(me: Profile | null, org: Organization | null, allSites: Site[] | undefined, pmId: string) {
  const hub = useHub(me, allSites, pmId);
  const own = pmId === '' || pmId === 'all' || pmId === me?.id;
  const fin = useFinOverview(own && isFinanceUser(me, org) ? me : null, allSites);
  const chat = useChatUnread(me);
  const todos: HubItem[] = (fin.data?.todo ?? []).map((t) => ({ key: `ft-${t.t}`, type: 'fin_todo', area: 'finance', typeLbl: 'Finance To Do', label: `${t.t} (${t.n})`, siteId: null, siteName: t.s, due: null, at: null, route: t.go }));
  const items = [...(hub.data?.items ?? []), ...todos];
  return {
    items, sites: hub.data?.sites ?? [], chatUnread: chat.data ?? 0, isLoading: hub.isLoading, isRefetching: hub.isRefetching,
    refetch: () => { void hub.refetch(); if (fin.data) void fin.refetch(); void chat.refetch(); },
  };
}
