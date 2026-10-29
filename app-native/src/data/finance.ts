// Finance data (900 / 914): settings, paged reads, the TRIAL guard on every
// server function, and the Overview numbers. Everything here reads; the
// trial switch stops anything going out (emails, Xero, inbox, PM pushes).
import { useQuery } from '@tanstack/react-query';

import { appDateFor, appDueThisMonth, FIN_DEFAULTS, finBlocked, FIN_TRIAL_MSG, invOutstandingNet, invOverdue, jobTag, plantCost, retentionAlerts, retentionStillHeld, today, type FinApp, type FinInv, type FinSettings, type JobFin } from '@/lib/rules/finance';
import { siteStatusKey } from '@/lib/rules/checkin';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

export const fdb = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Q = ReturnType<ReturnType<typeof supabase.from>['select']>;

/** Every row (1000 at a time), so big companies never lose rows past the first page. */
export async function selectAll<T>(table: string, cols: string, filter: (q: Q) => Q): Promise<T[]> {
  let out: T[] = [];
  // job_finance has one row per project and no id column — paging by id there failed, so it came back empty.
  const key = table === 'job_finance' ? 'site_id' : 'id';
  for (let off = 0; off < 500000; off += 1000) {
    const r = await filter(fdb.from(table).select(cols) as Q).order(key).range(off, off + 999);
    const page = (r.data as T[] | null) ?? [];
    out = out.concat(page);
    if (page.length < 1000) break;
  }
  return out;
}
/** Calls a server function — unless the Finance trial blocks it. */
export async function finInvoke<T = unknown>(me: Profile, fn: string, body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  if (finBlocked(fn, body.action as string | undefined, me.org_id)) return { data: null, error: FIN_TRIAL_MSG };
  const r = await supabase.functions.invoke(fn, { body });
  const d = r.data as (T & { error?: string }) | null;
  return r.error || d?.error ? { data: null, error: d?.error || 'Could not reach the server — try again.' } : { data: d, error: null };
}
export async function loadSettings(orgId: string | null): Promise<FinSettings> {
  const r = orgId ? ((await fdb.from('fin_settings').select('*').eq('org_id', orgId).maybeSingle()).data as Record<string, unknown> | null) : null;
  const out = { ...FIN_DEFAULTS } as FinSettings;
  Object.entries(r || {}).forEach(([k, v]) => { if (v !== null && v !== undefined) (out as Record<string, unknown>)[k] = v; });
  return out;
}
export const useFinSettings = (orgId: string | null | undefined) => useQuery({ queryKey: ['finSettings', orgId], enabled: !!orgId, queryFn: () => loadSettings(orgId ?? null) });
export const finStatus = (s: Site) => siteStatusKey(s as never) as string;
export const groupBy = <T, K extends string>(rows: T[], key: (r: T) => K | null | undefined) => { const o: Record<string, T[]> = {}; rows.forEach((r) => { const k = key(r); if (k) (o[k] = o[k] || []).push(r); }); return o; };

export type Todo = { tone: 'warn' | 'bad' | 'blue' | 'grey'; t: string; s: string; n: number; go: string };
export function useFinOverview(me: Profile | null, sites: Site[] | undefined) {
  return useQuery({
    queryKey: ['finOverview', me?.org_id, (sites || []).length], enabled: !!me && !!sites,
    queryFn: async () => {
      const org = me!.org_id as string;
      const [jf, pos, invs, apps, st, toApprove, onHire, inbox, subApps] = await Promise.all([
        selectAll<JobFin & { site_id: string }>('job_finance', 'site_id,contract_value,app_reminder_day,app_dates,pc_date,defects_months,final_release_date,ret1_invoice_id,ret2_invoice_id,ret1_app_id,ret2_app_id', (q) => q.eq('org_id', org)),
        selectAll<{ site_id: string }>('client_pos', 'id,site_id', (q) => q.eq('org_id', org)),
        selectAll<FinInv>('fin_invoices', 'id,site_id,status,due_date,issue_date,total,paid,net', (q) => q.eq('org_id', org).neq('status', 'void')),
        selectAll<FinApp & { site_id: string }>('fin_applications', 'id,site_id,number,valuation_date,status,cert_retention,cert_date', (q) => q.eq('org_id', org)),
        loadSettings(org),
        selectAll<{ net: number }>('purchase_invoices', 'id,net', (q) => q.eq('org_id', org).in('status', ['to_approve', 'query'])),
        selectAll<{ item: string; on_hire: string; rate: number; rate_period: string }>('fin_plant_hires', 'id,site_id,item,on_hire,rate,rate_period', (q) => q.eq('org_id', org).is('off_hire', null)),
        selectAll<{ id: string }>('fin_inbox', 'id', (q) => q.eq('org_id', org).neq('stage', 'with_pm').not('extracted', 'is', null).or('status.eq.new,and(status.eq.filed,purchase_invoice_id.is.null)')),
        selectAll<{ id: string }>('fin_sub_apps', 'id', (q) => q.eq('org_id', org).eq('status', 'received')),
      ]);
      const S = sites || [];
      const jfBy: Record<string, JobFin> = {}; jf.forEach((r) => { jfBy[r.site_id] = r; });
      const appsBy = groupBy(apps, (a) => a.site_id), invsBy = groupBy(invs, (i) => i.site_id);
      const hasPo = new Set(pos.map((p) => p.site_id));
      const live = S.filter((s) => finStatus(s) === 'live');
      const liveValue = live.reduce((t, s) => t + Number(jfBy[s.id]?.contract_value || 0), 0);
      const owed = invs.reduce((t, i) => t + invOutstandingNet(i), 0);
      const overdueInv = invs.filter((i) => invOverdue(i)), overdue = overdueInv.reduce((t, i) => t + invOutstandingNet(i), 0);
      const still = (s: Site) => retentionStillHeld(appsBy[s.id] || [], jfBy[s.id], invsBy[s.id] || []);
      const retHeld = S.reduce((t, s) => t + still(s), 0);
      const retDue = S.filter((s) => retentionAlerts(jfBy[s.id], st, still(s)).length);
      const appsDue = live.filter((s) => appDueThisMonth(appsBy[s.id] || [], appDateFor(jfBy[s.id], st, today().slice(0, 7))));
      const longHire = onHire.filter((h) => plantCost(h).days > 28);
      const noPo = live.filter((s) => !hasPo.has(s.id)), noValue = live.filter((s) => !jfBy[s.id]?.contract_value);
      const one = (list: Site[], many: string) => (list.length === 1 ? `/fin/job/${list[0].id}` : many);
      const todo: Todo[] = [];
      if (appsDue.length) todo.push({ tone: 'warn', t: 'Applications due this month', s: appsDue.map(jobTag).join(', '), n: appsDue.length, go: one(appsDue, '/fin/sales?tab=apps') });
      if (overdueInv.length) todo.push({ tone: 'bad', t: 'Overdue invoices', s: `£${Math.round(overdue).toLocaleString('en-GB')} to chase`, n: overdueInv.length, go: '/fin/sales?tab=invoices&f=overdue' });
      if (toApprove.length) todo.push({ tone: 'warn', t: 'Purchase invoices to approve', s: `£${Math.round(toApprove.reduce((t, i) => t + Number(i.net || 0), 0)).toLocaleString('en-GB')} excl. VAT`, n: toApprove.length, go: '/fin/purchases?tab=invoices&f=approve' });
      if (inbox.length) todo.push({ tone: 'blue', t: 'Unallocated purchase invoices', s: 'We couldn’t tell the job — allocate them or send to a PM', n: inbox.length, go: '/fin/purchases?tab=invoices&f=job' });
      if (subApps.length) todo.push({ tone: 'warn', t: 'Subcontractor applications to certify', s: 'Send a payment or pay less notice in time', n: subApps.length, go: '/fin/subs?tab=apps' });
      if (retDue.length) todo.push({ tone: 'blue', t: 'Retention to claim back', s: retDue.map(jobTag).join(', '), n: retDue.length, go: '/fin/sales?tab=retention' });
      if (longHire.length) todo.push({ tone: 'warn', t: 'Plant on hire over 4 weeks', s: longHire.map((h) => h.item).join(', '), n: longHire.length, go: '/fin/purchases?tab=plant' });
      if (noPo.length) todo.push({ tone: 'grey', t: 'Live projects with no client PO', s: noPo.map(jobTag).join(', '), n: noPo.length, go: one(noPo, '/fin/jobs') });
      if (noValue.length) todo.push({ tone: 'grey', t: 'Live projects with no contract value', s: noValue.map(jobTag).join(', '), n: noValue.length, go: one(noValue, '/fin/jobs') });
      return { liveValue, liveCount: live.length, owed, overdue, retHeld, todo };
    },
  });
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
