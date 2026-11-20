// The Subcontract Close-Out Certificate (Andy, 20 Nov 2026): the job and the subcontractor, the checks (ticked or not),
// how they're paid and the retention dates, any reason it was closed out anyway, and our PM / site manager's signature.
import { hexToRgb, PDFDocument, rgb, safe, StandardFonts, storageImage, type PDFFont } from '@/lib/pdf';
import { money, retentionSplit, type CloseoutCheck } from '@/lib/rules/closeout';

const pdfSafe = (t: unknown) => safe(String(t ?? '').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"'));
const uk = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(`${v.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB') : '');

export async function buildCloseoutPdf(o: {
  org: { name?: string | null; color_primary?: string | null; logo_path?: string | null } | null;
  siteName: string; siteAddress: string; company: string; checks: CloseoutCheck[];
  billing: 'invoice' | 'application' | null; orderValue: number | null; retentionPct: number | null; pcDate: string | null; defectsEnd: string | null;
  overrideReason: string | null; signer: string; signaturePath: string | null; signedAt: string;
}) {
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold), reg = await pdf.embedFont(StandardFonts.Helvetica);
  const INK = rgb(0.08, 0.08, 0.09), SLATE = rgb(0.35, 0.36, 0.4), LINE = rgb(0.6, 0.6, 0.63), LIGHT = rgb(0.93, 0.93, 0.94), WHITE = rgb(1, 1, 1), OK = rgb(0.2, 0.55, 0.35), WARN = rgb(0.72, 0.28, 0.22);
  const BRAND = hexToRgb(o.org?.color_primary || '#4E8FD1');
  const W = 595.28, H = 841.89, M = 48, CW = W - 2 * M;
  const page = pdf.addPage([W, H]);
  let y = H - M;
  const txt = (t: unknown, x: number, yy: number, size: number, font?: PDFFont, color?: ReturnType<typeof rgb>) => page.drawText(pdfSafe(t), { x, y: yy, size, font: font || reg, color: color || INK });
  const logo = await storageImage(pdf, 'org-logos', o.org?.logo_path);
  if (logo) { const d = logo.scale(1), s = Math.min(200 / d.width, 70 / d.height); page.drawImage(logo, { x: (W - d.width * s) / 2, y: y - d.height * s, width: d.width * s, height: d.height * s }); y -= d.height * s + 16; }
  const title = 'SUBCONTRACT CLOSE-OUT CERTIFICATE';
  txt(title, (W - bold.widthOfTextAtSize(title, 17)) / 2, y - 17, 17, bold, BRAND); y -= 36;
  const row = (k: string, v: string) => { page.drawRectangle({ x: M, y: y - 20, width: 150, height: 20, color: LIGHT, borderColor: LINE, borderWidth: 0.6 }); page.drawRectangle({ x: M + 150, y: y - 20, width: CW - 150, height: 20, borderColor: LINE, borderWidth: 0.6 }); txt(k, M + 6, y - 14, 9.5, bold); txt(v, M + 156, y - 14, 10); y -= 20; };
  row('Main Contractor', o.org?.name || '');
  row('Job', o.siteName);
  if (o.siteAddress) row('Address', o.siteAddress.replace(/\n/g, ', ').slice(0, 90));
  row('Subcontractor', o.company);
  y -= 16;
  page.drawRectangle({ x: M, y: y - 20, width: CW, height: 20, color: BRAND }); txt('CLOSE-OUT CHECKS', M + 7, y - 14, 10, bold, WHITE); y -= 26;
  for (const c of o.checks) {
    const t = y - 12;
    if (c.ok) { page.drawLine({ start: { x: M + 2, y: t - 1 }, end: { x: M + 5.5, y: t - 4.5 }, thickness: 1.6, color: OK }); page.drawLine({ start: { x: M + 5.5, y: t - 4.5 }, end: { x: M + 12, y: t + 4 }, thickness: 1.6, color: OK }); }
    else txt('!', M + 5, y - 15, 12, bold, WARN);
    txt(c.label, M + 22, y - 12, 10.5, bold); txt(c.sub, M + 22, y - 25, 9, reg, SLATE); y -= 34;
  }
  if (o.overrideReason) { txt('Closed out with checks outstanding:', M, y - 10, 9.5, bold, WARN); y -= 14; txt(o.overrideReason.slice(0, 110), M, y - 10, 9.5); y -= 22; }
  y -= 6;
  page.drawRectangle({ x: M, y: y - 20, width: CW, height: 20, color: BRAND }); txt('PAYMENT', M + 7, y - 14, 10, bold, WHITE); y -= 26;
  if (o.billing === 'invoice') { txt('Invoice only: paid on invoice, no retention held.', M, y - 11, 10.5); y -= 22; }
  else {
    const r = retentionSplit(o.orderValue, o.retentionPct);
    if (o.orderValue) { row('Order Value', money(Number(o.orderValue))); }
    if (r) {
      row(`Retention Held (${o.retentionPct}%)`, money(r.held));
      row('First Half', `${money(r.half)} at practical completion${o.pcDate ? `, ${uk(o.pcDate)}` : ''}`);
      row('Second Half', `${money(r.half)} at the end of defects${o.defectsEnd ? `, ${uk(o.defectsEnd)}` : ''}`);
    } else { txt('Applications: retention not set.', M, y - 11, 10.5, reg, SLATE); y -= 22; }
  }
  y -= 22;
  txt('Works complete and accepted', M, y - 11, 11, bold); y -= 20;
  const sig = await storageImage(pdf, 'signatures', o.signaturePath);
  if (sig) { const d = sig.scale(1), s = Math.min(170 / d.width, 44 / d.height); page.drawImage(sig, { x: M, y: y - d.height * s, width: d.width * s, height: d.height * s }); y -= d.height * s + 6; }
  txt(`${o.signer} - ${uk(o.signedAt)} - for ${o.org?.name || 'the main contractor'}`, M, y - 10, 10, reg, SLATE);
  const bytes = await pdf.save();
  return { bytes, filename: `Close-Out Certificate - ${o.company.replace(/[\\/:*?"<>|]+/g, '-')} - ${o.siteName.replace(/[\\/:*?"<>|]+/g, '-')}.pdf` };
}
