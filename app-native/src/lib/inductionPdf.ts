// The signed Site Induction PDF (550; same layout as the current app). Only reached through lib/pdfLazy.ts, so
// pdf-lib loads when an induction is submitted (speed review, 15 Nov 2026).
import { HEALTH_ITEMS, inductionItems } from '@/data/inductions';
import { DEFAULT_BRAND1, drawFit, exportFilename, hexToRgb, INK, OK, PDFDocument, rgb, safe, siteLabel, SLATE, StandardFonts, storageImage, WHITE, wrap } from '@/lib/pdf';
import type { Organization, Profile, Site } from '@/lib/types';

export async function buildInductionPdf(site: Site, org: Organization | null, op: Profile & { signature_path?: string | null }, f: { emergencyName: string; emergencyNumber: string; health: Record<number, string>; details: Record<number, string> }) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const BRAND = hexToRgb(org?.color_primary || DEFAULT_BRAND1);
  const W = 595.28, H = 841.89, M = 42;
  const items = inductionItems(org);
  const logo = await storageImage(doc, 'org-logos', org?.logo_path);
  let page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: BRAND });
  if (logo) {
    const dim = logo.scale(1); const s = 40 / Math.max(dim.width, dim.height);
    page.drawRectangle({ x: M, y: H - 76, width: 40, height: 40, color: WHITE });
    page.drawImage(logo, { x: M + (40 - dim.width * s) / 2, y: H - 76 + (40 - dim.height * s) / 2, width: dim.width * s, height: dim.height * s });
  }
  const tx = logo ? M + 52 : M;
  page.drawText('SITE INDUCTION', { x: tx, y: H - 40, size: 9, font: bold, color: WHITE, opacity: 0.85 });
  drawFit(page, siteLabel(site), { x: tx, y: H - 60, size: 16, font: bold, color: WHITE });
  page.drawText(safe(org?.name || 'OpHUB'), { x: tx, y: H - 76, size: 9.5, font: reg, color: WHITE, opacity: 0.9 });
  let y = H - 118;
  page.drawText(safe(`Operative: ${op.name}`), { x: M, y, size: 11, font: bold, color: INK }); y -= 16;
  page.drawText(`Completed: ${new Date().toLocaleString('en-GB')}`, { x: M, y, size: 9.5, font: reg, color: SLATE });
  if (f.emergencyName || f.emergencyNumber) { y -= 16; page.drawText(safe(`Emergency contact: ${[f.emergencyName, f.emergencyNumber].filter(Boolean).join(' - ')}`), { x: M, y, size: 9.5, font: reg, color: SLATE }); }
  y -= 26;
  for (const q of items) {
    const lines = wrap(q, reg, 10, W - 2 * M - 24);
    const h = 16 + lines.length * 13;
    if (y - h < 60) { page = doc.addPage([W, H]); y = H - M; }
    const t = y - 11; // drawn tick: the font has no ✓ glyph
    page.drawLine({ start: { x: M, y: t - 2 }, end: { x: M + 3.5, y: t - 5.5 }, thickness: 1.6, color: OK });
    page.drawLine({ start: { x: M + 3.5, y: t - 5.5 }, end: { x: M + 10, y: t + 3 }, thickness: 1.6, color: OK });
    lines.forEach((l, i) => page.drawText(l, { x: M + 20, y: y - 11 - i * 13, size: 10, font: reg, color: INK }));
    y -= h;
  }
  y -= 10;
  if (y < 130) { page = doc.addPage([W, H]); y = H - M; }
  page.drawText('Signature', { x: M, y, size: 9, font: bold, color: SLATE }); y -= 8;
  const sig = await storageImage(doc, 'signatures', op.signature_path);
  if (sig) {
    const dim = sig.scale(1); const s = Math.min(160 / dim.width, 40 / dim.height);
    page.drawImage(sig, { x: M, y: y - dim.height * s, width: dim.width * s, height: dim.height * s }); y -= dim.height * s + 6;
  }
  page.drawText(safe(`${op.name} - ${new Date().toLocaleDateString('en-GB')}`), { x: M, y: y - 4, size: 9.5, font: reg, color: SLATE });
  let p2 = doc.addPage([W, H]);
  p2.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: BRAND });
  p2.drawText('HEALTH QUESTIONNAIRE', { x: M, y: H - 32, size: 9, font: bold, color: WHITE, opacity: 0.85 });
  drawFit(p2, siteLabel(site), { x: M, y: H - 52, size: 14, font: bold, color: WHITE });
  let y2 = H - 100;
  p2.drawText(safe(`Operative: ${op.name}`), { x: M, y: y2, size: 11, font: bold, color: INK }); y2 -= 24;
  HEALTH_ITEMS.forEach((it, i) => {
    const ans = f.health[i] || ''; const det = f.details[i] || '';
    const ql = wrap(`${it.category}: ${it.question}`, bold, 10, W - 2 * M);
    const dl = det ? wrap(`Details: ${det}`, reg, 9.5, W - 2 * M) : [];
    const h = ql.length * 13 + 16 + (dl.length ? dl.length * 12 + 6 : 0) + 12;
    if (y2 - h < 60) { p2 = doc.addPage([W, H]); y2 = H - M; }
    ql.forEach((l, li) => p2.drawText(l, { x: M, y: y2 - li * 13, size: 10, font: bold, color: INK }));
    y2 -= ql.length * 13 + 4;
    p2.drawText(`Answer: ${ans === 'yes' ? 'Yes' : ans === 'no' ? 'No' : '-'}`, { x: M, y: y2, size: 10, font: reg, color: ans === 'yes' ? rgb(0.72, 0.28, 0.22) : SLATE });
    y2 -= 16;
    if (dl.length) { dl.forEach((l, li) => p2.drawText(l, { x: M, y: y2 - li * 12, size: 9.5, font: reg, color: SLATE })); y2 -= dl.length * 12 + 6; }
    y2 -= 12;
  });
  const filename = exportFilename(site.name, `Site Induction - ${op.name}`);
  doc.setTitle(filename.replace(/\.pdf$/i, ''));
  return { bytes: await doc.save(), filename };
}
