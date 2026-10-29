// Finance list filters (9219t): months for the sales lists, and the projects list's Start date range
// and Value box (type 50k, >100k, <25k, 25k-100k).
export const monthOf = (d: string | null | undefined) => String(d || '').slice(0, 7);
export function monthLabel(m: string): string {
  if (!m) return '';
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
/** Months in the rows, newest first. */
export const monthsIn = <T,>(rows: T[], of: (r: T) => string) => Array.from(new Set(rows.map(of).filter(Boolean))).sort().reverse();

export const DATE_RANGES: [string, string][] = [['', 'Any date'], ['month', 'This month'], ['last', 'Last month'], ['next', 'Next month'], ['quarter', 'This quarter'], ['year', 'This year'], ['12m', 'Last 12 months'], ['custom', 'Choose dates…']];
/** From / to (YYYY-MM-DD) for a range key, counted from today. */
export function dateRange(k: string, today: string, custom?: { from?: string; to?: string }): [string, string] | null {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)), pad = (n: number) => String(n).padStart(2, '0');
  const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const mon = (yy: number, mm: number): [string, string] => [`${yy}-${pad(mm)}-01`, `${yy}-${pad(mm)}-${pad(last(yy, mm))}`];
  if (k === 'month') return mon(y, m);
  if (k === 'last') return m === 1 ? mon(y - 1, 12) : mon(y, m - 1);
  if (k === 'next') return m === 12 ? mon(y + 1, 1) : mon(y, m + 1);
  if (k === 'quarter') { const q = Math.floor((m - 1) / 3) * 3 + 1; return [`${y}-${pad(q)}-01`, `${y}-${pad(q + 2)}-${pad(last(y, q + 2))}`]; }
  if (k === 'year') return [`${y}-01-01`, `${y}-12-31`];
  if (k === '12m') return [`${y - 1}${today.slice(4)}`, today];
  if (k === 'custom') return [custom?.from || '0000-01-01', custom?.to || '9999-12-31'];
  return null;
}
/** A test for the Value box: "50k" (about), ">100k", "<25k", "25k-100k". Null when the box doesn't make sense. */
export function valueTest(q: string): ((v: number) => boolean) | null {
  const s = String(q || '').toLowerCase().replace(/[£,\s]/g, ''); if (!s) return null;
  const n = (x: string) => { const mm = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(x); if (!mm) return NaN; return Number(mm[1]) * (mm[2] === 'k' ? 1e3 : mm[2] === 'm' ? 1e6 : 1); };
  const r = /^(.+)-(.+)$/.exec(s);
  if (r) { const a = n(r[1]), b = n(r[2]); if (!isNaN(a) && !isNaN(b)) return (v) => v >= a && v <= b; }
  if (s[0] === '>') { const a = n(s.replace(/^>=?/, '')); if (!isNaN(a)) return (v) => v >= a; }
  if (s[0] === '<') { const a = n(s.replace(/^<=?/, '')); if (!isNaN(a)) return (v) => v <= a; }
  const a = n(s); if (!isNaN(a)) return (v) => String(Math.round(v)).includes(String(Math.round(a))) || Math.abs(v - a) < 0.5;
  return null;
}
