// Training Matrix (320 exportTrainingMatrixExcel / Pdf): every operative ×
// certificate category, with the soonest expiry date. Excel and a branded
// landscape PDF, named "Training Matrix".
import { DEFAULT_BRAND1, deliverPdf, deliverXlsx, drawFit, exportFilename, hexToRgb, INK, PDFDocument, rgb, safe, SLATE, StandardFonts, storageImage, WHITE, type PDFPage } from '@/lib/pdf';
import { CERT_CATEGORIES, matrixState, trainingMatrix, type MatrixCell } from '@/lib/rules/certs';
import { makeXlsx, reportSheet } from '@/lib/rules/xlsx';
import { supabase } from '@/lib/supabase';
import type { Organization } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
export type MatrixData = { operatives: { id: string; name: string }[]; byOp: Record<string, Record<string, MatrixCell>> };

export async function loadTrainingMatrix(orgId: string): Promise<MatrixData> {
  const [p, c] = await Promise.all([
    db.from('profiles').select('id,name').eq('role', 'operative'),
    db.from('operative_certifications').select('operative_id,category,expiry_date').eq('org_id', orgId),
  ]);
  const operatives = (((p.data as { id: string; name: string }[] | null) ?? [])).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return { operatives, byOp: trainingMatrix((c.data as { operative_id: string; category: string; expiry_date: string | null }[] | null) ?? []) };
}
const ukDate = (d: string, short = false) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', short ? { day: '2-digit', month: 'short', year: '2-digit' } : undefined);
export const matrixCellText = (e: MatrixCell | undefined, short = false) => (e ? (e.expiry ? (short ? ukDate(e.expiry, true) : `Expires ${ukDate(e.expiry)}`) : short ? 'Y' : '✓') : '');

export async function exportTrainingMatrixExcel(m: MatrixData, org: Organization | null) {
  const head = ['Operative', ...CERT_CATEGORIES.map((c) => c.label)];
  const rows = m.operatives.map((o) => [o.name, ...CERT_CATEGORIES.map((c) => matrixCellText(m.byOp[o.id]?.[c.key]))]);
  const bytes = makeXlsx([reportSheet('Training Matrix', `${org?.name || 'OpHUB'} — Training Matrix`, head, rows, [26, ...CERT_CATEGORIES.map(() => 18)])]);
  return deliverXlsx(bytes, exportFilename('', 'Training Matrix', 'xlsx'));
}

export async function exportTrainingMatrixPdf(m: MatrixData, org: Organization | null) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), reg = await doc.embedFont(StandardFonts.Helvetica);
  const logo = await storageImage(doc, 'org-logos', org?.logo_path);
  const PAGE_W = 841.89, PAGE_H = 595.28, MARGIN = 40, CONTENT_W = PAGE_W - 2 * MARGIN;
  const BRAND = hexToRgb(org?.color_primary || DEFAULT_BRAND1), LINE = rgb(0.85, 0.84, 0.8);
  const COLOUR = { ok: rgb(0.16, 0.5, 0.25), soon: rgb(0.8, 0.53, 0.02), expired: rgb(0.757, 0.231, 0.231), none: SLATE };
  const nameW = 0.28, colW = (1 - nameW) / CERT_CATEGORIES.length;
  let page!: PDFPage, y = 0;
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: PAGE_H - 70, width: PAGE_W, height: 70, color: BRAND });
    if (logo) { const d = logo.scale(1), s = 32 / Math.max(d.width, d.height); page.drawRectangle({ x: MARGIN, y: PAGE_H - 52, width: 32, height: 32, color: WHITE }); page.drawImage(logo, { x: MARGIN + (32 - d.width * s) / 2, y: PAGE_H - 52 + (32 - d.height * s) / 2, width: d.width * s, height: d.height * s }); }
    const tx = logo ? MARGIN + 42 : MARGIN;
    page.drawText('TRAINING MATRIX', { x: tx, y: PAGE_H - 30, size: 9, font: bold, color: WHITE, opacity: 0.85 });
    drawFit(page, safe(org?.name || ''), { x: tx, y: PAGE_H - 48, size: 13, font: bold, color: WHITE, maxWidth: CONTENT_W - 50 });
    page.drawLine({ start: { x: MARGIN, y: 26 }, end: { x: PAGE_W - MARGIN, y: 26 }, thickness: 0.75, color: LINE });
    page.drawText('Generated via OpHUB', { x: MARGIN, y: 14, size: 8, font: reg, color: SLATE });
    page.drawText(`Exported ${new Date().toLocaleDateString('en-GB')} · amber = expires within 30 days · red = expired`, { x: PAGE_W - MARGIN - 300, y: 14, size: 8, font: reg, color: SLATE });
    y = PAGE_H - 92;
    let x = MARGIN;
    page.drawText('Operative', { x, y, size: 9, font: bold, color: SLATE }); x += nameW * CONTENT_W;
    CERT_CATEGORIES.forEach((c) => { drawFit(page, c.label, { x, y, size: 7.5, font: bold, color: SLATE, maxWidth: colW * CONTENT_W - 4 }, 5.5); x += colW * CONTENT_W; });
    y -= 8; page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.75, color: LINE }); y -= 14;
  };
  newPage();
  m.operatives.forEach((o) => {
    if (y - 16 < 40) newPage();
    let x = MARGIN;
    drawFit(page, safe(o.name || ''), { x, y, size: 9, font: reg, color: INK, maxWidth: nameW * CONTENT_W - 6 }, 6); x += nameW * CONTENT_W;
    CERT_CATEGORIES.forEach((c) => {
      const e = m.byOp[o.id]?.[c.key];
      page.drawText(matrixCellText(e, true) || '-', { x, y, size: 7.5, font: bold, color: COLOUR[matrixState(e)] });
      x += colW * CONTENT_W;
    });
    y -= 15;
  });
  return deliverPdf(await doc.save(), exportFilename('', 'Training Matrix', 'pdf'));
}
