// Repair contracts, rebuilt (Andy, 7 Nov 2026; docs/claude-code/REPAIRS-PLAN.md): six stages on the progress bar —
// To Book, Booked In, Attended, Quote, Approved, Works Done — then Invoiced and Paid in Finance. On Hold and Other
// Trades (scaffold…) are flags, not stages. The stage is worked out from the job's fields, so the jobs made before
// (with the old job_status) land in the right place without anything being rewritten. Pure functions only.

export type RJob = {
  id: string; job_number?: string | null; address?: string | null; description?: string | null; created_at?: string | null;
  job_status?: string | null; closed?: boolean | null; invoiced?: boolean | null; works_completed?: boolean | null; works_completed_date?: string | null;
  survey_required?: string | null; survey_date?: string | null; survey_booking_date?: string | null; survey_booking_assigned_to?: string | null; surveyed_by?: string | null;
  quote_approved?: boolean | null; quote_approved_at?: string | null; variation_issued_at?: string | null; variation_cost?: number | null;
  completed_in_visit?: boolean | null; works_booking_date?: string | null; works_booking_assigned_to?: string | null;
  on_hold?: boolean | null; on_hold_reason?: string | null; other_trades?: string | null; other_trades_date?: string | null;
  access_requirement?: string | null; scaffold_erection_date?: string | null; invoice_id?: string | null;
  tenant_name?: string | null; tenant_phone?: string | null; tenant_no?: string | null; priority?: string | null;
  fault_description?: string | null; repair_description?: string | null; quote_lines?: unknown; quote_discount_pct?: number | null;
  geofence_lat?: number | null; geofence_lon?: number | null; geofence_radius_m?: number | null;
};
export type Stage = 'to_book' | 'booked' | 'attended' | 'quote_needed' | 'awaiting_approval' | 'approved' | 'works_booked' | 'done' | 'rejected';

export const STAGE_LABEL: Record<Stage, string> = {
  to_book: 'To Book', booked: 'Booked In', attended: 'Attended', quote_needed: 'Quote Needed', awaiting_approval: 'Awaiting Approval',
  approved: 'Approved — To Book', works_booked: 'Approved — Booked In', done: 'Works Done', rejected: 'Rejected',
};
/** The old app's status for a stage, written alongside so the old app (still live) shows the job sensibly. */
export const OLD_STATUS: Record<Stage, string> = {
  to_book: 'To Survey', booked: 'To Survey', attended: 'Surveyed - Awaiting Cost', quote_needed: 'Surveyed - Awaiting Cost', awaiting_approval: 'Surveyed - Variation Issued',
  approved: 'Approved - To Do', works_booked: 'Approved - To Do', done: 'Awaiting Sign-off', rejected: 'Rejected',
};
/** Waiting on other trades: set on the job, or one of the old "approved, awaiting scaffold" jobs. */
export const otherTradesOf = (j: RJob): string | null => j.other_trades || (j.job_status === 'Approved - Awaiting Scaffold' && !j.scaffold_erection_date ? 'Scaffold' : null);
/** The progress bar's steps (Projects shows the first six; Finance adds Invoiced and Paid). */
export const BAR = ['To Book', 'Booked In', 'Attended', 'Quote', 'Approved', 'Works Done', 'Invoiced', 'Paid'];

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

/** Where the job is on the bar (1–8), whether Quote and Approved were skipped, and the label for step 5. */
export function barState(j: RJob, inv?: { status?: string | null } | null): { step: number; skipQuote: boolean; rejected: boolean } {
  const s = repairStage(j);
  const skipQuote = s === 'done' && j.quote_approved == null && !j.variation_issued_at;
  const paid = inv?.status === 'paid', issued = !!inv && !['draft', 'void'].includes(String(inv.status || ''));
  const step = s === 'to_book' ? 1 : s === 'booked' ? 2 : s === 'attended' ? 3 : s === 'quote_needed' || s === 'awaiting_approval' ? 4
    : s === 'approved' || s === 'works_booked' ? 5 : s === 'done' ? (paid ? 8 : issued || j.invoiced ? 7 : 6) : 4;
  return { step, skipQuote, rejected: s === 'rejected' };
}

/** What happens next, in a line. */
export function nextHint(j: RJob, mgr: boolean): string {
  const s = repairStage(j);
  const hold = j.on_hold ? ` On hold${j.on_hold_reason ? `: ${j.on_hold_reason}` : ''}.` : '';
  const trades = otherTradesOf(j) ? ` Waiting on ${otherTradesOf(j)}${j.other_trades_date ? ` (${j.other_trades_date})` : ''}.` : '';
  const t: Record<Stage, string> = {
    to_book: mgr ? 'Next: book it in with the tenant and an operative.' : 'Waiting to be booked in.',
    booked: 'Next: attend, check in and go through the steps.',
    attended: j.completed_in_visit ? 'Next: completion photos and the works completed.' : 'Next: was it completed in the visit? Yes, or it needs a quote.',
    quote_needed: mgr ? 'Next: price it from the attendance report and send the quote.' : 'With the office to price.',
    awaiting_approval: 'Waiting for the client to approve the quote.',
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

/** The managers' boxes on Works Orders. */
export const BOXES: { k: string; l: string; test: (j: RJob) => boolean }[] = [
  { k: 'to_book', l: 'To Book', test: (j) => repairStage(j) === 'to_book' && !j.on_hold },
  { k: 'booked', l: 'Booked In', test: (j) => ['booked', 'works_booked'].includes(repairStage(j)) && !j.on_hold },
  { k: 'quote_needed', l: 'Quote Needed', test: (j) => repairStage(j) === 'quote_needed' && !j.on_hold },
  { k: 'awaiting_approval', l: 'Awaiting Approval', test: (j) => repairStage(j) === 'awaiting_approval' && !j.on_hold },
  { k: 'approved', l: 'Approved — To Book', test: (j) => repairStage(j) === 'approved' && !j.on_hold && !otherTradesOf(j) },
  { k: 'waiting', l: 'On Hold / Other Trades', test: (j) => isOpen(j) && (!!j.on_hold || !!otherTradesOf(j)) },
  { k: 'done', l: 'Works Done, To Invoice', test: (j) => repairStage(j) === 'done' && !j.invoiced && !j.invoice_id },
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
