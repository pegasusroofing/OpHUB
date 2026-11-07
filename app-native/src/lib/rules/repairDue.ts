// When a repair job is due, from its priority (Andy, 7 Nov 2026). Housing repairs are judged on this: emergencies within
// 24 hours, urgent ones within 7 days, routine ones within 28 days. A priority with its own time in it ("3 Days",
// "24 Hours", "4 Hrs", "10 Working Days") uses that. The due date can also be set by hand on the job (due_at). Pure.

const HOUR = 3600e3, DAY = 24 * HOUR;
/** Adds working days (Monday to Friday). */
function addWorkingDays(from: Date, n: number): Date {
  const d = new Date(from);
  let left = n;
  while (left > 0) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) left--; }
  return d;
}
/** The due date for a priority, counted from when the job came in; null if the priority doesn't say. */
export function dueFromPriority(priority: string | null | undefined, from: Date | string | null | undefined): Date | null {
  const p = String(priority || '').toLowerCase().trim();
  if (!p || !from) return null;
  const start = new Date(from);
  if (isNaN(+start)) return null;
  const n = p.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|working\s*days?|days?|d|weeks?|wks?|w)\b/);
  if (n) {
    const v = Number(n[1]), u = n[2];
    if (/^h/.test(u)) return new Date(+start + v * HOUR);
    if (/^working/.test(u)) return addWorkingDays(start, Math.round(v));
    if (/^w/.test(u)) return new Date(+start + v * 7 * DAY);
    return new Date(+start + v * DAY);
  }
  if (/emergenc|\bp1\b|immediate/.test(p)) return new Date(+start + DAY);
  if (/urgent|\bp2\b/.test(p)) return new Date(+start + 7 * DAY);
  if (/routine|standard|normal|\bp3\b/.test(p)) return new Date(+start + 28 * DAY);
  return null;
}
type DueJob = { due_at?: string | null; priority?: string | null; created_at?: string | null };
/** The job's due date: set on it, else from its priority. */
export function dueOf(j: DueJob): Date | null {
  if (j.due_at) { const d = new Date(j.due_at); return isNaN(+d) ? null : d; }
  return dueFromPriority(j.priority, j.created_at);
}
/** Overdue: past its due date (only for jobs still open — the caller says whether it's open). */
export const isOverdue = (j: DueJob, now: Date = new Date()) => { const d = dueOf(j); return !!d && +d < +now; };
/** "Due 14 Nov", "Due Today 3pm", or "Overdue 2 Days". */
export function dueLabel(j: DueJob, now: Date = new Date()): string {
  const d = dueOf(j);
  if (!d) return '';
  const ms = +d - +now;
  if (ms < 0) { const days = Math.floor(-ms / DAY); return days >= 1 ? `Overdue ${days} Day${days === 1 ? '' : 's'}` : `Overdue ${Math.max(1, Math.floor(-ms / HOUR))} Hr${Math.floor(-ms / HOUR) === 1 ? '' : 's'}`; }
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `Due Today ${time}` : `Due ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}
