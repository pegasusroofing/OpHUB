// HR rules (186-hr.js): leave types and letters, colours, England & Wales bank
// holidays, working days, part days, and how much allowance is used.

export const HR_TYPES: Record<string, string> = { annual: 'Annual leave', training: 'Training course', sick: 'Sick' };
export const HR_DEFAULT_CODES: Record<string, string> = { annual: 'AL', sick: 'SK', training: 'TC', bank: 'BH' };
export const HR_DEFAULT_ALLOWANCE = 28; // includes bank holidays
export const HR_COLOURS = ['#D32F2F', '#2457C5', '#17804A', '#B35A00', '#7B3FB5', '#0E7F7C', '#C2185B', '#5D4037', '#455A64', '#E0B400',
  '#F4511E', '#0288D1', '#43A047', '#8E24AA', '#00897B', '#6D4C41', '#3949AB', '#C0CA33', '#EC407A', '#26A69A', '#FB8C00', '#5C6BC0', '#7CB342', '#212121'];

const KNOWN = [
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28',
  '2028-01-03', '2028-04-14', '2028-04-17', '2028-05-01', '2028-05-29', '2028-08-28', '2028-12-25', '2028-12-26',
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Standard rules for a year not in the published list. */
export function bankHolsForYear(y: number): string[] {
  const D = (m: number, day: number) => new Date(y, m, day);
  const add = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easter = D(Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
  const firstMon = (mo: number) => { let x = D(mo, 1); while (x.getDay() !== 1) x = add(x, 1); return x; };
  const lastMon = (mo: number) => { let x = D(mo + 1, 0); while (x.getDay() !== 1) x = add(x, -1); return x; };
  let ny = D(0, 1); if (ny.getDay() === 6) ny = D(0, 3); else if (ny.getDay() === 0) ny = D(0, 2);
  const xd = D(11, 25).getDay();
  let xmas: Date, boxing: Date;
  if (xd === 5) { xmas = D(11, 25); boxing = D(11, 28); } else if (xd === 6) { xmas = D(11, 27); boxing = D(11, 28); } else if (xd === 0) { xmas = D(11, 27); boxing = D(11, 26); } else { xmas = D(11, 25); boxing = D(11, 26); }
  return [ny, add(easter, -2), add(easter, 1), firstMon(4), lastMon(4), lastMon(7), xmas, boxing].map(iso);
}

const set = new Set(KNOWN), done = new Set(['2026', '2027', '2028']);
function ensure(y: string) { if (!/^\d{4}$/.test(y) || done.has(y)) return; done.add(y); bankHolsForYear(Number(y)).forEach((x) => set.add(x)); }
export function isBankHol(ds: string): boolean { ensure(ds.slice(0, 4)); return set.has(ds); }
export function bankHolCount(year: number): number { ensure(String(year)); return [...set].filter((x) => x.startsWith(`${year}-`)).length; }
export function isWorkingDay(ds: string): boolean { const wd = new Date(`${ds}T00:00:00`).getDay(); return wd !== 0 && wd !== 6 && !isBankHol(ds); }
export function eachDay(a: string, b: string, fn: (ds: string) => void) { const d = new Date(`${a}T00:00:00`), e = new Date(`${b}T00:00:00`); while (d <= e) { fn(iso(d)); d.setDate(d.getDate() + 1); } }

export type Leave = { id: string; user_id: string; type: string; start_date: string; end_date: string; half: string | null; start_part: string | null; end_part: string | null; days: number; status: string; note: string | null; bank_holiday?: boolean | null; link_projects?: boolean | null };
type Span = Pick<Leave, 'start_date' | 'end_date' | 'half' | 'start_part' | 'end_part'>;

export function dayFraction(l: Span, ds: string): number {
  if (l.half) return 0.5;
  let f = 1;
  if (ds === l.start_date && l.start_part === 'pm') f -= 0.5;
  if (ds === l.end_date && l.end_part === 'am') f -= 0.5;
  return Math.max(f, 0.5);
}
/** Working days a booking takes (optionally only those in one year). */
export function leaveDays(l: Span, yearOnly?: number): number {
  const inYear = (d: string) => !yearOnly || d.slice(0, 4) === String(yearOnly);
  if (l.half) return isWorkingDay(l.start_date) && inYear(l.start_date) ? 0.5 : 0;
  let n = 0; eachDay(l.start_date, l.end_date, (d) => { if (isWorkingDay(d) && inYear(d)) n += dayFraction(l, d); }); return n;
}
export function usedDays(leave: Leave[], uid: string, year: number, statuses: string[]): number {
  return leave.filter((l) => l.user_id === uid && l.type === 'annual' && statuses.includes(l.status))
    .reduce((t, l) => t + (l.bank_holiday ? (l.start_date.slice(0, 4) === String(year) ? 1 : 0) : leaveDays(l, year)), 0);
}
export function offOn(leave: Leave[], ds: string): Leave[] {
  return leave.filter((l) => l.start_date <= ds && l.end_date >= ds && (l.status === 'approved' || l.status === 'pending'));
}
/** First working day where `max` other people are already off, or null. */
export function limitClash(leave: Leave[], uid: string, start: string, end: string, max: number, approvedOnly = false): { day: string; n: number } | null {
  if (!max) return null;
  let clash: { day: string; n: number } | null = null;
  eachDay(start, end, (day) => {
    if (clash || !isWorkingDay(day)) return;
    const others = new Set(offOn(leave, day).filter((l) => l.user_id !== uid && (!approvedOnly || l.status === 'approved')).map((l) => l.user_id));
    if (others.size >= max) clash = { day, n: others.size };
  });
  return clash;
}
/** The parts a booking form turns into half / start_part / end_part. */
export function bookingParts(start: string, end: string, part: string, startPart: string, endPart: string) {
  return {
    half: start === end && part !== 'full' ? part : null,
    start_part: start !== end && startPart === 'pm' ? 'pm' : null,
    end_part: start !== end && endPart === 'am' ? 'am' : null,
  };
}
