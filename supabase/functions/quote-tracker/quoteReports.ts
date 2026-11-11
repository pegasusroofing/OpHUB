// The Quotes reports (Andy, 11 Nov 2026): what Export offers, what the tender tracker in OneDrive holds, and what the auto
// exports send. Pure: no app or database code, so the server's auto export can use the same tables.
import { clientNames, groupQuotes, isQuoted, outcomeLabel, perClient, statusLabel, statusWord, chaseStatus, type GroupBy, type QuoteRow } from './quotes.ts';

export type RQuote = QuoteRow & {
  address?: string | null; postcode?: string | null; profit_pct?: number | null; guide_markup_pct?: number | null; received_date?: string | null; returned_at?: string | null;
  notes?: string | null; chase_count?: number | null; others?: { client_name: string }[];
};
export type RCol = { l: string; money?: boolean; num?: boolean; w?: number };
export type RTable = { title: string; sub?: string; cols: RCol[]; rows: (string | number | null | undefined)[][]; totals?: (string | number | null | undefined)[] };
export type ReportKey = 'live' | 'quoted' | 'all' | 'tracker' | 'client_name' | 'discipline' | 'priced_by_name' | 'year' | 'status';
export const REPORTS: [ReportKey, string][] = [
  ['live', 'Live Quotes'], ['quoted', 'Quoted Projects'], ['all', 'All Quotes'], ['tracker', 'Tender Tracker (Everything)'],
  ['client_name', 'By Customer'], ['discipline', 'By Discipline'], ['priced_by_name', 'By Who Priced It'], ['year', 'By Year'], ['status', 'By Outcome'],
];
export const reportLabel = (k: string) => REPORTS.find(([x]) => x === k)?.[1] ?? k;

const ukd = (d: string | null | undefined) => (d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const pct = (p: number | null | undefined) => (p == null ? null : Math.round(p * 1000) / 10);
const sum = (rows: RQuote[]) => rows.reduce((t, x) => t + (x.value || 0), 0);

/** One report as a table. today = yyyy-mm-dd (for the chase status). */
export function quoteReport(kind: ReportKey, all: RQuote[], today: string): RTable {
  const live = all.filter((x) => !isQuoted(x)), quoted = all.filter((x) => isQuoted(x));
  if (kind === 'live') return {
    title: 'Live Quotes', sub: `${live.length} being priced`,
    cols: [{ l: 'Customer', w: 130 }, { l: 'Project', w: 170 }, { l: 'Address', w: 150 }, { l: 'Discipline', w: 80 }, { l: 'Received', w: 70 }, { l: 'Due Back', w: 70 }, { l: 'Guide Mark-Up %', num: true, w: 60 }, { l: 'Status', w: 100 }],
    rows: live.map((x) => [clientNames(x).join(', '), x.title, [x.address, x.postcode].filter(Boolean).join(', '), x.discipline, ukd(x.received_date), ukd(x.return_date), x.guide_markup_pct ?? null, statusLabel(x.status)]),
  };
  if (kind === 'quoted') return {
    title: 'Quoted Projects', sub: `${quoted.length} quoted · £${Math.round(sum(quoted)).toLocaleString('en-GB')}`,
    cols: [{ l: 'Customer', w: 130 }, { l: 'Project', w: 170 }, { l: 'Discipline', w: 80 }, { l: 'Tender Value', money: true, w: 80 }, { l: 'Mark-Up %', num: true, w: 55 }, { l: 'Returned', w: 70 }, { l: 'Chase Date', w: 70 }, { l: 'Chase Status', w: 90 }, { l: 'Status', w: 80 }],
    rows: quoted.map((x) => [clientNames(x).join(', '), x.title, x.discipline, x.value, pct(x.profit_pct), ukd(x.returned_at || x.return_date), ukd(x.next_chase_date), chaseStatus(x, today), outcomeLabel(x.status)]),
    totals: ['Total', '', '', sum(quoted), '', '', '', '', ''],
  };
  if (kind === 'all' || kind === 'tracker') {
    const full = kind === 'tracker';
    return {
      title: full ? 'Tender Tracker' : 'All Quotes', sub: `${all.length} quotes · updated ${ukd(today)}`,
      cols: [{ l: 'Client', w: 130 }, { l: 'Project', w: 170 }, ...(full ? [{ l: 'Address', w: 150 }] : []), { l: 'Discipline', w: 80 }, { l: 'Value', money: true, w: 80 }, { l: 'Mark-Up %', num: true, w: 55 }, { l: 'Return Date', w: 70 }, { l: 'Returned', w: 55 }, ...(full ? [{ l: 'Priced By', w: 80 }] : []), { l: 'Chase Status', w: 90 }, { l: 'Status', w: 90 }, ...(full ? [{ l: 'Notes', w: 160 }] : [])],
      rows: all.map((x) => [clientNames(x).join(', '), x.title, ...(full ? [[x.address, x.postcode].filter(Boolean).join(', ')] : []), x.discipline, x.value, pct(x.profit_pct), ukd(x.return_date), isQuoted(x) ? 'Yes' : 'No', ...(full ? [x.priced_by_name] : []), isQuoted(x) ? chaseStatus(x, today) : '', statusWord(x), ...(full ? [x.notes] : [])]),
      totals: ['Total', '', ...(full ? [''] : []), '', sum(all), '', '', '', ...(full ? [''] : []), '', '', ...(full ? [''] : [])],
    };
  }
  const by = kind as GroupBy;
  const label = reportLabel(kind).replace('By ', '');
  const groups = groupQuotes(by === 'client_name' ? perClient(all) : all, by);
  return {
    title: `Quotes ${reportLabel(kind).toLowerCase()}`, sub: `${all.length} quotes`,
    cols: [{ l: label, w: 170 }, { l: 'Quotes', num: true, w: 50 }, { l: 'Value', money: true, w: 90 }, { l: 'Won', num: true, w: 45 }, { l: 'Won Value', money: true, w: 90 }, { l: 'Not Won', num: true, w: 50 }, { l: 'Win Rate %', num: true, w: 60 }],
    rows: groups.map((g) => [g.key, g.count, g.value, g.won, g.wonValue, g.lost, g.rate]),
  };
}

// ---- Auto exports (Andy, 11 Nov 2026): which reports, how often, and where they go ----
export type AutoExport = { id: string; report: ReportKey; every: 'daily' | 'weekly' | 'monthly'; day?: number; format: 'xlsx' | 'pdf'; to?: string; onedrive?: boolean };
export const EVERY: [AutoExport['every'], string][] = [['daily', 'Every Weekday'], ['weekly', 'Every Week'], ['monthly', 'Every Month']];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const everyText = (a: AutoExport) => (a.every === 'daily' ? 'Every weekday' : a.every === 'weekly' ? `Every ${DAYS[a.day ?? 1]}` : `On the ${a.day ?? 1}${['th', 'st', 'nd', 'rd'][((a.day ?? 1) % 100 > 10 && (a.day ?? 1) % 100 < 14) || (a.day ?? 1) % 10 > 3 ? 0 : (a.day ?? 1) % 10]} of each month`);
/** Whether an auto export is due on this day (yyyy-mm-dd), and the key that stops it going twice in the same period. */
export function autoDue(a: AutoExport, today: string, lastSent: string | undefined): { due: boolean; period: string } {
  const d = new Date(`${today}T12:00:00Z`), dow = d.getUTCDay(), dom = d.getUTCDate();
  const period = a.every === 'monthly' ? today.slice(0, 7) : a.every === 'weekly' ? `${today}-w` : today;
  const on = a.every === 'daily' ? dow >= 1 && dow <= 5 : a.every === 'weekly' ? dow === (a.day ?? 1) : dom === Math.min(a.day ?? 1, 28);
  return { due: on && lastSent !== period, period };
}
