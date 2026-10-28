// Job calendar rules, ported from 780-site-calendar (and 9219zr's delivery dates).
import { localISODate } from './driver.ts';

export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly';
export const REPEAT_LABEL: Record<Repeat, string> = { none: 'None', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
export const VIEW_DAYS = { week: 7, twoweek: 14 } as const;

/**
 * A repeating key date becomes real rows: up to a year ahead (60 at most), stopping
 * at the job's close date; a job that's already closed only gets the one date.
 * Monthly dates are worked out from the start date (31 Jan → 28 Feb → 31 Mar).
 */
export function recurrenceDates(start: string, freq: Repeat, closedAt: string | null, alreadyClosed: boolean): string[] {
  if (!freq || freq === 'none' || !start) return [start];
  const horizon = new Date(`${start}T00:00:00`); horizon.setFullYear(horizon.getFullYear() + 1);
  const closedDay = closedAt ? localISODate(new Date(closedAt)) : null;
  const s = new Date(`${start}T00:00:00`);
  let d = new Date(s);
  const out: string[] = [];
  for (let i = 0; i < 60; i++) {
    if (freq === 'monthly' && i > 0) {
      const y = s.getFullYear(), m0 = s.getMonth() + i;
      d = new Date(y, m0, Math.min(s.getDate(), new Date(y, m0 + 1, 0).getDate()));
    }
    if (d > horizon) break;
    const ds = localISODate(d);
    if (closedDay && ds > closedDay) break;
    if (alreadyClosed && i > 0) break;
    out.push(ds);
    if (freq === 'daily') d.setDate(d.getDate() + 1);
    else if (freq === 'weekly') d.setDate(d.getDate() + 7);
  }
  return out;
}

export type Timing = 'day_before' | 'day_of' | 'custom';
export function reminderDate(eventDate: string, timing: Timing, custom: string): string {
  if (timing === 'custom') return custom || eventDate;
  if (timing === 'day_of' || !eventDate) return eventDate;
  const d = new Date(`${eventDate}T00:00:00`); d.setDate(d.getDate() - 1);
  return localISODate(d);
}

export function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  return n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
}

/** Monday-first month grid: every day from the Monday on/before the 1st to the Sunday on/after the last. */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1), last = new Date(year, month + 1, 0);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const end = new Date(last); end.setDate(last.getDate() + ((7 - last.getDay()) % 7));
  const out: string[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(localISODate(d));
  return out;
}

/** site_delivery_dates rows → calendar lines (supplier only, never PO numbers or values). */
export function deliveryLines(rows: Record<string, unknown>[]): { date: string; title: string }[] {
  return rows.map((r) => {
    const date = String(r.required_by || r.delivery_date || r.event_date || r.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const sup = String(r.supplier_name || r.supplier || '').trim();
    return { date, title: `🚚 ${r.fulfilment === 'collection' ? 'Collection' : 'Delivery'}${sup ? `: ${sup}` : ''}` };
  }).filter((x): x is { date: string; title: string } => !!x);
}
