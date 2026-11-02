// The parts of app-native/src/lib/rules/finance.ts the reports use (the rest of that file is for screens). Change them together.
export type FinInv = { id: string; site_id: string; status: string; due_date?: string | null; issue_date?: string | null; total?: number | null; paid?: number | null; net?: number | null; number?: string | null; vat?: number | null };
export type FinApp = { id?: string; site_id?: string; number: number; status: string; valuation_date?: string | null; cert_retention?: number | null; cert_date?: string | null };
type Row = Record<string, any>;
export function money(n: unknown, dp = 2): string {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '—';
  const v = Number(n);
  return `${v < 0 ? '−' : ''}£${Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
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
const OPEN = ['issued', 'sent', 'part_paid'];
export const invOutstanding = (i: FinInv) => (OPEN.includes(i.status) ? round2(Number(i.total || 0) - Number(i.paid || 0)) : 0);
export function invOutstandingNet(i: FinInv) { const o = invOutstanding(i), t = Number(i.total || 0), n = Number(i.net || 0); return o && t ? round2((o * n) / t) : 0; }
function retentionHeld(apps: FinApp[]) {
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
function retentionReleased(jf: Row | null | undefined, invs: FinInv[], apps: FinApp[]) {
  const list = [jf?.ret1_invoice_id, jf?.ret2_invoice_id].map((id) => id && invs.find((x) => x.id === id)).filter((i): i is FinInv => !!i && !['void', 'draft'].includes(i.status));
  const sum = (arr: FinInv[]) => arr.reduce((t, i) => t + Number(i.net || 0), 0);
  const drop = retentionDrop(apps);
  if (!(drop.amt > 0)) return round2(sum(list));
  const before = list.filter((i) => !drop.date || !i.issue_date || String(i.issue_date).slice(0, 10) <= (drop.date as string)), after = list.filter((i) => !before.includes(i));
  return round2(sum(after) + Math.max(0, sum(before) - drop.amt));
}
export const retentionStillHeld = (apps: FinApp[], jf: Row | null | undefined, invs: FinInv[]) => round2(Math.max(0, retentionHeld(apps) - retentionReleased(jf, invs, apps)));
export function retentionDates(jf: Row | null | undefined, st: Row) {
  if (!jf || !jf.pc_date) return { first: null as string | null, second: jf?.final_release_date || null };
  const months = jf.defects_months != null ? jf.defects_months : st.default_defects_months != null ? Number(st.default_defects_months) : 12;
  return { first: jf.pc_date, second: jf.final_release_date || addMonths(jf.pc_date, months), months };
}
