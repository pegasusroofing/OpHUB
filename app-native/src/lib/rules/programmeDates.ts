// Key dates out of an Excel programme (810 parseExcelKeyDates): on each row,
// the first date cell (2015–2100), labelled by the nearest text to its left
// (else to its right). Up to 30, no repeats. Rows come from readXlsx with
// dates on, so date cells are YYYY-MM-DD. Pure.
import type { Cell } from './xlsxRead.ts';

const ISO = /^(\d{4})-\d{2}-\d{2}$/;
export function programmeDates(sheets: { rows: Cell[][] }[]): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = [], seen = new Set<string>();
  for (const sh of sheets) for (const row of sh.rows) {
    if (out.length >= 30) return out;
    const c = row.findIndex((v) => typeof v === 'string' && ISO.test(v));
    if (c < 0) continue;
    const date = String(row[c]), y = Number(date.slice(0, 4));
    if (y < 2015 || y > 2100) continue;
    const txt = (v: Cell | undefined) => (v != null && String(v).trim() && !(typeof v === 'string' && ISO.test(v)) ? String(v).trim() : '');
    let label = '';
    for (let i = c - 1; i >= 0 && !label; i--) label = txt(row[i]);
    for (let i = c + 1; i < row.length && !label; i++) label = txt(row[i]);
    const k = `${date}|${label}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push({ date, label });
  }
  return out;
}
