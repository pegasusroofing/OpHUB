// A Toolbox Talk made in the builder, as a PDF in RTB Roofing's toolbox talk layout (Andy, 19 Nov 2026): the company's
// name, address and phone top left and its logo top centre; "{Title} - TOOLBOX TALK" in white on a black bar;
// Prepare / Reason / Why / Outline; each section's heading in bold, its points numbered, then its question; "Do you
// have any questions for me?"; Questions for you; the closing line in bold capitals; page numbers; and a Sign Off
// Sheet in the company colour with Print Name / Signed / Date lines. Reached through lib/pdfLazy.ts only.
import { hexToRgb, PDFDocument, rgb, safe, StandardFonts, storageImage, type PDFFont, type PDFPage } from '@/lib/pdf';
import { lines, type TbtBuild } from '@/lib/rules/tbtBuilder';

const SIGN_LINES = 19;

export async function buildTbtPdf(b: TbtBuild, org: { name?: string | null; color_primary?: string | null; logo_path?: string | null } | null, contact: { address?: string | null; phone?: string | null }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const boldIt = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const INK = rgb(0.07, 0.07, 0.08), GREY = rgb(0.72, 0.72, 0.74), BLACK = rgb(0, 0, 0), WHITE = rgb(1, 1, 1);
  const BRAND = hexToRgb(org?.color_primary || '#8B1A1A');
  const W = 595.28, H = 841.89, M = 48, CW = W - 2 * M, FOOT = 50;
  const title = safe(b.title.trim() || 'Toolbox Talk');
  let page: PDFPage = null as unknown as PDFPage, y = 0;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - 42; };
  const ensure = (h: number) => { if (y - h < FOOT) newPage(); };
  const txt = (t: string, x: number, yy: number, size: number, font: PDFFont = reg, color = INK) => page.drawText(safe(t), { x, y: yy, size, font, color });
  const wrap = (t: string, font: PDFFont, size: number, maxW: number) => {
    const out: string[] = [];
    safe(t).split('\n').forEach((par) => {
      const words = par.split(/\s+/).filter(Boolean); let line = '';
      words.forEach((w) => { const test = line ? `${line} ${w}` : w; if (font.widthOfTextAtSize(test, size) > maxW && line) { out.push(line); line = w; } else line = test; });
      if (line) out.push(line);
    });
    return out;
  };
  const para = (t: string, size = 10, font: PDFFont = reg, x = M) => wrap(t, font, size, W - M - x).forEach((l) => { ensure(size + 5); txt(l, x, y - size, size, font); y -= size + 4.2; });

  // ---- the company, top left, and its logo, top centre ----
  newPage();
  let hy = y - 9;
  const head = [String(org?.name || '').toUpperCase(), ...String(contact.address || '').split('\n').map((s) => s.trim().replace(/,$/, '')).filter(Boolean), ...(contact.phone ? [`Tel: ${contact.phone}`] : [])].filter(Boolean);
  head.forEach((l) => { txt(l, M, hy, 8.5); hy -= 10.5; });
  const logo = await storageImage(pdf, 'org-logos', org?.logo_path);
  let top = hy;
  if (logo) {
    const d = logo.scale(1), s = Math.min(160 / d.width, 80 / d.height);
    page.drawImage(logo, { x: (W - d.width * s) / 2 + 20, y: y - d.height * s, width: d.width * s, height: d.height * s });
    top = Math.min(top, y - d.height * s);
  }
  y = top - 26;

  // ---- the title bar ----
  page.drawRectangle({ x: M, y: y - 20, width: CW, height: 20, color: BLACK });
  txt(`${title} - TOOLBOX TALK`, M + 5, y - 14.5, 11.5, boldIt, WHITE);
  y -= 40;

  // ---- Prepare / Reason / Why / Outline ----
  const LX = M + 6, VX = M + 92;
  ([['Prepare', b.prepare, true], ['Reason', b.reason, false], ['Why', b.why, false], ['Outline', b.outline, false]] as [string, string, boolean][]).forEach(([k, v, strong]) => {
    if (!v.trim()) return;
    const ls = wrap(v, reg, 10, W - M - VX);
    ensure(ls.length * 14 + 12);
    txt(k, LX, y - 10, 10, strong ? bold : reg);
    ls.forEach((l, i) => txt(l, VX, y - 10 - i * 14, 10));
    y -= ls.length * 14 + 14;
  });
  y -= 2;

  // ---- the sections ----
  b.sections.forEach((s) => {
    const pts = lines(s.points);
    if (!s.heading.trim() && !pts.length) return;
    ensure(40);
    if (s.heading.trim()) { para(s.heading.trim(), 10, bold, LX); y -= 8; }
    pts.forEach((p, i) => {
      const ls = wrap(p, reg, 10, W - M - (M + 38));
      ensure(ls.length * 14 + 2);
      txt(`${i + 1}.`, M + 22, y - 10, 10);
      ls.forEach((l, j) => txt(l, M + 38, y - 10 - j * 14, 10));
      y -= ls.length * 14;
    });
    y -= 12;
    if (s.question.trim()) { para(`Q ${s.question.trim().replace(/^Q\s+/, '')}`, 10, reg, LX); y -= 12; }
  });

  // ---- questions ----
  ensure(30); para('Do you have any questions for me?', 10, reg, LX); y -= 12;
  const qs = lines(b.questions);
  if (qs.length) { ensure(30); para('Questions for you', 10, reg, LX); qs.forEach((q) => para(`Q ${q}`, 10, reg, LX)); y -= 12; }
  if (b.remember.trim()) { ensure(30); y -= 4; para(b.remember.trim().toUpperCase(), 12.5, bold, LX); }

  // ---- the Sign Off Sheet ----
  newPage();
  const SX = M - 12, SW = W - 2 * SX;
  page.drawRectangle({ x: SX, y: y - 20, width: SW, height: 20, color: BRAND });
  txt('Sign Off Sheet', SX + 5, y - 14.5, 11, boldIt, WHITE);
  const boxTop = y - 20;
  y -= 34;
  const intro = 'I have read and understood the contents of this Toolbox Talk ';
  const iw = reg.widthOfTextAtSize(safe(intro), 8.5), tw = bold.widthOfTextAtSize(`(${title})`, 8.5);
  let ix = (W - iw - tw - 3) / 2; if (ix < SX + 6) ix = SX + 6;
  txt(intro, ix, y, 8.5); txt(`(${title})`, ix + iw + 3, y, 8.5, bold); txt('.', ix + iw + tw + 3.5, y, 8.5);
  y -= 16;
  wrap('At all times employees must work in a safe manner both to prevent personal injury or injury/harm to others. I have understood the contents of this Toolbox Talk. Anything I did not understand has been explained to me to my satisfaction', reg, 8.5, SW - 20)
    .forEach((l) => { txt(l, (W - reg.widthOfTextAtSize(l, 8.5)) / 2, y, 8.5); y -= 11; });
  y -= 6;
  const cols: [string, number, number][] = [['Print Name', SX + 12, SX + 12 + SW * 0.44], ['Signed', SX + 12 + SW * 0.46, SX + SW * 0.78], ['Date', SX + SW * 0.8, SX + SW - 12]];
  cols.forEach(([l, a, z]) => {
    const w = bold.widthOfTextAtSize(l, 9), x = (a + z - w) / 2;
    txt(l, x, y, 9, bold); page.drawLine({ start: { x, y: y - 1.5 }, end: { x: x + w, y: y - 1.5 }, thickness: 0.6, color: INK });
  });
  y -= 2;
  for (let i = 0; i < SIGN_LINES; i++) { y -= 28; cols.forEach(([, a, z]) => page.drawLine({ start: { x: a, y }, end: { x: z, y }, thickness: 0.6, color: GREY })); }
  y -= 22;
  page.drawRectangle({ x: SX, y, width: SW, height: boxTop - y, borderColor: BLACK, borderWidth: 1 });

  // ---- page numbers ----
  const all = pdf.getPages();
  all.forEach((p, i) => { const s = `${i + 1} / ${all.length}`; p.drawText(s, { x: (W - reg.widthOfTextAtSize(s, 8)) / 2, y: 26, size: 8, font: reg, color: INK }); });
  return pdf.save();
}
