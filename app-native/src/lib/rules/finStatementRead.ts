// Reading a supplier statement (9219l finStmtReadPdf / finStmtReadSheet): each
// line's date, reference, type (invoice / credit / payment) and amount, from a
// PDF's text lines or a spreadsheet's rows (a header row with Date and an
// amount column, or else line by line), plus the balance and a guess at the
// supplier. Nothing leaves OpHUB. Pure.
import { round2 } from './finance.ts';
import type { SLine } from './finStatements.ts';

const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export function stmtDate(v: unknown): string | null {
  if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(String(v ?? '').trim())) { const n = Math.floor(Number(v)); if (n > 30000 && n < 60000) return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10); }
  const s = String(v ?? '').trim(); let m: RegExpMatchArray | null;
  const ok = (y: number, mo: number, d: number) => { if (y < 100) y += 2000; const dt = new Date(Date.UTC(y, mo - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null; };
  if ((m = s.match(/(?:^|[^\d])(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?![\d])/))) return ok(Number(m[1]), Number(m[2]), Number(m[3]));
  if ((m = s.match(/(?:^|[^\d])(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?![\d])/))) return ok(Number(m[3]), Number(m[2]), Number(m[1]));
  if ((m = s.match(/(?:^|[^\d])(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?[\s,-]+(\d{2}|\d{4})(?![\d])/))) { const mo = MON[m[2].slice(0, 3).toLowerCase()]; if (mo) return ok(Number(m[3]), mo, Number(m[1])); }
  return null;
}
const DATE_RX = /(?:^|[^\d])(\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})|\d{1,2}(?:st|nd|rd|th)?[\s-]+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s,-]+(?:\d{4}|\d{2}))(?![\d])/i;
// Built at run time, as the current app: a lookbehind written as a literal breaks older iPhones.
const AMT_BODY = '(?:-\\s?)?£?\\s?\\(?-?(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}\\)?(?:\\s?(?:CR|DR))?(?![\\d\\/])';
const amtRx = () => { try { return new RegExp(`(?<![\\d.,\\/])${AMT_BODY}`, 'gi'); } catch { return new RegExp(AMT_BODY, 'gi'); } };
export function stmtAmt(s: unknown): number | null {
  if (typeof s === 'number') return s;
  const t = String(s ?? '').trim(); if (!t) return null;
  const neg = /\(\s*£?\s*[\d,]+\.?\d*\s*\)/.test(t) || /^-|^£\s?-|-\s?£/.test(t) || /CR$/i.test(t);
  const m = t.replace(/,/g, '').match(/\d+(?:\.\d+)?/); if (!m) return null;
  const n = Number(m[0]); return Number.isNaN(n) ? null : neg ? -n : n;
}
export function lineType(txt: unknown, amt: number | null): string {
  const l = String(txt ?? '').toLowerCase();
  if (/\b(balance b\/?f|b\/f|brought forward|opening balance|carried forward|c\/f|balance due|amount due|total due|total)\b/.test(l)) return 'other';
  if (/\b(payment|paid|receipt|bacs|chq|cheque|remittance|faster pay(?:ment)?|direct debit)\b/.test(l)) return 'payment';
  if (/\b(credit note|credit|crn)\b/.test(l) || /\bcn[\s-]?\d/.test(l) || (amt != null && amt < 0)) return 'credit';
  return 'invoice';
}
type Read = Omit<SLine, 'id'> & { text: string };
/** One line of statement text → a line, or null. */
export function parseStmtText(line: string): Read | null {
  const dm = line.match(DATE_RX); if (!dm) return null;
  const amts = line.match(amtRx()); if (!amts) return null;
  const rest = line.slice(line.indexOf(dm[1]) + dm[1].length);
  const after = rest.match(amtRx()) || amts;
  let amount = stmtAmt(after.length > 1 ? after[0] : after[after.length - 1]);
  if (amount == null) return null;
  const noMoney = rest.replace(amtRx(), ' ').replace(new RegExp(DATE_RX.source, 'gi'), ' ');
  const refM = noMoney.match(/\b([A-Z]{0,4}[-/]?\d{4,}[A-Z0-9\-/]*)\b/i);
  const type = lineType(line, amount);
  if (type === 'other') return null;
  if (type === 'credit' || type === 'payment') amount = -Math.abs(amount);
  return { date: stmtDate(dm[1]), ref: refM ? refM[1] : '', type, amount: round2(amount), text: line.trim().slice(0, 160) };
}
/** Spreadsheet / CSV rows → lines (by column headings when there's a header row). */
export function stmtFromRows(rows: (string | number)[][]): Read[] {
  const hi = rows.findIndex((r) => r.some((c) => /date/i.test(String(c))) && r.some((c) => /(amount|value|debit|credit|total|gross)/i.test(String(c))));
  if (hi < 0) return rows.map((r) => parseStmtText(r.join(' '))).filter(Boolean) as Read[];
  const h = rows[hi].map((c) => String(c).toLowerCase());
  const col = (rx: RegExp) => h.findIndex((c) => rx.test(c));
  const cDate = col(/date/), cRef = h.findIndex((c) => /(ref|invoice|document|doc|number|no\.?$|transaction)/.test(c) && !/(date|amount|value|total|debit|credit)/.test(c)), cType = col(/(type|description|details|narrative)/);
  const cDr = col(/(debit|invoice amount|charges?)/), cCr = col(/(credit|payment|receipts?)/), cAmt = col(/(amount|value|total|gross)/);
  const out: Read[] = [];
  rows.slice(hi + 1).forEach((r) => {
    const date = stmtDate(r[cDate]); if (!date) return;
    let amount: number | null = null;
    if (cDr >= 0 || cCr >= 0) { const dr = cDr >= 0 ? stmtAmt(r[cDr]) : null, cr = cCr >= 0 ? stmtAmt(r[cCr]) : null; if (dr) amount = Math.abs(dr); else if (cr) amount = -Math.abs(cr); }
    if (amount == null && cAmt >= 0) amount = stmtAmt(r[cAmt]);
    if (amount == null || amount === 0) return;
    const txt = r.join(' ');
    const type = lineType(cType >= 0 ? r[cType] : txt, amount); if (type === 'other') return;
    if (type === 'credit' || type === 'payment') amount = -Math.abs(amount);
    out.push({ date, ref: cRef >= 0 ? String(r[cRef] ?? '').trim() : '', type, amount: round2(amount), text: txt.slice(0, 160) });
  });
  return out;
}
/** The balance printed on the statement, if there is one. */
export function stmtBalance(text: string): number | null {
  const m = text.match(/(?:balance\s*(?:due|outstanding|now due|carried forward|c\/f)|amount\s*(?:now\s*)?due|total\s*due|closing balance)[^\d£-]{0,20}(-?£?\s?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}(?:\s?CR)?)/i);
  return m ? stmtAmt(m[1]) : null;
}
/** The longest known supplier name that appears in the statement. */
export const guessSupplier = (text: string, names: string[]) => { const low = text.toLowerCase(); return names.filter((n) => n.length > 2 && low.includes(n.toLowerCase())).sort((a, b) => b.length - a.length)[0] || ''; };
