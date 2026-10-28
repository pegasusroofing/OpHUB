// Snagging Report PDF (500 buildSnaggingPdfBytes): branded header, Total / Open
// / Closed chips, a card per snag (status pill, location, raised / closed by,
// first photo — the close-out photo once closed), then every photo in the
// Media summary, and "Page x of y".
import { appendMediaSummary, DEFAULT_BRAND1, drawFit, embedImage, exportFilename, fetchScaled, hexToRgb, INK, PDFDocument, rgb, safe, siteLabel, SLATE, StandardFonts, storageImage, WHITE } from '@/lib/pdf';
import { publicUrl } from '@/lib/privateFiles';
import type { Snag } from '@/data/snags';
import type { Organization, Site } from '@/lib/types';

export type SnagScope = 'live' | 'closed' | 'all';
type S = Snag & { created_by?: string | null };

export async function buildSnagPdf(snags: S[], site: Site, org: Organization | null, scope: SnagScope, nameOf: (id: string | null | undefined) => string) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), reg = await doc.embedFont(StandardFonts.Helvetica);
  const BRAND = hexToRgb(org?.color_primary || DEFAULT_BRAND1);
  const FAINT = rgb(0.85, 0.84, 0.8), CARDBG = rgb(0.976, 0.969, 0.949), OK = rgb(0.2, 0.55, 0.35), OKBG = rgb(0.9, 0.95, 0.91), WARN = rgb(0.69, 0.45, 0.06), WARNBG = rgb(0.97, 0.92, 0.83);
  const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 42;
  const scopeLabel = scope === 'live' ? 'Live' : scope === 'closed' ? 'Closed' : 'All';
  const logo = await storageImage(doc, 'org-logos', org?.logo_path);
  let page = doc.addPage([PAGE_W, PAGE_H]), y = 0;
  const newPage = (first = false) => {
    if (!first) page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: PAGE_H - 92, width: PAGE_W, height: 92, color: BRAND });
    if (logo) { const d = logo.scale(1), s = 40 / Math.max(d.width, d.height); page.drawRectangle({ x: MARGIN, y: PAGE_H - 76, width: 40, height: 40, color: WHITE }); page.drawImage(logo, { x: MARGIN + (40 - d.width * s) / 2, y: PAGE_H - 76 + (40 - d.height * s) / 2, width: d.width * s, height: d.height * s }); }
    const tx = logo ? MARGIN + 52 : MARGIN;
    page.drawText('SNAGGING REPORT', { x: tx, y: PAGE_H - 40, size: 9, font: bold, color: WHITE, opacity: 0.85 });
    drawFit(page, siteLabel(site), { x: tx, y: PAGE_H - 60, size: 16, font: bold, color: WHITE });
    drawFit(page, `${org?.name || 'OpHUB'} · ${scopeLabel} snags`, { x: tx, y: PAGE_H - 76, size: 9.5, font: reg, color: WHITE, opacity: 0.9 });
    y = PAGE_H - 118;
  };
  newPage(true);
  const chipY = y - 34;
  [{ l: 'Total snags', v: snags.length, bg: CARDBG, fg: INK }, { l: 'Open', v: snags.filter((s) => s.status === 'open').length, bg: WARNBG, fg: WARN }, { l: 'Closed', v: snags.filter((s) => s.status === 'closed').length, bg: OKBG, fg: OK }].forEach((c, i) => {
    const x = MARGIN + i * 164;
    page.drawRectangle({ x, y: chipY, width: 150, height: 44, color: c.bg });
    page.drawText(String(c.v), { x: x + 12, y: chipY + 22, size: 16, font: bold, color: c.fg });
    page.drawText(c.l.toUpperCase(), { x: x + 12, y: chipY + 8, size: 7.5, font: bold, color: c.fg, opacity: 0.8 });
  });
  y = chipY - 26;
  const cardPhoto = (s: S) => (s.status === 'closed' && s.closed_photo_path ? s.closed_photo_path : (s.photo_paths && s.photo_paths[0]) || s.photo_path);
  for (let i = 0; i < snags.length; i++) {
    const s = snags[i], photo = cardPhoto(s), blockH = photo ? 130 : 78;
    if (y - blockH < 50) newPage();
    const top = y, W = PAGE_W - 2 * MARGIN, left = MARGIN + 16;
    page.drawRectangle({ x: MARGIN, y: top - blockH, width: W, height: blockH, color: CARDBG });
    let ty = top - 22;
    drawFit(page, `${i + 1}. ${s.title}`, { x: left, y: ty, size: 12, font: bold, color: INK, maxWidth: W - (photo ? 84 : 0) - 110 });
    const closed = s.status === 'closed';
    page.drawRectangle({ x: MARGIN + W - 72, y: ty - 3, width: 56, height: 15, color: closed ? OKBG : WARNBG });
    page.drawText(s.status.toUpperCase(), { x: MARGIN + W - 64, y: ty + 1, size: 8, font: bold, color: closed ? OK : WARN });
    ty -= 18;
    drawFit(page, `Location: ${s.location || '—'}`, { x: left, y: ty, size: 9.5, font: reg, color: SLATE, maxWidth: W - (photo ? 116 : 32) }); ty -= 14;
    drawFit(page, `Raised by ${nameOf(s.created_by)} · ${s.created_at ? new Date(s.created_at).toLocaleDateString('en-GB') : ''}`, { x: left, y: ty, size: 9, font: reg, color: SLATE, maxWidth: W - (photo ? 116 : 32) }); ty -= 14;
    if (closed) { drawFit(page, `Closed by ${nameOf(s.closed_by)}${s.closed_at ? ` · ${new Date(s.closed_at).toLocaleDateString('en-GB')}` : ''}`, { x: left, y: ty, size: 9, font: reg, color: SLATE, maxWidth: W - (photo ? 116 : 32) }); ty -= 14; }
    if (s.pdf_path) page.drawText(safe('PDF attachment on file'), { x: left, y: ty, size: 8.5, font: reg, color: SLATE });
    if (photo) {
      const img = await embedImage(doc, await fetchScaled(publicUrl('site-photos', photo), 228, 0.78));
      if (img) { const d = img.scale(1), sc = 76 / Math.max(d.width, d.height), w = d.width * sc, h = d.height * sc, ix = MARGIN + W - 92, iy = top - blockH + 14; page.drawImage(img, { x: ix + (76 - w) / 2, y: iy + (76 - h) / 2, width: w, height: h }); }
    }
    y = top - blockH - 14;
  }
  const refs: { path: string }[] = [];
  snags.forEach((s) => { (s.photo_paths || []).forEach((p) => refs.push({ path: p })); if (!(s.photo_paths || []).length && s.photo_path) refs.push({ path: s.photo_path }); if (s.closed_photo_path) refs.push({ path: s.closed_photo_path }); });
  await appendMediaSummary(doc, refs, { maxDim: 900, quality: 0.72 });
  const n = doc.getPageCount();
  doc.getPages().forEach((p, i) => {
    p.drawLine({ start: { x: MARGIN, y: 34 }, end: { x: PAGE_W - MARGIN, y: 34 }, thickness: 0.75, color: FAINT });
    p.drawText('Generated via OpHUB', { x: MARGIN, y: 20, size: 8, font: reg, color: SLATE });
    p.drawText(`Page ${i + 1} of ${n}`, { x: PAGE_W - MARGIN - 52, y: 20, size: 8, font: reg, color: SLATE });
  });
  const filename = exportFilename(site.name, `Snagging Report (${scopeLabel})`, 'pdf');
  doc.setTitle(filename.replace(/\.pdf$/i, ''));
  return { bytes: await doc.save(), filename };
}
