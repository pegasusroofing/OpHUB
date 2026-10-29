// Sales invoice rules (901): VAT per line (standard / 5% / reverse charge /
// zero / exempt), totals rounded per line in whole pence the way Xero does,
// and the treatment that best describes an invoice. Pure.
export const INV_VAT: Record<string, { l: string; s: string; r: number; rc?: boolean }> = {
  '20': { l: '20%', s: 'VAT 20%', r: 20 }, '5': { l: '5%', s: 'VAT 5%', r: 5 }, rc20: { l: 'Reverse charge 20%', s: 'RC 20%', r: 20, rc: true },
  rc5: { l: 'Reverse charge 5%', s: 'RC 5%', r: 5, rc: true }, '0': { l: 'Zero rated', s: 'Zero rated', r: 0 }, ex: { l: 'No VAT / exempt', s: 'No VAT', r: 0 },
};
export type InvLine = { description?: string; amount?: number | string | null; vat?: string };
export const vatFromTreatment = (t: string | null | undefined, rate?: number | null) => (t === 'reverse_charge' ? (Number(rate) === 5 ? 'rc5' : 'rc20') : t === 'zero' ? '0' : Number(rate) === 5 ? '5' : '20');
export const lineVat = (l: InvLine, t: string | null | undefined, rate?: number | null) => (l.vat && INV_VAT[l.vat] ? l.vat : vatFromTreatment(t, rate));
const r2 = (n: number) => Math.round(n * 100) / 100;
export function invTotals(lines: InvLine[] | null | undefined, t: string | null | undefined, rate?: number | null) {
  const by: Record<string, { net: number; vat: number }> = {}; let net = 0, vat = 0, vatDue = 0;
  (lines || []).forEach((l) => {
    const a = Number(l.amount) || 0; net += a;
    const k = lineVat(l, t, rate), c = INV_VAT[k];
    const b = (by[k] = by[k] || { net: 0, vat: 0 }); b.net += a;
    const pp = Math.round(a * 100) * c.r;
    const v = ((pp < 0 ? -1 : 1) * Math.round(Math.abs(pp) / 100)) / 100;
    if (c.rc) vatDue += v; else vat += v;
    b.vat += v;
  });
  Object.values(by).forEach((b) => { b.net = r2(b.net); b.vat = r2(b.vat); });
  net = r2(net); vat = r2(vat); vatDue = r2(vatDue);
  return { net, vat, total: r2(net + vat), vatDue, by, mixed: Object.keys(by).length > 1 };
}
export function treatmentOf(t: ReturnType<typeof invTotals>) {
  const ks = Object.keys(t.by);
  if (ks.some((k) => !INV_VAT[k].rc && INV_VAT[k].r > 0)) return 'standard';
  if (ks.some((k) => INV_VAT[k].rc)) return 'reverse_charge';
  return 'zero';
}
/** Tidies a draft's lines: blanks dropped, amounts to pence, VAT code on every line. */
export function cleanLines(lines: InvLine[], t: string | null | undefined, rate?: number | null) {
  return lines.map((l) => {
    const a = l.amount === null || l.amount === undefined || l.amount === '' ? null : Number(String(l.amount).replace(/[£,\s]/g, ''));
    return { description: String(l.description || '').trim(), amount: a === null || isNaN(a) ? null : r2(a), vat: INV_VAT[l.vat || ''] ? (l.vat as string) : vatFromTreatment(t, rate) };
  }).filter((l) => l.description || l.amount !== null);
}
/** What stops an invoice being issued, or null. */
export function issueProblem(d: { lines: ReturnType<typeof cleanLines>; bill_name?: string | null; issue_date?: string | null; due_date?: string | null; bill_email?: string | null }) {
  if (!d.lines.length) return 'Add at least one line.';
  if (d.lines.some((l) => l.amount === null)) return 'Every line needs an amount.';
  if (d.lines.some((l) => !l.description)) return 'Every line needs a description.';
  if (!d.bill_name) return 'Add who the invoice is to.';
  if (!d.issue_date || !d.due_date) return 'Add the invoice date and due date.';
  if (d.bill_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.bill_email)) return 'Enter a valid accounts email.';
  return null;
}
