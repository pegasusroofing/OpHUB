// HR › Employee Records (Andy, 14 Nov 2026: "add an employee records into hr which shows each individual user their own
// folder (admin has all users in there to click and choose)… personal details, contracts, job history, and document
// expiry dates, paired with a portal where staff can update information, read policies, and download payslips…
// continuous feedback, goal tracking, and recurring appraisal cycles… bonus… then create me items to go into these
// folders that you think would be beneficial for our company").
// The folders, what each one should hold for a UK roofing contractor, and the rules for what's missing, expiring or due.

export type HrFolder = 'contracts' | 'pay' | 'rtw' | 'licences' | 'health' | 'absence' | 'conduct' | 'other';
export const HR_FOLDERS: { k: HrFolder; l: string; self?: boolean; privateByDefault?: boolean }[] = [
  { k: 'contracts', l: 'Contracts & Letters' },
  { k: 'pay', l: 'Payslips & Tax' },
  { k: 'rtw', l: 'Right To Work & ID', self: true },
  { k: 'licences', l: 'Licences & Cards', self: true },
  { k: 'health', l: 'Health & Safety', self: true },
  { k: 'absence', l: 'Absence & Fit Notes', self: true },
  { k: 'conduct', l: 'Disciplinary & Grievance', privateByDefault: true },
  { k: 'other', l: 'Other' },
];
export const folderLabel = (k: string) => HR_FOLDERS.find((f) => f.k === k)?.l ?? 'Other';

export type EmploymentType = 'employee' | 'apprentice' | 'fixed_term' | 'cis' | 'agency';
export const EMPLOYMENT_TYPES: [EmploymentType, string][] = [
  ['employee', 'Employee'], ['apprentice', 'Apprentice'], ['fixed_term', 'Fixed Term'], ['cis', 'Self-Employed (CIS)'], ['agency', 'Agency'],
];
export const employmentLabel = (k?: string | null) => EMPLOYMENT_TYPES.find(([x]) => x === k)?.[1] ?? '—';

/** Who an item is for: everyone, employees (on the payroll), self-employed (CIS), site workers, drivers. */
type For = 'all' | 'employee' | 'cis' | 'site' | 'driver';
export type ChecklistItem = { key: string; folder: HrFolder; label: string; why: string; for: For; expires?: boolean; every?: number /* days: a fresh one is due this often */ };
/** The items worth keeping in each person's folder (the "items to go into these folders"). */
export const HR_CHECKLIST: ChecklistItem[] = [
  { key: 'contract', folder: 'contracts', label: 'Written Statement Of Employment (Contract)', why: 'The law says every employee and worker gets one from their first day.', for: 'employee' },
  { key: 'offer', folder: 'contracts', label: 'Offer Letter', why: 'What was agreed when they joined: start date, rate, hours.', for: 'employee' },
  { key: 'probation', folder: 'contracts', label: 'Probation Review Letter', why: 'Confirms they passed probation, or what was extended and why.', for: 'employee' },
  { key: 'cis_agreement', folder: 'contracts', label: 'Subcontract Agreement', why: 'Terms for self-employed labour: rates, insurance, CIS status.', for: 'cis' },
  { key: 'starter', folder: 'pay', label: 'P45 Or HMRC Starter Checklist', why: 'Needed to put them on the payroll on the right tax code.', for: 'employee' },
  { key: 'pension', folder: 'pay', label: 'Pension Enrolment Letter', why: 'Auto-enrolment: the letter telling them they’ve been enrolled (or why not).', for: 'employee' },
  { key: 'payslip', folder: 'pay', label: 'Payslips', why: 'Each pay day, so they can download them here.', for: 'employee', every: 35 },
  { key: 'p60', folder: 'pay', label: 'P60', why: 'Each April, their pay and tax for the year.', for: 'employee', every: 400 },
  { key: 'cis_verify', folder: 'pay', label: 'CIS Verification And UTR', why: 'HMRC verification reference and deduction rate before the first payment.', for: 'cis' },
  { key: 'insurance', folder: 'pay', label: 'Public Liability Insurance', why: 'Self-employed labour should carry their own cover; check it hasn’t lapsed.', for: 'cis', expires: true },
  { key: 'rtw', folder: 'rtw', label: 'Right To Work Check', why: 'A copy of the passport or Home Office share code check, dated. Fines of up to £60,000 per illegal worker.', for: 'all', expires: true },
  { key: 'photo_id', folder: 'rtw', label: 'Photo ID', why: 'Passport or driving licence, for site inductions and the CSCS card.', for: 'all' },
  { key: 'address', folder: 'rtw', label: 'Proof Of Address', why: 'A recent bill or bank letter.', for: 'all' },
  { key: 'driving', folder: 'licences', label: 'Driving Licence', why: 'Front and back, for anyone who drives a company vehicle.', for: 'driver', expires: true },
  { key: 'dvla', folder: 'licences', label: 'DVLA Licence Check', why: 'A check code each year for points and bans; insurers ask for it.', for: 'driver', every: 365 },
  { key: 'induction', folder: 'health', label: 'Company Induction Record', why: 'Signed record of their company H&S induction.', for: 'site' },
  { key: 'health_q', folder: 'health', label: 'Health Questionnaire', why: 'Fit for work at height and with the tools they’ll use.', for: 'site' },
  { key: 'havs', folder: 'health', label: 'HAVS Health Check', why: 'Yearly questionnaire for anyone using vibrating tools (disc cutters, breakers, nailers).', for: 'site', every: 365 },
];

export type HrRecord = {
  user_id: string; org_id: string;
  date_of_birth?: string | null; home_address?: string | null; postcode?: string | null; personal_phone?: string | null; personal_email?: string | null;
  emergency_name?: string | null; emergency_relationship?: string | null; emergency_phone?: string | null;
  job_title?: string | null; department?: string | null; employment_type?: string | null; start_date?: string | null; probation_end?: string | null; end_date?: string | null;
  contracted_hours?: string | null; line_manager_id?: string | null; rtw_checked_on?: string | null; rtw_document?: string | null; rtw_expiry?: string | null;
  updated_at?: string | null;
};
export type HrDoc = { id: string; org_id: string; user_id: string; folder: string; item_key: string | null; title: string; file_name: string | null; storage_path: string; doc_date: string | null; expiry_date: string | null; hidden_from_employee: boolean; uploaded_by: string | null; created_at: string };

const isEmployee = (t?: string | null) => !t || ['employee', 'apprentice', 'fixed_term'].includes(t);
/** The items for this person: by how they're employed and what they do. */
export function itemsFor(rec: HrRecord | null | undefined, role: string): ChecklistItem[] {
  const t = rec?.employment_type;
  return HR_CHECKLIST.filter((i) => i.for === 'all'
    || (i.for === 'employee' && isEmployee(t))
    || (i.for === 'cis' && t === 'cis')
    || (i.for === 'site' && ['operative', 'site_manager', 'driver'].includes(role))
    || (i.for === 'driver' && role === 'driver'));
}

const dayMs = 864e5;
const at = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).getTime();
export type ItemState = 'missing' | 'ok' | 'expiring' | 'expired' | 'due';
/** Where one item stands: nothing on file, fine, expiring within 30 days, expired, or a fresh one due. */
export function itemState(item: ChecklistItem, docs: HrDoc[], today = new Date().toISOString().slice(0, 10), rec?: HrRecord | null): { state: ItemState; doc: HrDoc | null } {
  const mine = docs.filter((d) => d.item_key === item.key).sort((a, b) => (b.doc_date || b.created_at).localeCompare(a.doc_date || a.created_at));
  const doc = mine[0] ?? null;
  // The right to work check can also be recorded on the record itself (checked on / expires).
  const expiry = doc?.expiry_date || (item.key === 'rtw' ? rec?.rtw_expiry : null) || null;
  if (!doc && !(item.key === 'rtw' && rec?.rtw_checked_on)) return { state: 'missing', doc: null };
  if (item.expires && expiry) {
    const left = (at(expiry) - at(today)) / dayMs;
    if (left < 0) return { state: 'expired', doc };
    if (left <= 30) return { state: 'expiring', doc };
  }
  if (item.every && doc) {
    const since = (at(today) - at(doc.doc_date || doc.created_at)) / dayMs;
    if (since > item.every) return { state: 'due', doc };
  }
  return { state: 'ok', doc };
}
export const STATE_LABEL: Record<ItemState, string> = { missing: 'Not On File', ok: 'On File', expiring: 'Expiring Soon', expired: 'Expired', due: 'New One Due' };

/** Any document with an expiry date: expired, or expiring within 30 days. */
export function expiringDocs(docs: HrDoc[], today = new Date().toISOString().slice(0, 10)) {
  return docs.filter((d) => d.expiry_date && (at(d.expiry_date) - at(today)) / dayMs <= 30)
    .map((d) => ({ doc: d, expired: at(d.expiry_date as string) < at(today) }));
}

// ---------- performance ----------
export const GOAL_STATUS: [string, string][] = [['not_started', 'Not Started'], ['on_track', 'On Track'], ['at_risk', 'At Risk'], ['done', 'Done']];
export const goalStatusLabel = (k: string) => GOAL_STATUS.find(([x]) => x === k)?.[1] ?? 'Not Started';
/** Goals worth suggesting to a roofer / site team. */
export const GOAL_IDEAS = [
  'Pass The SSSTS (Site Supervisor) Course', 'Get An IPAF Or PASMA Ticket', 'Complete NVQ Level 2 In Roofing', 'Upgrade To A Gold CSCS Card',
  'Three Snag-Free Handovers In A Row', 'No Missed RAMS Or Toolbox Talk Signatures This Quarter', 'Mentor An Apprentice', 'Learn To Price Small Repairs',
];
export const FEEDBACK_KINDS: [string, string][] = [['praise', 'Praise'], ['improve', 'To Work On'], ['note', 'Manager Note']];

/** The appraisal: the person's own side, then the manager's scores (1 to 5) and comments. */
export const APPRAISAL_SELF = [
  'What has gone well since your last review?',
  'What has been difficult, and what would have helped?',
  'Which training, tickets or cards would help you most?',
  'Any health and safety worries on site?',
  'Where would you like to be in a year’s time?',
];
export const APPRAISAL_SCORES = ['Quality Of Work', 'Health & Safety', 'Timekeeping & Attendance', 'Teamwork', 'Conduct With Clients & On Site', 'Care Of Tools, Plant & Materials'];
export type Appraisal = { id: string; user_id: string; manager_id: string | null; due_date: string; status: 'due' | 'self_done' | 'done'; self_answers: Record<string, string> | null; review: { scores?: Record<string, number>; comments?: string; goals?: string } | null; rating: number | null; summary: string | null; completed_at: string | null; created_at: string };
export const APPRAISAL_STATUS: Record<string, string> = { due: 'Waiting For Their Side', self_done: 'Ready For Review', done: 'Signed Off' };

const addMonths = (d: string, n: number) => { const x = new Date(`${d.slice(0, 10)}T12:00:00`); x.setMonth(x.getMonth() + n); return x.toISOString().slice(0, 10); };
/** When the next appraisal is due: an open one's date; else the last signed off + the cycle; else the end of probation;
 *  else the start date + the cycle. Null if there's nothing to go on. */
export function nextAppraisal(rec: HrRecord | null | undefined, apps: Appraisal[], months = 12, today = new Date().toISOString().slice(0, 10)): { due: string; open: Appraisal | null; overdue: boolean } | null {
  const open = apps.find((a) => a.status !== 'done') ?? null;
  const last = apps.filter((a) => a.status === 'done' && a.completed_at).sort((a, b) => (b.completed_at as string).localeCompare(a.completed_at as string))[0];
  const due = open ? open.due_date
    : last ? addMonths(last.completed_at as string, months)
      : rec?.probation_end && rec.probation_end >= (rec.start_date || '') ? rec.probation_end
        : rec?.start_date ? addMonths(rec.start_date, months) : null;
  return due ? { due, open, overdue: due < today } : null;
}

// ---------- bonus ----------
export const BONUS_BASIS: [string, string][] = [
  ['safety', 'Safety Record'], ['quality', 'Snag-Free Handovers'], ['programme', 'Finished On Programme'], ['attendance', 'Attendance'], ['sales', 'Work Won'], ['discretionary', 'Discretionary'],
];
export const BONUS_STATUS: [string, string][] = [['proposed', 'Proposed'], ['approved', 'Approved'], ['paid', 'Paid'], ['not_met', 'Target Not Met']];
export const HISTORY_KINDS: [string, string][] = [['started', 'Started'], ['role', 'Role Change'], ['pay', 'Pay Review'], ['training', 'Training'], ['note', 'Note'], ['left', 'Left']];
