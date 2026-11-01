// Wages and labour onto a job's Price tile (9217): Finance sends them, and a PM, Finance Controller or admin books each one.
// Sending is a PM push, so it's off during the Finance trial, except on Sandbox.
import { useQuery } from '@tanstack/react-query';

import { fdb, selectAll } from '@/data/finance';
import { followWages, rollUpWeek } from '@/data/priceSheets';
import { addDays, finBlocked, today } from '@/lib/rules/finance';
import { opInvoicePushes, payeWeekPushes, priceEntry, pushChanges, type PushRow } from '@/lib/rules/wageBook';
import type { Profile } from '@/lib/types';

type Row = Record<string, any>;
export const wagesOff = (orgId: string | null | undefined) => finBlocked('wage-push', undefined, orgId);

// The week's booked-in follows the wages: a price sheet shares them over its lines, any other price adds up its wage lines.
const rollUp = async (me: Profile, elementId: string, siteId: string, week: number): Promise<string | null> => {
  const sheet = ((await fdb.from('price_builder_sheets').select('id').eq('pricing_element_id', elementId).limit(1)).data as Row[] | null)?.[0];
  if (sheet) return followWages(me, elementId, siteId, sheet.id, week);
  await rollUpWeek(elementId, siteId, week);
  return null;
};

/** Off a price: the line goes, so booking again later can't count it twice. */
async function takeOffPrice(me: Profile, e: Row) {
  if (!e.price_entry_id) return;
  await fdb.from('price_week_operative_entries').delete().eq('id', e.price_entry_id);
  if (e.element_id && e.week_number) await rollUp(me, e.element_id, e.site_id, e.week_number);
}
async function applyPushes(me: Profile, existing: Row[], rows: PushRow[]) {
  const c = pushChanges(existing, rows);
  if (c.add.length) await fdb.from('wage_pushes').insert(c.add as never);
  for (const { row, was } of c.change) {
    await fdb.from('wage_pushes').update({ amount: row.amount, days: row.days, description: row.description, status: was.status === 'withdrawn' ? 'pending' : was.status } as never).eq('id', was.id);
    if (was.status === 'price' && was.price_entry_id) {
      await fdb.from('price_week_operative_entries').update({ amount: row.amount, updated_at: new Date().toISOString() } as never).eq('id', was.price_entry_id);
      if (was.element_id && was.week_number) await rollUp(me, was.element_id, was.site_id, was.week_number);
    }
  }
  return c;
}
async function withdraw(me: Profile, gone: Row[]) {
  for (const e of gone) {
    if (e.status === 'pending') { await fdb.from('wage_pushes').delete().eq('id', e.id); continue; }
    if (e.status === 'withdrawn') continue;
    await fdb.from('wage_pushes').update({ status: 'withdrawn', amount: 0, price_entry_id: null } as never).eq('id', e.id);
    await takeOffPrice(me, e);
  }
}

/** After an operative invoice is saved: its job lines wait to be booked, and stay in step if it changes. */
export async function syncOpInvoice(me: Profile, p: Row, key: string): Promise<void> {
  if (!me.org_id || wagesOff(me.org_id)) return;
  const existing = ((await fdb.from('wage_pushes').select('*').eq('org_id', me.org_id).like('src_key', `pay|${p.id}|%`)).data as Row[] | null) ?? [];
  const c = await applyPushes(me, existing, opInvoicePushes(p, key, me.org_id, me.id));
  await withdraw(me, c.gone);
}
/** A voided invoice comes off the prices too. */
export async function withdrawOpInvoice(me: Profile, id: string): Promise<void> {
  if (!me.org_id || wagesOff(me.org_id)) return;
  await withdraw(me, ((await fdb.from('wage_pushes').select('*').eq('org_id', me.org_id).like('src_key', `pay|${id}|%`)).data as Row[] | null) ?? []);
}
/** A week's PAYE wages from sign-ins. Safe to press again: it only changes what's changed. */
export async function bringInPayeWeek(me: Profile, week: string): Promise<{ made: number; noRate: string[]; off?: boolean }> {
  if (!me.org_id || wagesOff(me.org_id)) return { made: 0, noRate: [], off: true };
  const orgId = me.org_id;
  const [cks, rates, people, existing] = await Promise.all([
    selectAll<Row>('checkins', 'user_id,site_id,ts,type', (q) => q.gte('ts', `${addDays(week, -1)}T00:00:00Z`).lte('ts', `${addDays(week, 8)}T00:00:00Z`)),
    selectAll<Row>('fin_labour_rates', 'user_id,pay_type,day_rate', (q) => q.eq('org_id', orgId)),
    selectAll<Row>('profiles', 'id,name', (q) => q.eq('org_id', orgId)),
    selectAll<Row>('wage_pushes', '*', (q) => q.eq('org_id', orgId).like('src_key', `paye|%|${week}|%`)),
  ]);
  const names: Record<string, string> = {}; people.forEach((x) => { names[x.id] = x.name; });
  const { rows, noRate } = payeWeekPushes(cks, rates, names, week, orgId, me.id);
  const c = await applyPushes(me, existing, rows);
  return { made: c.add.length + c.change.length, noRate };
}

/** Put one against a price for a week, or to other job costs. Returns anything to say (why not, or that a sheet couldn't take it all), or null. */
export async function bookWage(me: Profile, id: string, how: 'price' | 'general', elementId?: string, week?: number): Promise<string | null> {
  const p = ((await fdb.from('wage_pushes').select('*').eq('id', id).maybeSingle()).data as Row | null);
  if (!p || p.status !== 'pending') return 'Someone has already booked this one.';
  const patch: Row = { status: how, decided_by: me.id, decided_at: new Date().toISOString() };
  if (how === 'price') {
    if (!elementId || !week) return 'Choose the price and week.';
    const made = await fdb.from('price_week_operative_entries').insert(priceEntry(p, elementId, week, me.id) as never).select('id').single();
    if (made.error) return made.error.message || 'Not booked. Try again.';
    Object.assign(patch, { element_id: elementId, week_number: week, price_entry_id: (made.data as Row).id });
  }
  const ok = await fdb.from('wage_pushes').update(patch as never).eq('id', id).eq('status', 'pending').select('id');
  if (ok.data?.length) return how === 'price' ? rollUp(me, elementId as string, p.site_id, week as number) : null;
  if (patch.price_entry_id) await takeOffPrice(me, { ...p, ...patch });
  return 'Someone has already booked this one.';
}
/** Change your mind: it goes back to being booked. */
export async function unbookWage(me: Profile, id: string): Promise<string | null> {
  const p = ((await fdb.from('wage_pushes').select('*').eq('id', id).maybeSingle()).data as Row | null);
  if (!p) return 'Not found.';
  await takeOffPrice(me, p);
  const ok = await fdb.from('wage_pushes').update({ status: 'pending', element_id: null, week_number: null, price_entry_id: null, decided_by: null, decided_at: null } as never).eq('id', id).select('id');
  return ok.data?.length ? null : 'Could not change it. Try again.';
}

export type PriceChoice = { id: string; site_id: string; name: string; latest: number; sheet: boolean };
/** What's waiting (or everything from one invoice), with the prices each job can book to. */
export function useWagePushes(me: Profile | null, opts: { siteId?: string; invoiceId?: string }) {
  return useQuery({
    queryKey: ['wagePushes', me?.org_id, opts.siteId, opts.invoiceId], enabled: !!me?.org_id,
    queryFn: async () => {
      const orgId = me?.org_id as string;
      const pushes = await selectAll<Row>('wage_pushes', '*', (q) => {
        const a = q.eq('org_id', orgId);
        if (opts.invoiceId) return a.like('src_key', `pay|${opts.invoiceId}|%`).neq('status', 'withdrawn');
        return (opts.siteId ? a.eq('site_id', opts.siteId) : a).eq('status', 'pending');
      });
      const ids = Array.from(new Set(pushes.map((p) => p.site_id)));
      if (!ids.length) return { pushes, prices: [] as PriceChoice[], starts: {} as Record<string, string | null> };
      const [els, wks, sheets, sites] = await Promise.all([
        selectAll<Row>('pricing_elements', 'id,site_id,name,closed', (q) => q.in('site_id', ids)),
        selectAll<Row>('price_weeks', 'element_id,week_number', (q) => q.in('site_id', ids)),
        selectAll<Row>('price_builder_sheets', 'pricing_element_id', (q) => q.in('site_id', ids)),
        selectAll<Row>('sites', 'id,start_date', (q) => q.in('id', ids)),
      ]);
      const latest: Record<string, number> = {}; wks.forEach((w) => { latest[w.element_id] = Math.max(latest[w.element_id] || 0, Number(w.week_number) || 0); });
      const sheeted = new Set(sheets.map((s) => s.pricing_element_id));
      const starts: Record<string, string | null> = {}; sites.forEach((s) => { starts[s.id] = s.start_date; });
      return { pushes, prices: els.filter((e) => !e.closed).map((e) => ({ id: e.id, site_id: e.site_id, name: e.name, latest: latest[e.id] || 0, sheet: sheeted.has(e.id) })) as PriceChoice[], starts };
    },
  });
}
export const lastMonday = () => { const d = new Date(`${today()}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); return d.toISOString().slice(0, 10); };
