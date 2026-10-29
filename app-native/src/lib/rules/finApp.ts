// Applications for payment (902): an item's contract value, % complete,
// the valuation (lines + variations + dayworks), discount before retention,
// retention with its limit, less previously certified, and section totals. Pure.
import { num, round2 } from './finance.ts';

type Row = Record<string, any>;
export const pct = (v: unknown) => { const n = num(v); return n === null || isNaN(n) ? 0 : Math.max(0, Math.min(100, Math.round(n * 100) / 100)); };
export const isItem = (l: Row) => !l.kind || l.kind === 'item';
/** qty × rate when both are given, otherwise the lump sum. */
export function itemValue(r: Row): number | null {
  const q = num(r.qty), rt = num(r.rate);
  if (q !== null && !isNaN(q) && rt !== null && !isNaN(rt)) return round2(q * rt);
  const v = num(r.value); return v === null || isNaN(v) ? null : round2(v);
}
export function appCalc(app: Row, contractValue: unknown, retLimitPct: unknown, previous: number) {
  const lines = (app.lines || []).map((l: Row) => (isItem(l) ? { ...l, gross: round2((Number(l.value || 0) * pct(l.pct)) / 100) } : { ...l, gross: 0 }));
  const variations = (app.variations || []).map((v: Row) => ({ ...v, gross: round2((Number(v.value || 0) * pct(v.pct)) / 100) }));
  const dayworks = (app.dayworks || []).map((d: Row) => ({ ...d, gross: round2(Number(d.value || 0)) }));
  const gross = round2([...lines, ...variations, ...dayworks].reduce((t: number, x: Row) => t + x.gross, 0));
  // Discount (e.g. main contractor's discount) comes off before retention.
  const discount = round2((gross * Number(app.discount_pct || 0)) / 100), afterDisc = round2(gross - discount);
  let retention = round2((afterDisc * Number(app.retention_pct || 0)) / 100);
  if (retLimitPct && contractValue) retention = Math.min(retention, round2((Number(contractValue) * Number(retLimitPct)) / 100));
  const prev = round2(previous || 0);
  return { lines, variations, dayworks, gross, discount, afterDisc, retention, previous: prev, net_due: round2(afterDisc - retention - prev) };
}
/** What was certified (or, until the certificate is in, applied for) on earlier applications. */
export const previousCertified = (apps: Row[], number: number) => round2(apps.filter((a) => a.number < number && !['draft', 'void'].includes(a.status)).reduce((t, a) => t + Number(a.cert_net != null ? a.cert_net : a.net_due || 0), 0));
/** Each header adds up the items below it until the next header of the same or higher level. */
export function groupTotals(rows: Row[], valueOf: (r: Row) => number, grossOf: (r: Row) => number) {
  const out: Record<number, { value: number; gross: number }> = {}; let sec: number | null = null, sub: number | null = null;
  rows.forEach((r, i) => {
    if (r.kind === 'section') { sec = i; sub = null; out[i] = { value: 0, gross: 0 }; return; }
    if (r.kind === 'subsection') { sub = i; out[i] = { value: 0, gross: 0 }; return; }
    const v = Number(valueOf(r) || 0), g = Number(grossOf(r) || 0);
    [sec, sub].forEach((k) => { if (k !== null) { out[k].value += v; out[k].gross += g; } });
  });
  Object.values(out).forEach((o) => { o.value = round2(o.value); o.gross = round2(o.gross); });
  return out;
}
export const APP_STAGE = (a: Row) => (a.status === 'void' ? 'void' : a.invoice_id ? 'invoiced' : a.cert_net != null ? 'certified' : a.status === 'submitted' ? 'applied' : 'draft');
/** The invoice lines for a certificate: certified total, less discount, retention and previously certified. */
export function certInvoiceLines(a: Row, fdate: (d: string) => string) {
  const lines = [{ description: `Application ${a.number} — total certified to date${a.cert_date ? ` (${fdate(a.cert_date)})` : ''}`, amount: round2(a.cert_gross) }];
  if (Number(a.cert_discount || 0)) lines.push({ description: 'Less discount', amount: -round2(a.cert_discount) });
  lines.push({ description: 'Less retention', amount: -round2(a.cert_retention) });
  if (Number(a.cert_previous || 0)) lines.push({ description: 'Less previously certified (paid)', amount: -round2(a.cert_previous) });
  return lines;
}
