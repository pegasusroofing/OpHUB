// One table → an Excel file (finExportExcel, exportXxxExcel). No PDF library here, so screens can export to Excel
// without loading pdf-lib (speed review, 15 Nov 2026); the PDF version is in lib/tableExport.ts. Money stays a number.
import { deliverXlsx, exportFilename } from '@/lib/fileOut';
import { makeXlsx, reportSheet, type XCell } from '@/lib/rules/xlsx';
import type { Organization } from '@/lib/types';

export type TCol = { l: string; money?: boolean; num?: boolean; w?: number };
export type Table = { title: string; sub?: string; cols: TCol[]; rows: (string | number | null | undefined)[][]; totals?: (string | number | null | undefined)[]; site?: string | null; boldRows?: number[] };
const gbp = (n: number) => `${n < 0 ? '-' : ''}£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const cellText = (c: TCol, v: unknown) => (v == null || v === '' ? '' : c.money && typeof v === 'number' ? gbp(v) : typeof v === 'number' ? v.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : String(v));

export function tableSheets(t: Table, org: Organization | null, more: Table[] = []) {
  return [t, ...more].map((x) => {
    const cell = (c: TCol, v: unknown, bold = false): XCell => (c.money && typeof v === 'number' ? { v, s: 'money' } : bold ? { v: v as string, s: 'bold' } : (v as string | number | null));
    const rows = x.rows.map((r, n) => x.cols.map((c, i) => cell(c, r[i], !!x.boldRows?.includes(n))));
    if (x.totals) rows.push(x.cols.map((c, i) => cell(c, x.totals?.[i], true)));
    return reportSheet(x.title, `${org?.name || 'OpHUB'} — ${x.title}`, x.cols.map((c) => c.l), rows, x.cols.map((c, i) => c.w ? c.w / 6 : i === 0 ? 30 : c.money || c.num ? 14 : 22), x.sub ? `${x.sub} · exported ${new Date().toLocaleDateString('en-GB')}` : undefined);
  });
}
export const exportTableExcel = (t: Table, org: Organization | null, more: Table[] = []) => deliverXlsx(makeXlsx(tableSheets(t, org, more)), exportFilename(t.site || '', t.title, 'xlsx'));
