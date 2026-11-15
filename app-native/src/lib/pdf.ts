// PDF helpers shared by every export (ports of the current app's pdf* helpers in
// 500-snagging / 030): brand colour, fit-to-width titles, word wrap and images in a PDF. Handing the finished file
// over, the file name and fetching bytes are in lib/fileOut.ts (no pdf-lib there) and re-exported here. Only PDF
// builders import this file; screens reach it through lib/pdfLazy.ts, so pdf-lib loads when Export is pressed
// (speed review, 15 Nov 2026).
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';

import { fetchBytes, fetchScaled, safe } from '@/lib/fileOut';
import { publicUrl } from '@/lib/privateFiles';

export { PDFDocument, rgb, StandardFonts };
export type { PDFFont, PDFImage, PDFPage };
export { DEFAULT_BRAND1, deliverFile, deliverPdf, deliverXlsx, emailPdf, emailPdfsSeparately, exportFilename, fetchBytes, fetchScaled, safe, showPdf, siteLabel } from '@/lib/fileOut';

export function hexToRgb(hex: string | null | undefined) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return rgb(0.306, 0.561, 0.82);
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}
export const INK = rgb(0.06, 0.06, 0.07);
export const SLATE = rgb(0.36, 0.37, 0.41);
export const WHITE = rgb(1, 1, 1);
export const OK = rgb(0.2, 0.55, 0.35);

/** One line that must stay on the page: shrink, then shorten with "…". */
export function drawFit(page: PDFPage, text: string, o: { x: number; y: number; size: number; font: PDFFont; color?: ReturnType<typeof rgb>; opacity?: number; maxWidth?: number }, minSize = 8) {
  let t = String(text ?? '');
  const maxW = o.maxWidth ?? page.getWidth() - o.x - 30;
  let size = o.size; const floor = Math.min(size, minSize);
  while (size > floor && o.font.widthOfTextAtSize(t, size) > maxW) size -= 0.5;
  if (o.font.widthOfTextAtSize(t, size) > maxW) {
    while (t.length > 4 && o.font.widthOfTextAtSize(`${t}…`, size) > maxW) t = t.slice(0, -1);
    t = `${t.replace(/[\s,]+$/, '')}…`;
  }
  page.drawText(safe(t), { x: o.x, y: o.y, size, font: o.font, color: o.color, opacity: o.opacity });
}

export function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = []; let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function embedImage(doc: PDFDocument, bytes: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes) return null;
  try { return await doc.embedPng(bytes); } catch { try { return await doc.embedJpg(bytes); } catch { return null; } }
}
export const storageImage = async (doc: PDFDocument, bucket: string, path: string | null | undefined) => (path ? embedImage(doc, await fetchBytes(publicUrl(bucket, path))) : null);

/** "Media summary" pages: every photo, four to a page, numbered (500 appendMediaSummaryPages). */
export async function appendMediaSummary(doc: PDFDocument, refs: { bucket?: string; path: string; caption?: string }[], o: { maxDim?: number; quality?: number } = {}) {
  if (!refs.length) return;
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), reg = await doc.embedFont(StandardFonts.Helvetica);
  const HEADBAR = rgb(0.925, 0.91, 0.87), PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 42, CONTENT_W = PAGE_W - 2 * MARGIN;
  const gutter = 14, capH = 16, headingH = 40, cellW = (CONTENT_W - gutter) / 2, cellH = (PAGE_H - 2 * MARGIN - headingH - gutter - capH * 2) / 2;
  let num = 0;
  for (let i = 0; i < refs.length; i += 4) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;
    if (i === 0) { page.drawRectangle({ x: MARGIN, y: y - 26, width: CONTENT_W, height: 26, color: HEADBAR }); page.drawText('Media summary', { x: MARGIN + 10, y: y - 18, size: 11.5, font: bold, color: INK }); y -= 36; } else y -= headingH;
    const group = refs.slice(i, i + 4);
    for (let r = 0; r < 2; r++) {
      const row = group.slice(r * 2, r * 2 + 2); if (!row.length) break;
      const rowTop = y - r * (cellH + capH + gutter);
      for (let c = 0; c < row.length; c++) {
        num++;
        const ref = row[c], cx = MARGIN + c * (cellW + gutter);
        const b = await fetchScaled(publicUrl(ref.bucket || 'site-photos', ref.path), o.maxDim || 1500, o.quality ?? 0.8);
        const img = await embedImage(doc, b);
        if (img) { const d = img.scale(1), sc = Math.min(cellW / d.width, cellH / d.height, 1) * 0.8, w = d.width * sc, h = d.height * sc; page.drawImage(img, { x: cx + (cellW - w) / 2, y: rowTop - cellH + (cellH - h) / 2, width: w, height: h }); }
        else { page.drawRectangle({ x: cx, y: rowTop - cellH, width: cellW, height: cellH, color: HEADBAR }); page.drawText(`Photo ${num} - could not be loaded`, { x: cx + 8, y: rowTop - cellH / 2, size: 9, font: reg, color: SLATE }); }
        page.drawText(safe(`Photo ${num}${ref.caption ? `  ·  ${ref.caption}` : ''}`).slice(0, 90), { x: cx, y: rowTop - cellH - 13, size: 8.5, font: reg, color: SLATE });
      }
    }
  }
}
