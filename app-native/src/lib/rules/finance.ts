// Finance rules (900 / 901 / 902 / 903 / 905 / 9219e): money, dates,
// what's owed and overdue, retention held / released / due, application
// dates, plant hire cost, and the TRIAL switch. Pure.

// ---------- TRIAL (9219e) ----------
/** While on, nothing goes out from Finance: no Xero posting, no finance emails, no inbox processing, no PM pushes. Don't switch off unless Andy says so. */
export const FIN_TRIAL = true;
/** Sandbox Roofing Ltd — the trial blocks don't apply there. */
export const FIN_SANDBOX_ORGS = ['2eb072b7-2704-48c0-8110-62e45e621ded'];
export const FIN_TRIAL_MSG = 'Finance trial — switched off while testing';
/** Xero actions the Directory may still use during the trial (reading / adding contacts). */
const XERO_CLIENT_OK = ['status', 'customers', 'suppliers', 'contact', 'create_contact', 'connect', 'disconnect'];
export function finBlocked(fn: string, action: string | undefined, orgId: string | null | undefined): boolean {
  if (!FIN_TRIAL || (orgId && FIN_SANDBOX_ORGS.includes(orgId))) return false;
  if (fn === 'xero' && XERO_CLIENT_OK.includes(action || '')) return false;
  return ['send-finance-email', 'xero', 'finance-inbox', 'finance-ai-read'].includes(fn);
}

// ---------- money and dates ----------
export const FIN_DEFAULTS = { invoice_prefix: 'INV-', next_invoice_number: 1001, default_retention_pct: 5, default_due_days: 30, default_final_days: 14, default_vat: 'standard', app_reminder_day: null as number | null, default_defects_months: 12 as number | null };
export type FinSettings = typeof FIN_DEFAULTS & Record<string, unknown>;
export const FIN_VAT_LABEL: Record<string, string> = { standard: 'Standard VAT (20%)', reverse_charge: 'Domestic reverse charge (CIS)', zero: 'Zero rated / no VAT' };
export function money(n: unknown, dp = 2): string {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '—';
  const v = Number(n);
  return `${v < 0 ? '−' : ''}£${Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}
/** A typed amount: null when blank, NaN when not a number. */
export function num(v: unknown): number | null {
  const s = String(v === undefined || v === null ? '' : v).replace(/[£,\s]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return isNaN(n) ? NaN : n;
}
export const round2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = (now = new Date()) => iso(now);
export function addDays(d: string, n: number) { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + (Number(n) || 0)); return iso(x); }
export function addMonths(d: string, n: number) {
  const x = new Date(`${d}T12:00:00`), day = x.getDate();
  x.setDate(1); x.setMonth(x.getMonth() + (Number(n) || 0));
  x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  return iso(x);
}
export const fdate = (d: string | null | undefined) => (d ? new Date(d + (String(d).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// ---------- sales invoices ----------
export type FinInv = { id: string; site_id: string; status: string; due_date?: string | null; issue_date?: string | null; total?: number | null; paid?: number | null; net?: number | null; number?: string | null; vat?: number | null };
const OPEN = ['issued', 'sent', 'part_paid'];
export const invOutstanding = (i: FinInv) => (OPEN.includes(i.status) ? round2(Number(i.total || 0) - Number(i.paid || 0)) : 0);
export function invOutstandingNet(i: FinInv) { const o = invOutstanding(i), t = Number(i.total || 0), n = Number(i.net || 0); return o && t ? round2((o * n) / t) : 0; }
export const invOverdue = (i: FinInv, now = today()) => OPEN.includes(i.status) && !!i.due_date && i.due_date < now;
export const INV_STATUS: Record<string, string> = { draft: 'Draft', issued: 'Issued', sent: 'Sent', part_paid: 'Part paid', paid: 'Paid', void: 'Void' };

// ---------- retention (903) ----------
export type FinApp = { id?: string; site_id?: string; number: number; status: string; valuation_date?: string | null; cert_retention?: number | null; cert_date?: string | null };
export type JobFin = { site_id?: string; contract_value?: number | null; pc_date?: string | null; defects_months?: number | null; final_release_date?: string | null; ret1_invoice_id?: string | null; ret2_invoice_id?: string | null; ret1_app_id?: string | null; ret2_app_id?: string | null; app_reminder_day?: number | null; app_dates?: Record<string, string> | null; billing_type?: string | null };
export function retentionHeld(apps: FinApp[]) {
  const c = apps.filter((a) => a.cert_retention != null && a.status !== 'void').sort((x, y) => y.number - x.number)[0];
  return c ? round2(c.cert_retention) : 0;
}
function retentionDrop(apps: FinApp[]) {
  const c = apps.filter((a) => a.cert_retention != null && a.status !== 'void').sort((x, y) => x.number - y.number);
  if (!c.length) return { amt: 0, date: null as string | null };
  let peak = 0, date: string | null = null;
  c.forEach((a, i) => { const v = Number(a.cert_retention || 0); if (i && v < Number(c[i - 1].cert_retention || 0) - 0.005) date = a.cert_date || a.valuation_date || null; peak = Math.max(peak, v); });
  return { amt: round2(Math.max(0, peak - Number(c[c.length - 1].cert_retention || 0))), date };
}
/** Retention released by invoice — less any drop already shown on a later certificate. */
export function retentionReleased(jf: JobFin | null | undefined, invs: FinInv[], apps?: FinApp[]) {
  const list = [jf?.ret1_invoice_id, jf?.ret2_invoice_id].map((id) => id && invs.find((x) => x.id === id)).filter((i): i is FinInv => !!i && !['void', 'draft'].includes(i.status));
  const sum = (arr: FinInv[]) => arr.reduce((t, i) => t + Number(i.net || 0), 0);
  if (!apps) return round2(sum(list));
  const drop = retentionDrop(apps);
  if (!(drop.amt > 0)) return round2(sum(list));
  const before = list.filter((i) => !drop.date || !i.issue_date || String(i.issue_date).slice(0, 10) <= drop.date), after = list.filter((i) => !before.includes(i));
  return round2(sum(after) + Math.max(0, sum(before) - drop.amt));
}
export const retentionStillHeld = (apps: FinApp[], jf: JobFin | null | undefined, invs: FinInv[]) => round2(Math.max(0, retentionHeld(apps) - retentionReleased(jf, invs, apps)));
export function retentionDates(jf: JobFin | null | undefined, st: Partial<FinSettings>) {
  if (!jf || !jf.pc_date) return { first: null as string | null, second: jf?.final_release_date || null };
  const months = jf.defects_months != null ? jf.defects_months : st.default_defects_months != null ? Number(st.default_defects_months) : 12;
  return { first: jf.pc_date, second: jf.final_release_date || addMonths(jf.pc_date, months), months };
}
export const retHalf = (held: number, n: 1 | 2) => { const a = round2(held / 2); return n === 1 ? a : round2(held - a); };
/** Halves due within 30 days (or past) and not yet invoiced or applied for. */
export function retentionAlerts(jf: JobFin | null | undefined, st: Partial<FinSettings>, held: number, now = today()) {
  if (!held || !jf) return [];
  const d = retentionDates(jf, st), soon = addDays(now, 30), out: { half: 1 | 2; date: string }[] = [];
  if (d.first && !jf.ret1_invoice_id && !jf.ret1_app_id && d.first <= soon) out.push({ half: 1, date: d.first });
  if (d.second && !jf.ret2_invoice_id && !jf.ret2_app_id && d.second <= soon) out.push({ half: 2, date: d.second });
  return out;
}

// ---------- applications (902) ----------
export const appDayFor = (jf: JobFin | null | undefined, st: Partial<FinSettings>) => Number(jf?.app_reminder_day || st.app_reminder_day || 0) || null;
export function appDateFor(jf: JobFin | null | undefined, st: Partial<FinSettings>, ym: string) {
  const custom = jf?.app_dates?.[ym];
  if (custom) return custom;
  const day = appDayFor(jf, st); if (!day) return null;
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(Math.min(day, new Date(y, m, 0).getDate())).padStart(2, '0')}`;
}
/** This month's application is due (its date has come) and none has been made this month. */
export function appDueThisMonth(apps: FinApp[], due: string | null, now = today()) {
  if (!due || now < due) return false;
  const ym = now.slice(0, 7);
  return !apps.some((a) => a.status !== 'void' && String(a.valuation_date || '').slice(0, 7) === ym);
}

// ---------- plant hire (905) ----------
export function plantCost(h: { on_hire: string; off_hire?: string | null; rate?: number | null; rate_period?: string | null }, now = today()) {
  const end = h.off_hire || now;
  const days = Math.max(1, Math.round((new Date(`${end}T12:00:00`).getTime() - new Date(`${h.on_hire}T12:00:00`).getTime()) / 864e5) + 1);
  const cost = h.rate_period === 'day' ? days * Number(h.rate || 0) : round2((days / 7) * Number(h.rate || 0));
  return { days, weeks: Math.round((days / 7) * 10) / 10, cost: round2(cost) };
}

/** Job tag "J101 · Studley Rd". */
export const jobTag = (s: { job_number?: string | null; name?: string | null } | undefined) => (s ? `${s.job_number ? `${s.job_number} · ` : ''}${s.name || ''}` : '');
export const byJobNoDesc = (a: { job_number?: string | null }, b: { job_number?: string | null }) => String(b.job_number || '').localeCompare(String(a.job_number || ''), undefined, { numeric: true });
