// A purchase invoice checked line by line against its PO (Andy, 6 Nov 2026: "if the cost differs it goes into query").
// Each invoice line is matched to the PO line it is most like (same code, or most words in common). Then:
//   - a line that isn't on the PO, a price dearer than the PO, or more than was ordered → a flag (the invoice waits
//     in Needs Checking);
//   - a price cheaper than the PO → a note only.
// The PO's total is checked elsewhere (over the PO value). Pure; tested in poMatch.test.ts.
export type InvLine = { code?: string | null; description?: string | null; qty?: number | string | null; unit_price?: number | string | null; amount?: number | string | null; disc?: number | string | null; kind?: string | null };
export type PoItem = { code?: string | null; item?: string | null; description?: string | null; qty?: number | string | null; rate?: number | string | null; amount?: number | string | null };
export type LineCheck = { state: 'ok' | 'dearer' | 'cheaper' | 'missing' | 'more' | 'none'; text: string; po?: number };

const n = (v: unknown) => { const t = String(v ?? '').replace(/[£,\s]/g, ''); if (!t) return NaN; const x = Number(t); return isFinite(x) ? x : NaN; };
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const money = (x: number) => `£${x.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
const STOP = new Set(['the', 'and', 'for', 'with', 'per', 'each', 'off', 'inc', 'incl', 'x']);
const words = (s: unknown) => new Set(String(s ?? '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w)));
const codeOf = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** How alike two descriptions are: words in common over the smaller list (0 to 1). */
export function likeness(a: unknown, b: unknown): number {
  const A = words(a), B = words(b); if (!A.size || !B.size) return 0;
  let k = 0; A.forEach((w) => { if (B.has(w)) k++; });
  return k / Math.min(A.size, B.size);
}
/** The price per unit actually charged: the rate less its discount, else the amount over the quantity. */
export function netUnit(l: InvLine): number {
  const q = n(l.qty), r = n(l.unit_price), d = n(l.disc);
  if (isFinite(r)) return r2(r * (1 - (isFinite(d) ? Math.min(100, Math.max(0, d)) : 0) / 100) * 1000) / 1000;
  const a = n(l.amount); return isFinite(a) && isFinite(q) && q ? Math.round((a / q) * 1000) / 1000 : NaN;
}
/** The PO line an invoice line belongs to, or -1. */
export function matchItem(l: InvLine, items: PoItem[]): number {
  const c = codeOf(l.code);
  if (c.length >= 3) { const k = items.findIndex((it) => codeOf(it.code) === c || codeOf(it.item).startsWith(c)); if (k >= 0) return k; }
  let best = -1, score = 0;
  items.forEach((it, k) => { const s = likeness(l.description, it.item ?? it.description); if (s > score) { score = s; best = k; } });
  return score >= 0.5 ? best : -1;
}

/** Each invoice line against the PO, plus the flags that send the invoice to Needs Checking and the notes. */
export function checkAgainstPo(lines: InvLine[], items: PoItem[], poNumber = 'the PO'): { perLine: LineCheck[]; flags: string[]; notes: string[] } {
  const items2 = (items || []).filter((it) => it && (it.item || it.description));
  const used: Record<number, number> = {};
  const perLine: LineCheck[] = [], flags: string[] = [], notes: string[] = [];
  if (!items2.length) return { perLine: lines.map(() => ({ state: 'none', text: '' })), flags, notes };
  lines.forEach((l) => {
    const name = String(l.description || 'A line').trim().slice(0, 60);
    if ((l.kind || 'item') === 'total' || !(Math.abs(n(l.amount)) > 0 || n(l.unit_price) > 0)) { perLine.push({ state: 'none', text: '' }); return; }
    const k = matchItem(l, items2);
    if (k < 0) { perLine.push({ state: 'missing', text: `Not on ${poNumber}` }); flags.push(`“${name}” isn’t on ${poNumber}`); return; }
    const it = items2[k], poRate = n(it.rate), charged = netUnit(l);
    const q = n(l.qty); if (isFinite(q)) used[k] = (used[k] || 0) + q;
    const ordered = n(it.qty);
    if (isFinite(poRate) && isFinite(charged) && charged > poRate + Math.max(0.01, poRate * 0.005)) {
      perLine.push({ state: 'dearer', text: `Dearer than ${poNumber}: ${money(charged)} each, ordered at ${money(poRate)}`, po: poRate });
      flags.push(`“${name}” is ${money(charged)} each, ${poNumber} says ${money(poRate)}`); return;
    }
    if (isFinite(ordered) && used[k] > ordered + 0.0005) {
      perLine.push({ state: 'more', text: `More than ordered: ${used[k]} invoiced, ${ordered} on ${poNumber}`, po: poRate });
      flags.push(`“${name}”: ${used[k]} invoiced, only ${ordered} on ${poNumber}`); return;
    }
    if (isFinite(poRate) && isFinite(charged) && charged < poRate - Math.max(0.01, poRate * 0.005)) {
      perLine.push({ state: 'cheaper', text: `Cheaper than ${poNumber}: ${money(charged)} each, ordered at ${money(poRate)}`, po: poRate });
      notes.push(`“${name}” is cheaper than ${poNumber}`); return;
    }
    perLine.push({ state: 'ok', text: `Matches ${poNumber}`, po: poRate });
  });
  return { perLine, flags, notes };
}
