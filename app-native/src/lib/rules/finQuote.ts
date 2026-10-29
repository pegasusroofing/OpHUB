// Reading a supplier quote's priced lines without AI (915 basic reader):
// typed PDF text lines ("description qty [unit] unit price amount") or a
// spreadsheet with a description and a price column, and matching them to a
// PO's items by their words. Pure.
import { round2 } from './finance.ts';
import type { Cell } from './xlsxRead.ts';

export type QLine = { code?: string; description: string; qty: number | null; unit: string; unit_price: number; amount: number | null; kind: 'item' | 'delivery' };
export const round4 = (n: unknown) => Math.round((Number(n) || 0) * 10000) / 10000;
export const qtyNum = (q: unknown) => { const m = /^\s*([0-9]+(?:\.[0-9]+)?)/.exec(String(q ?? '').replace(/,/g, '')); return m ? Number(m[1]) : null; };

export function linesFromText(text: string): QLine[] {
  const out: QLine[] = [];
  const num = (s: string) => Number(String(s).replace(/[£,]/g, ''));
  String(text || '').split(/\n/).forEach((raw) => {
    const l = raw.replace(/ /g, ' ').replace(/\s+/g, ' ').trim(); if (!l) return;
    let m = /^(?:([A-Z0-9][A-Z0-9\-/]{2,})\s+)?(.{3,}?)\s+(\d+(?:\.\d+)?)\s*([A-Za-z²0-9]{1,6})?\s+£?(\d[\d,]*\.\d{2,4})\s+£?(\d[\d,]*\.\d{2})$/.exec(l);
    if (m) { const q = num(m[3]), up = num(m[5]), amt = num(m[6]); if (q > 0 && Math.abs(q * up - amt) <= Math.max(0.05, amt * 0.02)) out.push({ code: m[1] || '', description: m[2].trim(), qty: q, unit: (m[4] || '').trim(), unit_price: up, amount: amt, kind: /deliver|carriage/i.test(m[2]) ? 'delivery' : 'item' }); return; }
    m = /^(.{3,}?)\s+(\d+(?:\.\d+)?)\s*([A-Za-z²]{1,6})?\s+(?:@\s*)?£?(\d[\d,]*\.\d{2,4})(?:\s*(?:each|ea|per\s+\w+))?$/i.exec(l);
    if (m) { const q = num(m[2]), up = num(m[4]); if (q > 0 && up > 0 && !/total|vat|sub ?total|balance/i.test(m[1])) out.push({ description: m[1].trim(), qty: q, unit: (m[3] || '').trim(), unit_price: up, amount: round2(q * up), kind: 'item' }); }
  });
  return out;
}
export function linesFromRows(rows: Cell[][]): QLine[] {
  const hdr = rows.findIndex((r) => r && r.some((c) => /desc|item|product/i.test(String(c ?? ''))) && r.some((c) => /price|rate|cost|each|amount|total/i.test(String(c ?? ''))));
  if (hdr < 0) return [];
  const h = rows[hdr].map((c) => String(c ?? '').toLowerCase());
  const col = (re: RegExp) => h.findIndex((c) => re.test(c));
  const cD = col(/desc|item|product/), cQ = col(/^qty|quant/), cU = col(/^unit$|uom|^per/), cP = col(/price|rate|each|unit cost|cost/), cA = col(/amount|total|value|line/), cC = col(/code|sku|ref/);
  const out: QLine[] = [];
  rows.slice(hdr + 1).forEach((r) => {
    if (!r) return; const d = String(r[cD] ?? '').trim(); if (!d) return;
    if (/^(sub ?)?total|^vat\b|^net\b|^balance|^grand total|carried forward|brought forward/i.test(d)) return;
    const n = (i: number) => { if (i < 0) return null; const v = Number(String(r[i] ?? '').replace(/[£,]/g, '')); return String(r[i] ?? '').trim() === '' || Number.isNaN(v) ? null : v; };
    const q = n(cQ), a = n(cA); let p = n(cP);
    if (p == null && a != null && q) p = round2(a / q);
    if (p == null || p <= 0) return;
    out.push({ code: cC > -1 ? String(r[cC] ?? '').trim() : '', description: d, qty: q, unit: cU > -1 ? String(r[cU] ?? '').trim() : '', unit_price: p, amount: a != null ? a : q != null ? round2(q * p) : null, kind: 'item' });
  });
  return out;
}

const STOP = new Set(['the', 'and', 'of', 'to', 'for', 'with', 'x', 'mm', 'per', 'each', 'ea', 'nr', 'no', 'pack', 'pk', 'box', 'roll', 'bag', 'm', 'm2', 'lm']);
const tokens = (s: unknown) => String(s || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').split(' ').filter((t) => t && !STOP.has(t));
export function similarity(a: unknown, b: unknown) {
  const A = tokens(a), B = tokens(b); if (!A.length || !B.length) return 0;
  const sa = new Set(A), sb = new Set(B); let inter = 0; sa.forEach((t) => { if (sb.has(t)) inter++; });
  let s = inter / (sa.size + sb.size - inter);
  const numsA = A.filter((t) => /\d/.test(t)), numsB = new Set(B.filter((t) => /\d/.test(t)));
  if (numsA.length && numsA.every((t) => numsB.has(t))) s += 0.15;
  return s;
}
/** Best pairs (score ≥ 0.3): PO item index → quote line index. */
export function matchLines(items: { item?: string; description?: string }[], lines: QLine[]): Record<number, number> {
  const pairs: { i: number; j: number; s: number }[] = [];
  items.forEach((it, i) => lines.forEach((l, j) => {
    if ((l.kind || 'item') !== 'item') return;
    const s = Math.max(similarity(it.item || it.description, l.description), l.code && String(it.item || '').toLowerCase().includes(String(l.code).toLowerCase()) ? 0.9 : 0);
    if (s >= 0.3) pairs.push({ i, j, s });
  }));
  pairs.sort((a, b) => b.s - a.s);
  const map: Record<number, number> = {}, used = new Set<number>();
  pairs.forEach((p) => { if (map[p.i] === undefined && !used.has(p.j)) { map[p.i] = p.j; used.add(p.j); } });
  return map;
}
export const itemKey = (t: unknown) => String(t || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim();
