// Maintenance / repair contract rules (340): job_status drives which tile a job
// sits in; each action moves it on. Pure functions only.

export type RepairJob = {
  id: string; site_id: string; job_number: string | null; address: string | null; description: string | null; created_at: string;
  job_status: string | null; closed: boolean | null; invoiced: boolean | null; survey_required: string | null; access_requirement: string | null; access_notes: string | null;
  survey_notes: string | null; survey_date: string | null; surveyed_by: string | null; survey_booking_date: string | null; survey_booking_assigned_to: string | null;
  variation_cost: number | null; variation_issued_at: string | null; quote_approved: boolean | null; quote_approved_at: string | null; approved_by: string | null; self_authorized: boolean | null;
  scaffold_booking_date: string | null; scaffold_erection_date: string | null; scaffold_booking_assigned_to: string | null;
  progress_notes: string | null; works_completed: boolean | null; works_completed_date: string | null; works_notes: string | null; priced_schedule_of_works: string | null;
  work_order_path: string | null; survey_event_id: string | null; survey_booking_event_id: string | null; scaffold_booking_event_id: string | null; scaffold_erection_event_id: string | null; works_completed_event_id: string | null;
};
type J = Pick<RepairJob, 'closed' | 'invoiced' | 'job_status' | 'works_completed'>;

export const REPAIR_STATUSES = ['To Survey', 'Surveyed - Awaiting Cost', 'Surveyed - Variation Issued', 'Approved - Awaiting Scaffold', 'Approved - To Do', 'In Progress', 'Rejected', 'Awaiting Sign-off', 'Closed'];
export const REPAIR_ACCESS: Record<string, string> = { none: 'None', ladder: 'Ladder', scaffold: 'Scaffold', tower: 'Tower' };

export const REPAIR_CATEGORIES: Record<string, { label: string; icon: string; match: (j: J) => boolean }> = {
  survey: { label: 'Jobs to Survey', icon: '🔍', match: (j) => !j.closed && (!j.job_status || j.job_status === 'To Survey') },
  awaiting_cost: { label: 'Surveyed — Awaiting Cost', icon: '💷', match: (j) => !j.closed && j.job_status === 'Surveyed - Awaiting Cost' },
  variation_issued: { label: 'Variation Issued', icon: '⏳', match: (j) => !j.closed && j.job_status === 'Surveyed - Variation Issued' },
  scaffold: { label: 'Approved — Awaiting Scaffold', icon: '🪜', match: (j) => !j.closed && j.job_status === 'Approved - Awaiting Scaffold' },
  approved: { label: 'Approved — To Do', icon: '✅', match: (j) => !j.closed && j.job_status === 'Approved - To Do' },
  in_progress: { label: 'In Progress', icon: '🔧', match: (j) => !j.closed && j.job_status === 'In Progress' },
  awaiting_signoff: { label: 'Awaiting Sign-off', icon: '🖊️', match: (j) => !j.closed && j.job_status === 'Awaiting Sign-off' },
  rejected: { label: 'Rejected', icon: '✕', match: (j) => !j.closed && j.job_status === 'Rejected' },
  to_invoice: { label: 'Closed — Subject to Invoice', icon: '🧾', match: (j) => !!j.closed && !j.invoiced },
  completed: { label: 'Completed Jobs', icon: '✔', match: (j) => !!j.works_completed },
  open: { label: 'Open Jobs', icon: '📂', match: (j) => !j.closed },
  closed: { label: 'Closed Jobs (Invoiced)', icon: '📁', match: (j) => !!j.closed && !!j.invoiced },
  all: { label: 'All Jobs', icon: '📋', match: () => true },
};
/** Tiles on the jobs hub, in order (Subject to Invoice is managers only). */
export const REPAIR_TILES = ['survey', 'awaiting_cost', 'variation_issued', 'scaffold', 'approved', 'in_progress', 'awaiting_signoff', 'rejected', 'to_invoice'];

export const needsScaffold = (j: Pick<RepairJob, 'access_requirement'>) => j.access_requirement === 'scaffold';

/** Survey Completed (Y) / N/A / not yet (N): the status it moves to. */
export function surveyStatusMove(j: RepairJob, value: string): string | undefined {
  if ((value === 'Y' || value === 'NA') && j.quote_approved == null && (!j.job_status || j.job_status === 'To Survey')) return j.variation_issued_at ? 'Surveyed - Variation Issued' : 'Surveyed - Awaiting Cost';
  if ((!value || value === 'N') && (!j.job_status || j.job_status === 'Surveyed - Awaiting Cost' || j.job_status === 'Surveyed - Variation Issued')) return 'To Survey';
  return undefined;
}
export const approveStatus = (j: RepairJob) => (needsScaffold(j) ? 'Approved - Awaiting Scaffold' : 'Approved - To Do');
/** Scaffold up → ready to do; erection date cleared → back to waiting. */
export function scaffoldMove(j: RepairJob, erection: string | null): string | undefined {
  if (erection && j.job_status === 'Approved - Awaiting Scaffold') return 'Approved - To Do';
  if (!erection && j.job_status === 'Approved - To Do' && needsScaffold(j)) return 'Approved - Awaiting Scaffold';
  return undefined;
}
export function progressMove(j: RepairJob, notes: string): string | undefined {
  return notes && (j.job_status === 'Approved - To Do' || j.job_status === 'Approved - Awaiting Scaffold') ? 'In Progress' : undefined;
}

export type RepairSort = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'job_number_asc' | 'approved_asc';
export const REPAIR_SORT_LABELS: Record<RepairSort, string> = {
  date_desc: 'Date Added (Newest First)', date_asc: 'Date Added (Oldest First)', name_asc: 'Address (A–Z)', name_desc: 'Address (Z–A)', job_number_asc: 'Job Number', approved_asc: 'Approved (Oldest First)',
};
export function sortRepairs<T extends Pick<RepairJob, 'created_at' | 'address' | 'job_number' | 'quote_approved_at'>>(list: T[], by: RepairSort): T[] {
  const t = (s: string | null) => (s ? new Date(s).getTime() : Infinity);
  const f: Record<RepairSort, (a: T, b: T) => number> = {
    date_desc: (a, b) => +new Date(b.created_at || 0) - +new Date(a.created_at || 0),
    date_asc: (a, b) => +new Date(a.created_at || 0) - +new Date(b.created_at || 0),
    name_asc: (a, b) => (a.address || '').localeCompare(b.address || ''),
    name_desc: (a, b) => (b.address || '').localeCompare(a.address || ''),
    job_number_asc: (a, b) => (a.job_number || '').localeCompare(b.job_number || '', undefined, { numeric: true }),
    approved_asc: (a, b) => t(a.quote_approved_at) - t(b.quote_approved_at),
  };
  return list.slice().sort(f[by] || f.date_desc);
}
export function matchesRepairSearch(j: Pick<RepairJob, 'address' | 'description' | 'job_number'>, q: string): boolean {
  const s = q.trim().toLowerCase();
  return !s || [j.address, j.description, j.job_number].some((x) => (x || '').toLowerCase().includes(s));
}
