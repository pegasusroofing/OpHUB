// Wages and labour from Finance to a job's Price tile (9217 wage pushes, 9219c finOpPushToPm). Each person's amount on each
// job waits as a "wage push" until a PM, Finance Controller or admin puts it against a price, for a week, or to other job costs.
import { labourDays } from './finBook.ts';
import { addDays, round2 } from './finance.ts';

type Row = Record<string, any>;
export type PushRow = { org_id: string; site_id: string; src_key: string; person_key: string; operative_id: string | null; person_name: string; week_start: string; days: number; amount: number; description: string | null; status: 'pending'; created_by: string };
export const PUSH_LABEL: Record<string, string> = { pending: 'To book', price: 'On price', general: 'Other job costs', withdrawn: 'Taken off' };

/** An operative invoice's job lines, one per job. */
export function opInvoicePushes(p: Row, key: string, orgId: string, by: string): PushRow[] {
  const bySite: Record<string, { amount: number; desc: string[] }> = {};
  (p.lines || []).forEach((l: Row) => { if (!l.site_id) return; const b = (bySite[l.site_id] ||= { amount: 0, desc: [] }); b.amount += Number(l.amount || 0); if (l.description) b.desc.push(l.description); });
  return Object.keys(bySite).map((sid) => ({ org_id: orgId, site_id: sid, src_key: `pay|${p.id}|${sid}`, person_key: key, operative_id: key && !key.startsWith('w:') ? key : null, person_name: p.name || 'Worker', week_start: p.period_start, days: 0, amount: round2(bySite[sid].amount), description: [p.invoice_no ? `Invoice ${p.invoice_no}` : '', ...bySite[sid].desc].filter(Boolean).join(' · ') || null, status: 'pending', created_by: by }));
}

/** A week's wages for PAYE staff: sign-in days on each job at their day rate. Anyone with no day rate is named, not guessed at. */
export function payeWeekPushes(checkins: Row[], rates: Row[], names: Record<string, string>, week: string, orgId: string, by: string): { rows: PushRow[]; noRate: string[] } {
  const rateBy: Record<string, Row> = {}; rates.forEach((r) => { if (r.user_id && r.pay_type === 'paye') rateBy[r.user_id] = r; });
  const end = addDays(week, 6), tally: Record<string, { user: string; site: string; days: number }> = {}, noRate = new Set<string>();
  labourDays(checkins).forEach((d) => {
    if (d.date < week || d.date > end || !rateBy[d.user_id]) return;
    if (rateBy[d.user_id].day_rate == null) { noRate.add(names[d.user_id] || 'Someone'); return; }
    const k = `${d.user_id}|${d.site_id}`; (tally[k] ||= { user: d.user_id, site: d.site_id, days: 0 }).days += 1;
  });
  const rows = Object.values(tally).map((t) => ({ org_id: orgId, site_id: t.site, src_key: `paye|${t.user}|${week}|${t.site}`, person_key: t.user, operative_id: t.user, person_name: names[t.user] || 'Worker', week_start: week, days: t.days, amount: round2(t.days * Number(rateBy[t.user].day_rate)), description: 'Wages from sign-ins', status: 'pending' as const, created_by: by }));
  return { rows, noRate: Array.from(noRate) };
}

/** What changes on rows already there: amounts follow Finance; a booked one stays booked, one taken off comes back. */
export function pushChanges(existing: Row[], rows: PushRow[]) {
  const have: Record<string, Row> = {}; existing.forEach((e) => { have[e.src_key] = e; });
  const want = new Set(rows.map((r) => r.src_key));
  return {
    add: rows.filter((r) => !have[r.src_key]),
    change: rows.filter((r) => have[r.src_key] && (Number(have[r.src_key].amount) !== r.amount || Number(have[r.src_key].days) !== r.days || have[r.src_key].status === 'withdrawn')).map((r) => ({ row: r, was: have[r.src_key] })),
    gone: existing.filter((e) => !want.has(e.src_key)),
  };
}

const monday = (d: string) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
/** The week of a price for the work's week: counted from the job's start, or the price's latest week if the job has no start date. */
export function pickWeek(latest: number, jobStart: string | null | undefined, workWeek: string | null | undefined): number {
  if (jobStart && workWeek) { const n = Math.floor((new Date(`${monday(workWeek)}T12:00:00`).getTime() - new Date(`${monday(jobStart)}T12:00:00`).getTime()) / (7 * 864e5)) + 1; if (n >= 1) return n; }
  return latest || 1;
}
export function weekChoices(latest: number, jobStart: string | null | undefined, workWeek: string | null | undefined) {
  const pick = pickWeek(latest, jobStart, workWeek), top = Math.max(latest + 1, pick), st = jobStart ? monday(jobStart) : null, out: { week: number; label: string; picked: boolean }[] = [];
  for (let w = top; w >= 1; w--) {
    const when = st ? ` · w/c ${new Date(`${addDays(st, (w - 1) * 7)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : '';
    out.push({ week: w, label: `Week ${w}${when}${w === latest ? ' (latest)' : w > latest ? ' (new)' : ''}`, picked: w === pick });
  }
  return out;
}
/** The line that goes in the price's week: a named operative, or a labelled cost for someone without a login. */
export const priceEntry = (p: Row, elementId: string, week: number, by: string) => ({ site_id: p.site_id, element_id: elementId, week_number: week, amount: Number(p.amount || 0), entered_by: by, updated_at: new Date().toISOString(), ...(p.operative_id ? { operative_id: p.operative_id, kind: 'extra_operative' } : { operative_id: null, kind: 'cost', label: p.person_name || 'Worker' }) });
