// How often a live project needs a Toolbox Talk (Andy, 14 Nov 2026: "set up the rules for tbt required monthly in the
// admin, some companies may have it more infrequent"). The company admin picks it (organizations.tbt_every); not set
// means every month, as before (710: due by the 7th). A talk counts for the period it was issued in (live or
// completed), and the site must have had at least one completed ever.

export type TbtEvery = 'week' | '2weeks' | 'month' | '2months' | '3months' | '6months' | 'off';

export const TBT_EVERY: { k: TbtEvery; l: string }[] = [
  { k: 'week', l: 'Every Week' },
  { k: '2weeks', l: 'Every 2 Weeks' },
  { k: 'month', l: 'Every Month' },
  { k: '2months', l: 'Every 2 Months' },
  { k: '3months', l: 'Every 3 Months' },
  { k: '6months', l: 'Every 6 Months' },
  { k: 'off', l: 'Not Required' },
];

export const tbtEvery = (v?: string | null): TbtEvery => (TBT_EVERY.some((x) => x.k === v) ? (v as TbtEvery) : 'month');
export const tbtEveryLabel = (v?: string | null) => TBT_EVERY.find((x) => x.k === tbtEvery(v))!.l;

/** The period a talk is needed in now: when it began, the day it's due by (overdue after), and what to call it.
 *  Weeks run Monday to Sunday, due by the Friday; fortnights are counted from Monday 5 Jan 2026. Months are due by
 *  the 7th of the period's first month (2 months from Jan / Mar / May…, 3 months from Jan / Apr / Jul / Oct, 6 months
 *  from Jan / Jul). Not Required: null. */
export function tbtPeriod(every: TbtEvery, now = new Date()): { start: Date; due: Date; word: string } | null {
  if (every === 'off') return null;
  if (every === 'week' || every === '2weeks') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    if (every === '2weeks') {
      const weeks = Math.floor(Math.round((start.getTime() - new Date(2026, 0, 5).getTime()) / 864e5) / 7);
      if (((weeks % 2) + 2) % 2 === 1) start.setDate(start.getDate() - 7);
    }
    const due = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 4, 23, 59, 59);
    return { start, due, word: every === 'week' ? 'this week' : 'this fortnight' };
  }
  const n = every === 'month' ? 1 : every === '2months' ? 2 : every === '3months' ? 3 : 6;
  const m0 = Math.floor(now.getMonth() / n) * n;
  return {
    start: new Date(now.getFullYear(), m0, 1),
    due: new Date(now.getFullYear(), m0, 7, 23, 59, 59),
    word: n === 1 ? 'this month' : n === 3 ? 'this quarter' : n === 6 ? 'this half year' : 'these 2 months',
  };
}

/** What a live site still needs: nothing, a talk for this period (due or overdue), or one completed ever. */
export function tbtNeed(talks: { status: string; created_at: string }[], every: TbtEvery, now = new Date()):
  null | { kind: 'never' | 'due' | 'overdue'; due: Date; word: string } {
  const p = tbtPeriod(every, now);
  if (!p) return null;
  const issued = talks.some((t) => (t.status === 'live' || t.status === 'completed') && new Date(t.created_at) >= p.start);
  const ever = talks.some((t) => t.status === 'completed');
  if (issued && ever) return null;
  return { kind: !ever ? 'never' : now > p.due ? 'overdue' : 'due', due: p.due, word: p.word };
}
