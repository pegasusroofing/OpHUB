// One table → an Excel file or a branded landscape PDF. Used by the reports,
// summaries and registers that the current app exports with SheetJS / pdf-lib
// (finExportExcel, exportXxxExcel / Pdf). Money stays a number in Excel.
import { DEFAULT_BRAND1, deliverPdf, deliverXlsx, drawFit, exportFilename, hexToRgb, INK, PDFDocument, rgb, safe, SLATE, StandardFonts, storageImage, WHITE, wrap, type PDFPage } from '@/lib/pdf';
import { makeXlsx, reportSheet, type XCell } from '@/lib/rules/xlsx';
import type { Organization } from '@/lib/types';

export type TCol = { l: string; money?: boolean; num?: boolean; w?: number };
export type Table = { title: string; sub?: string; cols: TCol[]; rows: (string | number | null | undefined)[][]; totals?: (string | number | null | undefined)[]; site?: string | null };
const gbp = (n: number) => `${n < 0 ? '-' : ''}£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const cellText = (c: TCol, v: unknown) => (v == null || v === '' ? '' : c.money && typeof v === 'number' ? gbp(v) : typeof v === 'number' ? v.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : String(v));

export function tableSheets(t: Table, org: Organization | null, more: Table[] = []) {
  return [t, ...more].map((x) => {
    const cell = (c: TCol, v: unknown, bold = false): XCell => (c.money && typeof v === 'number' ? { v, s: 'money' } : bold ? { v: v as string, s: 'bold' } : (v as string | number | null));
    const rows = x.rows.map((r) => x.cols.map((c, i) => cell(c, r[i])));
    if (x.totals) rows.push(x.cols.map((c, i) => cell(c, x.totals?.[i], true)));
    return reportSheet(x.title, `${org?.name || 'OpHUB'} — ${x.title}`, x.cols.map((c) => c.l), rows, x.cols.map((c, i) => c.w ? c.w / 6 : i === 0 ? 30 : c.money || c.num ? 14 : 22), x.sub ? `${x.sub} · exported ${new Date().toLocaleDateString('en-GB')}` : undefined);
  });
}
export const exportTableExcel = (t: Table, org: Organization | null, more: Table[] = []) => deliverXlsx(makeXlsx(tableSheets(t, org, more)), exportFilename(t.site || '', t.title, 'xlsx'));

export async function exportTablePdf(t: Table, org: Organization | null) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), reg = await doc.embedFont(StandardFonts.Helvetica);
  const logo = await storageImage(doc, 'org-logos', org?.logo_path);
  const W = 841.89, H = 595.28, M = 32, CW = W - 2 * M, BRAND = hexToRgb(org?.color_primary || DEFAULT_BRAND1), LINE = rgb(0.85, 0.85, 0.85), HEAD = rgb(0.93, 0.94, 0.96);
  const raw = t.cols.map((c, i) => c.w || (i === 0 ? 150 : c.money || c.num ? 70 : 110)), sc = CW / raw.reduce((a, b) => a + b, 0), widths = raw.map((w) => w * sc);
  const size = t.cols.length > 12 ? 6.5 : t.cols.length > 8 ? 7.5 : 8.5;
  let page!: PDFPage, y = 0, n = 0;
  const colX = (i: number) => M + widths.slice(0, i).reduce((a, b) => a + b, 0);
  const line = (cells: unknown[], f = reg, bg?: ReturnType<typeof rgb>) => {
    if (y - 14 < 36) newPage();
    if (bg) page.drawRectangle({ x: M, y: y - 4, width: CW, height: 14, color: bg });
    t.cols.forEach((c, i) => {
      const txt = safe(cellText(c, cells[i])); if (!txt) return;
      const right = c.money || c.num, maxW = widths[i] - 6;
      let s = txt; while (s.length > 1 && f.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -1);
      if (s !== txt) s = `${s.slice(0, -1)}…`;
      const tw = f.widthOfTextAtSize(s, size);
      page.drawText(s, { x: right ? colX(i) + widths[i] - 3 - tw : colX(i) + 3, y, size, font: f, color: right && typeof cells[i] === 'number' && (cells[i] as number) < 0 ? rgb(0.76, 0.23, 0.23) : INK });
    });
    y -= 14;
  };
  function newPage() {
    page = doc.addPage([W, H]); n++;
    page.drawRectangle({ x: 0, y: H - 60, width: W, height: 60, color: BRAND });
    if (logo) { const d = logo.scale(1), s = 36 / Math.max(d.width, d.height); page.drawRectangle({ x: W - M - 36, y: H - 48, width: 36, height: 36, color: WHITE }); page.drawImage(logo, { x: W - M - 36 + (36 - d.width * s) / 2, y: H - 48 + (36 - d.height * s) / 2, width: d.width * s, height: d.height * s }); }
    page.drawText(safe((org?.name || 'OpHUB').toUpperCase()), { x: M, y: H - 24, size: 8.5, font: bold, color: WHITE, opacity: 0.85 });
    drawFit(page, safe(t.title), { x: M, y: H - 42, size: 15, font: bold, color: WHITE, maxWidth: CW - 50 });
    if (t.sub) drawFit(page, safe(t.sub), { x: M, y: H - 54, size: 8.5, font: reg, color: WHITE, opacity: 0.9, maxWidth: CW - 50 });
    page.drawLine({ start: { x: M, y: 26 }, end: { x: W - M, y: 26 }, thickness: 0.75, color: LINE });
    page.drawText(`Generated via OpHUB · ${new Date().toLocaleDateString('en-GB')} · page ${n}`, { x: M, y: 14, size: 7.5, font: reg, color: SLATE });
    y = H - 80;
    const heads = t.cols.map((c, i) => wrap(safe(c.l), bold, size, widths[i] - 6).slice(0, 3)), hl = Math.max(1, ...heads.map((h) => h.length));
    page.drawRectangle({ x: M, y: y - 4 - (hl - 1) * (size + 2), width: CW, height: 14 + (hl - 1) * (size + 2), color: HEAD });
    heads.forEach((h, i) => h.forEach((txt, j) => { const tw = bold.widthOfTextAtSize(txt, size), right = t.cols[i].money || t.cols[i].num; page.drawText(txt, { x: right ? colX(i) + widths[i] - 3 - tw : colX(i) + 3, y: y - j * (size + 2), size, font: bold, color: INK }); }));
    y -= 14 + (hl - 1) * (size + 2);
  }
  newPage();
  t.rows.forEach((r) => line(r));
  if (t.totals) { page.drawLine({ start: { x: M, y: y + 11 }, end: { x: W - M, y: y + 11 }, thickness: 1, color: INK }); line(t.totals, bold); }
  return deliverPdf(await doc.save(), exportFilename(t.site || '', t.title, 'pdf'));
}
