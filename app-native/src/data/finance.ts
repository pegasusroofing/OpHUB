// Finance data (900 / 914): settings, paged reads, the TRIAL guard on every
// server function, and the Overview numbers. Everything here reads; the
// trial switch stops anything going out (emails, Xero, inbox, PM pushes).
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { addDays, appOverdueFor, FIN_DEFAULTS, finBlocked, FIN_TRIAL_MSG, INV_OPEN, invOutstandingNet, invOverdue, jobTag, plantCost, retentionAlerts, retentionStillHeld, today, type FinApp, type FinInv, type FinSettings, type JobFin } from '@/lib/rules/finance';
import { siteStatusKey } from '@/lib/rules/checkin';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

export const fdb = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Q = ReturnType<ReturnType<typeof supabase.from>['select']>;

/** Every row (1000 at a time), so big companies never lose rows past the first page. */
export async function selectAll<T>(table: string, cols: string, filter: (q: Q) => Q): Promise<T[]> {
  // These two have no id column — paging by id there failed, so they came back empty.
  const key = table === 'job_finance' ? 'site_id' : table === 'yard_stock_rates' ? 'stock_id' : 'id';
  const page = async (off: number) => ((await filter(fdb.from(table).select(cols) as Q).order(key).range(off, off + 999)).data as T[] | null) ?? [];
  let out = await page(0);
  if (out.length < 1000) return out;
  // More than 1000: the next four pages together, and four more while the last one comes back full (speed review,
  // 15 Nov 2026: one page after another, so 3,000 invoices took three trips).
  for (let off = 1000; off < 500000; off += 4000) {
    const pages = await Promise.all([0, 1, 2, 3].map((k) => page(off + k * 1000)));
    let short = false;
    for (const p of pages) { if (short) break; out = out.concat(p); if (p.length < 1000) short = true; }
    if (short) break;
  }
  return out;
}
/** Calls a server function — unless the Finance trial blocks it. */
export async function finInvoke<T = unknown>(me: Profile, fn: string, body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  if (finBlocked(fn, body.action as string | undefined, me.org_id)) return { data: null, error: FIN_TRIAL_MSG };
  const r = await supabase.functions.invoke(fn, { body });
  // A refusal from the function comes back as an error with its answer inside: say what it said, not 'can't reach the server'.
  const said = r.error ? ((await (r.error as { context?: Response }).context?.json?.().catch(() => null)) as { error?: string } | null)?.error : undefined;
  if (said) return { data: null, error: said };
  const d = r.data as (T & { error?: string }) | null;
  return r.error || d?.error ? { data: null, error: d?.error || 'Could not reach the server — try again.' } : { data: d, error: null };
}
export async function loadSettings(orgId: string | null): Promise<FinSettings> {
  const r = orgId ? ((await fdb.from('fin_settings').select('*').eq('org_id', orgId).maybeSingle()).data as Record<string, unknown> | null) : null;
  const out = { ...FIN_DEFAULTS } as FinSettings;
  Object.entries(r || {}).forEach(([k, v]) => { if (v !== null && v !== undefined) (out as Record<string, unknown>)[k] = v; });
  return out;
}
export const useFinSettings = (orgId: string | null | undefined) => useQuery({ queryKey: ['finSettings', orgId], enabled: !!orgId, staleTime: 300000, queryFn: () => loadSettings(orgId ?? null) });
export const finStatus = (s: Site) => siteStatusKey(s as never) as string;
export const groupBy = <T, K extends string>(rows: T[], key: (r: T) => K | null | undefined) => { const o: Record<string, T[]> = {}; rows.forEach((r) => { const k = key(r); if (k) (o[k] = o[k] || []).push(r); }); return o; };

export type Todo = { tone: 'warn' | 'bad' | 'blue' | 'grey'; t: string; s: string; n: number; go: string };
type Hire = { item: string; on_hire: string; rate: number; rate_period: string };
type FinRows = { sites: Site[]; jf: (JobFin & { site_id: string })[]; pos: { site_id: string }[]; invs: FinInv[]; apps: (FinApp & { site_id: string })[]; st: FinSettings; toApprove: { net: number }[]; onHire: Hire[]; inbox: unknown[]; subApps: unknown[] };
const JF_COLS = 'site_id,contract_value,billing_type,app_reminder_day,app_dates,pc_date,defects_months,final_release_date,ret1_invoice_id,ret2_invoice_id,ret1_app_id,ret2_app_id';
const INV_COLS = 'id,site_id,status,due_date,issue_date,total,paid,net', APP_COLS = 'id,site_id,number,valuation_date,status,cert_retention,cert_date';
const INBOX_OPEN = 'status.eq.new,and(status.eq.filed,purchase_invoice_id.is.null)';

/** Finance's to-do list (the Overview's, the HUB's Finance tab and the menu's count) from the rows it's given. */
function finTodos(d: FinRows) {
  const S = d.sites, st = d.st;
  const jfBy: Record<string, JobFin> = {}; d.jf.forEach((r) => { jfBy[r.site_id] = r; });
  const appsBy = groupBy(d.apps, (a) => a.site_id), invsBy = groupBy(d.invs, (i) => i.site_id);
  const hasPo = new Set(d.pos.map((p) => p.site_id));
  const live = S.filter((s) => finStatus(s) === 'live');
  const overdueInv = d.invs.filter((i) => invOverdue(i)), overdue = overdueInv.reduce((t, i) => t + invOutstandingNet(i), 0);
  const still = (s: Site) => retentionStillHeld(appsBy[s.id] || [], jfBy[s.id], invsBy[s.id] || []);
  const retDue = S.filter((s) => retentionAlerts(jfBy[s.id], st, still(s)).length);
  // Invoice jobs have no applications; only one past its date with nothing raised is a to-do (the dates are on the calendar).
  // Only jobs billed by application (set as such, or with applications already); repair contracts and other jobs
  // with no billing type and no applications aren't (review, 15 Nov 2026).
  const byApp = (s: Site) => jfBy[s.id]?.billing_type ? jfBy[s.id]?.billing_type === 'application' : (appsBy[s.id] || []).length > 0;
  const appsDue = live.filter((s) => byApp(s) && appOverdueFor(jfBy[s.id], st, appsBy[s.id] || []));
  const longHire = d.onHire.filter((h) => plantCost(h).days > 28);
  const noPo = live.filter((s) => !hasPo.has(s.id)), noValue = live.filter((s) => !jfBy[s.id]?.contract_value);
  const one = (list: Site[], many: string) => (list.length === 1 ? `/fin/job/${list[0].id}` : many);
  const todo: Todo[] = [];
  if (appsDue.length) todo.push({ tone: 'bad', t: 'Applications not raised by their date', s: appsDue.map(jobTag).join(', '), n: appsDue.length, go: one(appsDue, '/fin/sales?tab=apps') });
  if (overdueInv.length) todo.push({ tone: 'bad', t: 'Overdue invoices', s: `£${Math.round(overdue).toLocaleString('en-GB')} to chase`, n: overdueInv.length, go: '/fin/sales?tab=invoices&f=overdue' });
  if (d.toApprove.length) todo.push({ tone: 'warn', t: 'Purchase invoices to approve', s: `£${Math.round(d.toApprove.reduce((t, i) => t + Number(i.net || 0), 0)).toLocaleString('en-GB')} excl. VAT`, n: d.toApprove.length, go: '/fin/purchases?tab=invoices&f=approve' });
  if (d.inbox.length) todo.push({ tone: 'blue', t: 'Unallocated purchase invoices', s: 'We couldn’t tell the job — allocate them or send to a PM', n: d.inbox.length, go: '/fin/purchases?tab=invoices&f=job' });
  if (d.subApps.length) todo.push({ tone: 'warn', t: 'Subcontractor applications to certify', s: 'Send a payment or pay less notice in time', n: d.subApps.length, go: '/fin/subs?tab=apps' });
  if (retDue.length) todo.push({ tone: 'blue', t: 'Retention to claim back', s: retDue.map(jobTag).join(', '), n: retDue.length, go: '/fin/sales?tab=retention' });
  if (longHire.length) todo.push({ tone: 'warn', t: 'Plant on hire over 4 weeks', s: longHire.map((h) => h.item).join(', '), n: longHire.length, go: '/fin/purchases?tab=plant' });
  if (noPo.length) todo.push({ tone: 'grey', t: 'Live projects with no client PO', s: noPo.map(jobTag).join(', '), n: noPo.length, go: one(noPo, '/fin/jobs') });
  if (noValue.length) todo.push({ tone: 'grey', t: 'Live projects with no contract value', s: noValue.map(jobTag).join(', '), n: noValue.length, go: one(noValue, '/fin/jobs') });
  return { todo, jfBy, invsBy, live, overdue, still };
}

export function useFinOverview(me: Profile | null, sites: Site[] | undefined) {
  return useQuery({
    // Kept 2 minutes (speed review, 15 Nov 2026): every Finance save still refreshes it at once.
    queryKey: ['finOverview', me?.org_id, (sites || []).length], enabled: !!me && !!sites, staleTime: 120000,
    queryFn: async () => {
      const org = me!.org_id as string;
      const [jf, pos, invs, apps, st, toApprove, onHire, inbox, subApps] = await Promise.all([
        selectAll<JobFin & { site_id: string }>('job_finance', JF_COLS, (q) => q.eq('org_id', org)),
        selectAll<{ site_id: string }>('client_pos', 'id,site_id', (q) => q.eq('org_id', org)),
        selectAll<FinInv>('fin_invoices', INV_COLS, (q) => q.eq('org_id', org).neq('status', 'void')),
        selectAll<FinApp & { site_id: string }>('fin_applications', APP_COLS, (q) => q.eq('org_id', org)),
        loadSettings(org),
        selectAll<{ net: number }>('purchase_invoices', 'id,net', (q) => q.eq('org_id', org).in('status', ['to_approve', 'query'])),
        selectAll<Hire>('fin_plant_hires', 'id,site_id,item,on_hire,rate,rate_period', (q) => q.eq('org_id', org).is('off_hire', null)),
        selectAll<{ id: string }>('fin_inbox', 'id', (q) => q.eq('org_id', org).neq('stage', 'with_pm').neq('stage', 'ignored').or(INBOX_OPEN)),
        selectAll<{ id: string }>('fin_sub_apps', 'id', (q) => q.eq('org_id', org).eq('status', 'received')),
      ]);
      const S = sites || [];
      const { todo, jfBy, invsBy, live, overdue, still } = finTodos({ sites: S, jf, pos, invs, apps, st, toApprove, onHire, inbox, subApps });
      const liveValue = live.reduce((t, s) => t + Number(jfBy[s.id]?.contract_value || 0), 0);
      // Work on live jobs not billed yet: each job's contract value less what's been invoiced on it, never below nothing.
      const toInvoice = live.reduce((t, s) => t + Math.max(0, Number(jfBy[s.id]?.contract_value || 0) - (invsBy[s.id] || []).reduce((n, i) => n + Number(i.net || 0), 0)), 0);
      const owed = invs.reduce((t, i) => t + invOutstandingNet(i), 0);
      const retHeld = S.reduce((t, s) => t + still(s), 0);
      return { liveValue, liveCount: live.length, toInvoice, owed, overdue, retHeld, todo };
    },
  });
}

/** Rows of a table for a list of ids, 150 ids a request (a long list makes the address too long), all at once. */
async function selectIn<T>(table: string, cols: string, col: string, ids: string[], filter: (q: Q) => Q): Promise<T[]> {
  const parts: string[][] = []; for (let i = 0; i < ids.length; i += 150) parts.push(ids.slice(i, i + 150));
  return (await Promise.all(parts.map((p) => selectAll<T>(table, cols, (q) => filter(q).in(col, p))))).flat();
}
/** How many Finance to-dos there are, for the menu's HUB count, without reading every invoice and application (speed
 *  review, 15 Nov 2026: the menu read nine whole Finance tables on every app open). The same rules (finTodos), given
 *  only the rows that can turn each one on: one row is enough to know there are overdue invoices, invoices to approve,
 *  unallocated invoices or applications to certify; plant hired 27+ days ago; applications on live jobs only; and
 *  applications and invoices only for jobs whose retention could be due. */
export async function finTodoCount(org: string, sites: Site[]): Promise<number> {
  const now = today();
  const first = async <T,>(q: Q): Promise<T[]> => ((await q.limit(5)).data as T[] | null) ?? [];
  const live = sites.filter((s) => finStatus(s) === 'live').map((s) => s.id);
  const [jf, st, pos, liveApps, overdue, toApprove, onHire, inbox, subApps] = await Promise.all([
    selectAll<JobFin & { site_id: string }>('job_finance', JF_COLS, (q) => q.eq('org_id', org)),
    loadSettings(org),
    selectAll<{ site_id: string }>('client_pos', 'id,site_id', (q) => q.eq('org_id', org)),
    selectIn<FinApp & { site_id: string }>('fin_applications', APP_COLS, 'site_id', live, (q) => q.eq('org_id', org)),
    first<FinInv>(fdb.from('fin_invoices').select(INV_COLS).eq('org_id', org).in('status', INV_OPEN).lt('due_date', now) as Q),
    first<{ net: number }>(fdb.from('purchase_invoices').select('id,net').eq('org_id', org).in('status', ['to_approve', 'query']) as Q),
    selectAll<Hire>('fin_plant_hires', 'id,site_id,item,on_hire,rate,rate_period', (q) => q.eq('org_id', org).is('off_hire', null).lte('on_hire', addDays(now, -27))),
    first<{ id: string }>(fdb.from('fin_inbox').select('id').eq('org_id', org).neq('stage', 'with_pm').neq('stage', 'ignored').or(INBOX_OPEN) as Q),
    first<{ id: string }>(fdb.from('fin_sub_apps').select('id').eq('org_id', org).eq('status', 'received') as Q),
  ]);
  // Retention: only a job with a release date within 30 days and that half not claimed can be due (retentionAlerts
  // looks at the amount held only to see there is some), so only those jobs' applications and invoices are needed.
  const jfBy: Record<string, JobFin> = {}; jf.forEach((r) => { jfBy[r.site_id] = r; });
  const ret = sites.filter((s) => retentionAlerts(jfBy[s.id], st, 1).length).map((s) => s.id);
  const liveSet = new Set(live);
  const [retApps, retInvs] = ret.length ? await Promise.all([
    selectIn<FinApp & { site_id: string }>('fin_applications', APP_COLS, 'site_id', ret.filter((id) => !liveSet.has(id)), (q) => q.eq('org_id', org)),
    selectIn<FinInv>('fin_invoices', INV_COLS, 'site_id', ret, (q) => q.eq('org_id', org).neq('status', 'void')),
  ]) : [[], []];
  const seen = new Set(retInvs.map((i) => i.id));
  const invs = retInvs.concat(overdue.filter((i) => !seen.has(i.id)));
  return finTodos({ sites, jf, pos, invs, apps: liveApps.concat(retApps), st, toApprove, onHire, inbox, subApps }).todo.length;
}
/** The number of Finance to-dos for the menu. full: the screen open (Home, the HUB, Finance) loads the whole Overview
 *  anyway, so count its list; anywhere else the cheap count above. Both are refreshed by every Finance save (their
 *  keys start 'finOverview'). */
export function useFinTodoCount(me: Profile | null, sites: Site[] | undefined, full: boolean): number {
  const qc = useQueryClient();
  const ov = useFinOverview(full ? me : null, sites);
  const key = ['finOverview', me?.org_id, (sites || []).length];
  const c = useQuery({
    queryKey: [...key, 'count'], enabled: !full && !!me?.org_id && !!sites, staleTime: 120000,
    queryFn: () => finTodoCount(me!.org_id as string, sites || []),
    placeholderData: () => qc.getQueryData<{ todo: Todo[] }>(key)?.todo.length,
  });
  if (!me) return 0;
  return full ? (ov.data?.todo.length ?? c.data ?? 0) : (c.data ?? 0);
}

/** Inserts a numbered row (V001, SC001…): next number after the highest, tried again if two people save at once. */
export async function insertNumbered(table: string, scope: { col: string; val: string }, label: (seq: number) => string, row: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const top = (await fdb.from(table).select('seq').eq(scope.col, scope.val).order('seq', { ascending: false }).limit(1)).data as { seq: number }[] | null;
    const seq = (top?.[0]?.seq || 0) + 1 + attempt;
    const r = await fdb.from(table).insert({ ...row, seq, number: label(seq) } as never).select('*').single();
    if (!r.error) return r.data as Record<string, unknown>;
    if (r.error.code !== '23505') return null;
  }
  return null;
}

/** Should this record go to Xero automatically? (907 finXeroAuto) Only when Xero is connected, the company
 *  has "send automatically" on, and the record isn't opted out or already in Xero. The trial still blocks the call. */
export async function xeroAutoOk(orgId: string | null | undefined, table: 'fin_invoices' | 'purchase_invoices' | 'fin_sub_payments', id: string): Promise<boolean> {
  if (!orgId) return false;
  const st = (await loadSettings(orgId)) as Record<string, unknown>;
  if (!st.xero_tenant_name || !st.xero_auto) return false;
  const rec = ((await fdb.from(table).select('xero_post,xero_id').eq('id', id).maybeSingle()).data as { xero_post?: boolean | null; xero_id?: string | null } | null);
  return !(rec && (rec.xero_post === false || rec.xero_id));
}
