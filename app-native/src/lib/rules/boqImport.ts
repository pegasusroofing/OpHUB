// Reading a Bill of Quantities / price breakdown from Excel or a PDF (902
// finGuessColumns / finImportRows / PDF lines): find the columns (by heading, or
// by what's in them), then each row becomes a section, sub-section, item (with
// ref, qty, unit, rate, amount and an optional cost) or is skipped (totals, so
// nothing is counted twice). Pure.
import { round2 } from './finance.ts';
import type { Cell } from './xlsxRead.ts';

export const TOTAL_RE = /^(sub[\s-]?total|total|grand total|carried|brought|c\/f|b\/f|collection|summary|vat|net total|contract sum|to collection|to summary)\b/i;
export const UNIT_RE = /^(m2|m²|sqm|m3|m³|m|lm|mtr|nr|no|item|sum|ls|l\.s\.|hr|hrs|day|days|wk|week|kg|t|tonne|set|pair|each|ea|prov|ps|pc)\.?$/i;
export const numCell = (v: unknown): number | null => { if (typeof v === 'number') return v; if (typeof v === 'string') { const s = v.replace(/[£,\s]/g, ''); if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s); } return null; };

export type BoqCols = { desc: number; ref: number; qty: number; unit: number; rate: number; amount: number; cost: number };
export type BoqLine = { kind: 'section' | 'subsection' | 'item' | 'skip'; ref?: string; description: string; qty?: number | null; unit?: string; rate?: number | null; value?: number | null; cost?: number | null };

export function guessColumns(rows: Cell[][]): { header: number; cols: BoqCols } {
  const width = Math.max(0, ...rows.slice(0, 400).map((r) => r.length));
  let header = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) if (rows[i].some((c) => typeof c === 'string' && /^(description|item|details|element|work|amount|total|£|value|price|ref|qty|quantity|rate|unit)/i.test(c.trim()))) { header = i; break; }
  const hdr = (rows[header] || []).map((c) => String(c || '').trim().toLowerCase());
  const find = (re: RegExp) => { for (let c = width - 1; c >= 0; c--) if (re.test(hdr[c] || '')) return c; return -1; };
  const findFirst = (re: RegExp) => { for (let c = 0; c < width; c++) if (re.test(hdr[c] || '')) return c; return -1; };
  const body = rows.slice(header + 1, header + 400);
  let desc = findFirst(/^(description|details|item description|work|element)/);
  if (desc < 0) { let best = -1; for (let c = 0; c < width; c++) { const t = body.reduce((s, r) => s + (typeof r[c] === 'string' ? Math.min(60, String(r[c]).trim().length) : 0), 0); if (t > best) { best = t; desc = c; } } }
  const costCol = findFirst(/^(cost price|cost rate|nett cost|net cost|our cost|budget|cost)/);
  let amount = find(/^(sell|sale)/);
  if (amount < 0) amount = find(/^(amount|total|£|value|price|sum)/);
  if (amount < 0 && costCol < 0) amount = find(/^cost/);
  if (amount < 0) { let bestN = -1; for (let c = width - 1; c >= 0; c--) { if (c === desc) continue; const n = body.filter((r) => numCell(r[c]) != null).length; if (n > bestN) { bestN = n; amount = c; } } }
  let qty = findFirst(/^(qty|quantity|quant)/), unit = findFirst(/^(unit|units|uom)$/), rate = findFirst(/^(rate|unit rate|£\/unit)/);
  if (unit < 0) for (let c = 0; c < width; c++) { if (c === desc) continue; const n = body.filter((r) => typeof r[c] === 'string' && UNIT_RE.test(String(r[c]).trim())).length; if (n >= Math.max(2, body.length * 0.15)) { unit = c; break; } }
  if (unit >= 0 && qty < 0 && unit - 1 !== desc && unit - 1 >= 0) qty = unit - 1;
  if (unit >= 0 && rate < 0 && unit + 1 < width && unit + 1 !== amount) rate = unit + 1;
  let ref = findFirst(/^(ref|item|no\.?|code)$/);
  if (ref < 0) for (let c = 0; c < desc; c++) { const n = body.filter((r) => String(r[c] ?? '').trim().length && String(r[c]).trim().length <= 8).length; if (n > body.length * 0.3) { ref = c; break; } }
  return { header, cols: { desc, ref, qty, unit, rate, amount, cost: costCol !== amount ? costCol : -1 } };
}
export function importRows(rows: Cell[][], header: number, c: BoqCols): BoqLine[] {
  const out: BoqLine[] = [];
  const str = (r: Cell[], i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '');
  rows.forEach((r, ri) => {
    if (ri <= header) return;
    const desc = str(r, c.desc), ref = str(r, c.ref), unit = str(r, c.unit);
    const amt = c.amount >= 0 ? numCell(r[c.amount]) : null, qty = c.qty >= 0 ? numCell(r[c.qty]) : null, rate = c.rate >= 0 ? numCell(r[c.rate]) : null, cost = c.cost >= 0 ? numCell(r[c.cost]) : null;
    if (!desc && !amt) return;
    let value = amt;
    if ((value === null || value === 0) && qty !== null && rate !== null) value = round2(qty * rate);
    if (value !== null && value !== 0) out.push({ kind: TOTAL_RE.test(desc) ? 'skip' : 'item', ref, description: desc || ref, qty, unit, rate, value: round2(value), cost: cost != null ? round2(cost) : null });
    else if (desc) {
      // No money on the row: a header — capitals or a short whole ref is a section, otherwise a sub-section.
      const top = (desc === desc.toUpperCase() && /[A-Z]/.test(desc)) || /^[A-Z0-9]{1,3}$/.test(ref);
      out.push({ kind: top && !/^\d+\.\d+/.test(ref) ? 'section' : 'subsection', ref, description: desc });
    }
  });
  return out;
}
/** The sheet that looks most like a priced breakdown (rows with words and numbers). */
export const bestSheet = (sheets: { name: string; rows: Cell[][] }[]) => sheets.slice().sort((a, b) => score(b.rows) - score(a.rows))[0];
const score = (rows: Cell[][]) => rows.filter((r) => r.some((c) => typeof c === 'number') && r.some((c) => typeof c === 'string' && /[a-z]{3}/i.test(c))).length;
/** A PDF's text lines → lines ("desc qty unit rate amount", "desc amount", or a capitals header). */
export function importPdfLines(lines: string[]): BoqLine[] {
  const out: BoqLine[] = [];
  lines.forEach((t) => {
    if (!t) return;
    // (units may carry a digit, e.g. m2 — the current app's pattern missed those)
    let m = /^(.*?[A-Za-z].*?)\s+([\d,]+(?:\.\d+)?)\s+([A-Za-z][A-Za-z0-9²³.]{0,5})\s+£?\s?([\d,]+\.\d{2,4})\s+£?\s?(-?[\d,]+\.\d{2})\s*$/.exec(t);
    if (m) { out.push({ kind: 'item', description: m[1].trim(), qty: Number(m[2].replace(/,/g, '')), unit: m[3], rate: Number(m[4].replace(/,/g, '')), value: Number(m[5].replace(/,/g, '')) }); return; }
    m = /^(.*?[A-Za-z].*?)\s+£?\s?(-?[\d,]+\.\d{2})\s*$/.exec(t);
    if (m) { const d = m[1].trim(); out.push({ kind: TOTAL_RE.test(d) ? 'skip' : 'item', description: d, value: Number(m[2].replace(/,/g, '')) }); return; }
    if (t.length <= 60 && /[A-Z]{3}/.test(t) && t === t.toUpperCase() && !/\d{3,}/.test(t)) out.push({ kind: 'section', description: t });
  });
  return out;
}
/** Lines to use as Bill of Quantities rows: skips dropped; a qty × rate that doesn't make the amount becomes a lump sum. */
export function boqRows(lines: BoqLine[]) {
  return lines.filter((r) => r.kind !== 'skip' && !(r.kind === 'item' && r.value == null)).map((r) => {
    const item = r.kind === 'item';
    let qty = item ? r.qty ?? null : null, rate = item ? r.rate ?? null : null;
    if (item && qty != null && rate != null && Math.abs(round2(qty * rate) - Number(r.value)) > 1) { qty = null; rate = null; }
    return { kind: r.kind, ref: r.ref || '', description: r.description, qty: qty ?? '', unit: item ? r.unit || '' : '', rate: rate ?? '', value: item ? r.value ?? '' : '', cost: item ? r.cost ?? '' : '' };
  });
}
