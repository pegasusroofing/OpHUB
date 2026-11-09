// Repair contracts, rebuilt (Andy, 7 Nov 2026; docs/claude-code/REPAIRS-PLAN.md): six stages on the progress bar —
// To Book, Booked In, Attended, Quote, Approved, Works Done — then Invoiced and Paid in Finance. On Hold and Other
// Trades (scaffold…) are flags, not stages. The stage is worked out from the job's fields, so the jobs made before
// (with the old job_status) land in the right place without anything being rewritten. Pure functions only.

import { isOverdue } from './repairDue.ts';

export type RJob = {
  id: string; job_number?: string | null; address?: string | null; description?: string | null; created_at?: string | null;
  job_status?: string | null; closed?: boolean | null; invoiced?: boolean | null; works_completed?: boolean | null; works_completed_date?: string | null;
  survey_required?: string | null; survey_date?: string | null; survey_booking_date?: string | null; survey_booking_assigned_to?: string | null; surveyed_by?: string | null;
  quote_approved?: boolean | null; quote_approved_at?: string | null; variation_issued_at?: string | null; variation_cost?: number | null;
  completed_in_visit?: boolean | null; works_booking_date?: string | null; works_booking_assigned_to?: string | null;
  survey_booking_slot?: string | null; survey_booking_notes?: string | null; works_booking_slot?: string | null; works_booking_notes?: string | null;
  on_hold?: boolean | null; on_hold_reason?: string | null; other_trades?: string | null; other_trades_date?: string | null;
  access_requirement?: string | null; scaffold_erection_date?: string | null; invoice_id?: string | null;
  tenant_name?: string | null; tenant_phone?: string | null; tenant_no?: string | null; priority?: string | null;
  fault_description?: string | null; repair_description?: string | null; quote_lines?: unknown; quote_discount_pct?: number | null;
  geofence_lat?: number | null; geofence_lon?: number | null; geofence_radius_m?: number | null;
  due_at?: string | null; no_access?: unknown;
};
export type Stage = 'to_book' | 'booked' | 'attended' | 'quote_needed' | 'awaiting_approval' | 'approved' | 'works_booked' | 'done' | 'rejected';

// Andy's wording (7 Nov 2026): To Schedule, Scheduled - Awaiting Attendance, Quotation Required, Awaiting Client
// Approval, Approved - Requires Booking Date, On Hold / Other Trades, Completed Works.
export const STAGE_LABEL: Record<Stage, string> = {
  to_book: 'To Schedule', booked: 'Scheduled - Awaiting Attendance', attended: 'Attended', quote_needed: 'Quotation Required', awaiting_approval: 'Awaiting Client Approval',
  approved: 'Approved - Requires Booking Date', works_booked: 'Repair Booked', done: 'Completed Works', rejected: 'Rejected',
};
/** The old app's status for a stage, written alongside so the old app (still live) shows the job sensibly. */
export const OLD_STATUS: Record<Stage, string> = {
  to_book: 'To Survey', booked: 'To Survey', attended: 'Surveyed - Awaiting Cost', quote_needed: 'Surveyed - Awaiting Cost', awaiting_approval: 'Surveyed - Variation Issued',
  approved: 'Approved - To Do', works_booked: 'Approved - To Do', done: 'Awaiting Sign-off', rejected: 'Rejected',
};
/** Waiting on other trades: set on the job, or one of the old "approved, awaiting scaffold" jobs. */
export const otherTradesOf = (j: RJob): string | null => j.other_trades || (j.job_status === 'Approved - Awaiting Scaffold' && !j.scaffold_erection_date ? 'Scaffold' : null);
/** The progress bar's steps (Projects shows the first seven; Finance adds Invoiced and Paid). Repair Booked: the
 *  works visit's date, after approval (Andy, 7 Nov 2026). */
export const BAR = ['To Schedule', 'Scheduled', 'Attended', 'Quote', 'Approved', 'Repair Booked', 'Completed', 'Invoiced', 'Paid'];
export const BAR_PROJECTS = 7;

export const attendedOf = (j: RJob) => j.survey_required === 'Y' || j.survey_required === 'NA';

const OLD_APPROVED = ['Approved - To Do', 'Approved - Awaiting Scaffold', 'In Progress'];
export function repairStage(j: RJob): Stage {
  // The old app's status counts too: a manager could move a job on without ticking its boxes.
  const st = j.job_status || '';
  if (j.quote_approved === false || st === 'Rejected') return 'rejected';
  if (j.works_completed || j.closed || st === 'Closed' || st === 'Awaiting Sign-off') return 'done';
  if (j.quote_approved === true || OLD_APPROVED.includes(st)) return j.works_booking_date ? 'works_booked' : 'approved';
  if (attendedOf(j)) {
    if (j.variation_issued_at || st === 'Surveyed - Variation Issued') return 'awaiting_approval';
    // Not done in the visit (or one of the old "surveyed, awaiting cost" jobs): it needs pricing.
    if (j.completed_in_visit === false || (j.completed_in_visit == null && j.job_status === 'Surveyed - Awaiting Cost')) return 'quote_needed';
    return 'attended';
  }
  if (j.survey_booking_date) return 'booked';
  return 'to_book';
}

/** Where the job is on the bar (1–9), and whether Quote, Approved and Repair Booked were skipped (done in the visit). */
export function barState(j: RJob, inv?: { status?: string | null } | null): { step: number; skipQuote: boolean; rejected: boolean } {
  const s = repairStage(j);
  const skipQuote = s === 'done' && j.quote_approved == null && !j.variation_issued_at;
  const paid = inv?.status === 'paid', issued = !!inv && !['draft', 'void'].includes(String(inv.status || ''));
  const step = s === 'to_book' ? 1 : s === 'booked' ? 2 : s === 'attended' ? 3 : s === 'quote_needed' || s === 'awaiting_approval' ? 4
    : s === 'approved' ? 5 : s === 'works_booked' ? 6 : s === 'done' ? (paid ? 9 : issued || j.invoiced ? 8 : 7) : 4;
  return { step, skipQuote, rejected: s === 'rejected' };
}

/** No access visits (Andy, 7 Nov 2026): nobody in, a card left (with a photo of it); the job goes back to be booked. */
export type NoAccess = { at: string; by?: string | null; by_name?: string | null; note?: string | null; visit?: 'attend' | 'works' };
export const noAccessOf = (j: RJob): NoAccess[] => (Array.isArray(j.no_access) ? (j.no_access as NoAccess[]) : []);

/** Other trades on a job (scaffold, electrician…), each with its booked date; the jobs from before had one text field. */
export type Trade = { id: string; trade: string; date?: string | null; done?: boolean; done_at?: string | null; po_id?: string | null; po_number?: string | null }; // po_*: the PO raised for it (Andy, 9 Nov 2026)
export function tradesOf(j: RJob & { trades?: unknown }): Trade[] {
  if (Array.isArray(j.trades)) return j.trades as Trade[];
  return j.other_trades ? [{ id: 'legacy', trade: j.other_trades, date: j.other_trades_date || null }] : [];
}
/** What the old fields hold for a list of trades: the ones still to do, and the soonest of their dates. */
export function tradesSummary(list: Trade[]): { other_trades: string | null; other_trades_date: string | null } {
  const open = list.filter((t) => !t.done && t.trade.trim());
  const dates = open.map((t) => t.date).filter((d): d is string => !!d).sort();
  return { other_trades: open.map((t) => t.trade.trim()).join(', ') || null, other_trades_date: dates[0] || null };
}

/** What happens next, in a line. */
/** fin: Finance (who prices quotes); in Projects a quote is "with Finance to price" (Andy, 7 Nov 2026: no money in Projects). */
export function nextHint(j: RJob, mgr: boolean, fin = false): string {
  const s = repairStage(j);
  const hold = j.on_hold ? ` On hold${j.on_hold_reason ? `: ${j.on_hold_reason}` : ''}.` : '';
  const trades = otherTradesOf(j) ? ` Waiting on ${otherTradesOf(j)}${j.other_trades_date ? ` (${j.other_trades_date})` : ''}.` : '';
  const t: Record<Stage, string> = {
    to_book: mgr ? 'Next: book it in with the tenant and an operative.' : 'Waiting to be booked in.',
    booked: 'Next: attend, check in and go through the steps.',
    attended: j.completed_in_visit ? 'Next: completion photos and the works completed.' : 'Next: was the repair completed whilst in attendance? Yes, or it needs a quote.',
    quote_needed: fin ? 'Next: price it from the attendance report and send the quote.' : mgr ? 'With Finance to price.' : 'With the office to price.',
    awaiting_approval: 'Quote submitted. Waiting for the client to approve it.',
    approved: mgr ? 'Next: book the works in.' : 'Approved — waiting for a date.',
    works_booked: 'Next: attend and do the works.',
    done: j.closed ? 'Done and checked. Ready to invoice.' : mgr ? 'Done. Check it, then it’s ready to invoice.' : 'Done — thank you.',
    rejected: 'The client turned the quote down.',
  };
  return `${t[s]}${hold}${trades}`.trim();
}

/** The date it's booked for: the works visit once approved, else the first visit. */
export const bookedFor = (j: RJob): string | null => (j.quote_approved === true ? j.works_booking_date || null : j.survey_booking_date || null);
/** Who it's booked to (the same way round). */
export const bookedTo = (j: RJob): string | null => (j.quote_approved === true ? j.works_booking_assigned_to || null : j.survey_booking_assigned_to || null);
/** Its time slot and the notes for the booking (Andy, 8 Nov 2026), the same way round. */
export const bookedSlot = (j: RJob): string | null => (j.quote_approved === true ? j.works_booking_slot || null : j.survey_booking_slot || null);
export const bookedNotes = (j: RJob): string | null => (j.quote_approved === true ? j.works_booking_notes || null : j.survey_booking_notes || null);
/** The time slots a booking can have (Andy, 8 Nov 2026). */
export const TIME_SLOTS = ['AM (8am – 12pm)', 'PM (12pm – 5pm)', 'All Day', '8am – 10am', '10am – 12pm', '12pm – 2pm', '2pm – 4pm'];
/** The slot's short form, for a box or a calendar title: AM, PM, All Day or the hours. */
export const slotShort = (s: string | null | undefined) => (s ? s.replace(/\s*\(.*\)$/, '') : '');

export const isOpen = (j: RJob) => !['done', 'rejected'].includes(repairStage(j));

/** An operative's Works Orders: the open jobs booked to them, soonest first. Nobody booked on any yet: all of them. */
export function operativeJobs<T extends RJob>(jobs: T[], me: string, showAll: boolean): { list: T[]; mine: number; all: number; fallback: boolean } {
  const open = jobs.filter(isOpen);
  const mine = open.filter((j) => bookedTo(j) === me || (repairStage(j) === 'attended' && j.surveyed_by === me));
  const fallback = !open.some((j) => bookedTo(j));
  const pick = showAll || fallback ? open : mine;
  return { list: byBooking(pick), mine: mine.length, all: open.length, fallback };
}

/** Soonest booking first; not booked yet at the end (newest first). */
export function byBooking<T extends RJob>(list: T[]): T[] {
  return list.slice().sort((a, b) => {
    const x = bookedFor(a), y = bookedFor(b);
    if (x && y) return x < y ? -1 : x > y ? 1 : 0;
    if (x) return -1; if (y) return 1;
    return String(b.created_at || '') < String(a.created_at || '') ? -1 : 1;
  });
}

/** The boxes on Works Orders (Andy's wording, 7 Nov 2026). paid: the ids of jobs whose invoice is paid.
 *  op: an operative sees these, Completed Works without "To Invoice"; mgr: managers only. */
export type Box = { k: string; l: string; op?: string; mgrOnly?: boolean; test: (j: RJob, paid?: Set<string>) => boolean };
export const BOXES: Box[] = [
  // Past the due date from its priority (Andy, 7 Nov 2026).
  { k: 'overdue', l: 'Overdue', test: (j) => isOpen(j) && isOverdue(j) },
  { k: 'to_book', l: 'To Schedule', test: (j) => repairStage(j) === 'to_book' && !j.on_hold },
  { k: 'booked', l: 'Scheduled - Awaiting Attendance', test: (j) => ['booked', 'works_booked'].includes(repairStage(j)) && !j.on_hold },
  { k: 'quote_needed', l: 'Quotation Required', mgrOnly: true, test: (j) => repairStage(j) === 'quote_needed' && !j.on_hold },
  { k: 'awaiting_approval', l: 'Awaiting Client Approval', test: (j) => repairStage(j) === 'awaiting_approval' && !j.on_hold },
  { k: 'approved', l: 'Approved - Requires Booking Date', test: (j) => repairStage(j) === 'approved' && !j.on_hold && !otherTradesOf(j) },
  { k: 'waiting', l: 'On Hold / Other Trades', test: (j) => isOpen(j) && (!!j.on_hold || !!otherTradesOf(j)) },
  { k: 'done', l: 'Completed Works - To Invoice', op: 'Completed Works', test: (j) => repairStage(j) === 'done' && !j.invoiced && !j.invoice_id },
  { k: 'paid', l: 'Completed Works - Paid', mgrOnly: true, test: (j, paid) => !!paid?.has(j.id) },
  { k: 'all', l: 'All Jobs', test: () => true },
];

/** A day heading for the operative's list. */
export function dayHeading(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'Not Booked Yet';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`), t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((+d - +t) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 0) return 'Overdue';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}
