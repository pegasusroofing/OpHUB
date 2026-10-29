// Importing Schedule of Works tasks (480 importScheduleExcel / importSchedulePdf). Pure.
import type { Cell } from './xlsxRead.ts';

/** Column names (blank headers become "Column A"…), the data rows, and the best guess at the task column. */
export function sheetColumns(rows: Cell[][]) {
  const head = rows[0] || [];
  const data = rows.slice(1).filter((r) => r.some((v) => v != null && String(v).trim() !== ''));
  const n = Math.max(head.length, ...data.map((r) => r.length), 0);
  const headers = Array.from({ length: n }, (_, i) => (head[i] != null && String(head[i]).trim() ? String(head[i]).trim() : `Column ${String.fromCharCode(65 + i)}`));
  let guess = headers.findIndex((h) => /scope|description|desc|task|item|work/i.test(h));
  if (guess < 0) {
    let best = -1;
    for (let i = 0; i < n; i++) { const avg = data.reduce((t, r) => t + (r[i] != null ? String(r[i]).length : 0), 0) / (data.length || 1); if (avg > best) { best = avg; guess = i; } }
  }
  return { headers, data, guess: Math.max(0, guess) };
}
export const columnTasks = (data: Cell[][], col: number) => data.map((r) => r[col]).filter((v) => v != null && String(v).trim() !== '').map((v) => String(v).trim());
/** PDF lines that look like tasks: drops page numbers, headings and short scraps. */
export function pdfTaskLines(lines: string[]): string[] {
  const skip = /^(page\s*\d+|schedule of works|item|description|task|ref\.?|no\.?|date|status|notes?)$/i;
  return lines.map((l) => l.trim()).filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !skip.test(t));
}
