// Site Rules & Layout sheet PDF (Andy, 20 Nov 2026): the company logo, the job, the key site information, the numbered
// rules, and the site layout plan on its own page. Signed in the app like an uploaded Site Rules & Layout document.
import { hexToRgb, PDFDocument, rgb, safe, StandardFonts, storageImage, type PDFFont, type PDFPage } from '@/lib/pdf';
import { SITE_RULES_INFO_LABELS, type SiteRulesDoc } from '@/lib/rules/siteRules';

const pdfSafe = (t: unknown) => safe(String(t ?? '').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/•/g, '-'));

export async function buildSiteRulesPdf(d: SiteRulesDoc, org: { name?: string | null; color_primary?: string | null; logo_path?: string | null } | null, version: number) {
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold), reg = await pdf.embedFont(StandardFonts.Helvetica);
  const INK = rgb(0.08, 0.08, 0.09), SLATE = rgb(0.35, 0.36, 0.4), LINE = rgb(0.6, 0.6, 0.63), LIGHT = rgb(0.93, 0.93, 0.94), WHITE = rgb(1, 1, 1);
  const BRAND = hexToRgb(org?.color_primary || '#4E8FD1');
  const W = 595.28, H = 841.89, M = 44, CW = W - 2 * M;
  const logo = await storageImage(pdf, 'org-logos', org?.logo_path);
  let page: PDFPage = null as unknown as PDFPage, y = 0;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
  const ensure = (h: number) => { if (y - h < 50) newPage(); };
  const txt = (t: unknown, x: number, yy: number, size: number, font?: PDFFont, color?: ReturnType<typeof rgb>) => page.drawText(pdfSafe(t), { x, y: yy, size, font: font || reg, color: color || INK });
  const wrap = (t: unknown, font: PDFFont, size: number, maxW: number) => {
    const out: string[] = [];
    pdfSafe(t).split('\n').forEach((par) => {
      const words = par.split(/\s+/).filter(Boolean); let line = '';
      if (!words.length) { out.push(''); return; }
      words.forEach((w) => { const test = line ? `${line} ${w}` : w; if (font.widthOfTextAtSize(test, size) > maxW && line) { out.push(line); line = w; } else line = test; });
      if (line) out.push(line);
    });
    return out;
  };
  const rect = (x: number, yy: number, w: number, h: number, fill?: ReturnType<typeof rgb>, border: ReturnType<typeof rgb> | false = LINE) =>
    page.drawRectangle({ x, y: yy, width: w, height: h, color: fill, borderColor: border === false ? undefined : border, borderWidth: border === false ? 0 : 0.6 });
  const bar = (label: string) => { ensure(40); rect(M, y - 22, CW, 22, BRAND, false); txt(label, M + 8, y - 15.5, 12, bold, WHITE); y -= 30; };

  // ---- the sheet ----
  newPage();
  if (logo) { const dm = logo.scale(1), s = Math.min(240 / dm.width, 90 / dm.height); page.drawImage(logo, { x: (W - dm.width * s) / 2, y: y - dm.height * s, width: dm.width * s, height: dm.height * s }); y -= dm.height * s + 18; }
  const title = (d.title || 'Site Rules').toUpperCase();
  txt(title, (W - bold.widthOfTextAtSize(title, 22)) / 2, y - 22, 22, bold, BRAND); y -= 34;
  const where = [d.siteName, d.siteAddress.replace(/\n/g, ', ')].filter((x) => x.trim()).join(' - ');
  wrap(where, reg, 11, CW).forEach((l) => { txt(l, (W - reg.widthOfTextAtSize(l, 11)) / 2, y - 11, 11, reg, SLATE); y -= 15; });
  const ver = `Version ${version} - ${new Date().toLocaleDateString('en-GB')}`;
  txt(ver, (W - reg.widthOfTextAtSize(ver, 9)) / 2, y - 10, 9, reg, SLATE); y -= 22;
  if (d.intro.trim()) { wrap(d.intro, reg, 10, CW).forEach((l) => { ensure(14); txt(l, M, y - 10, 10, reg); y -= 14; }); y -= 8; }

  const info = SITE_RULES_INFO_LABELS.filter(([k]) => String(d.info[k] || '').trim());
  if (info.length) {
    bar('KEY SITE INFORMATION');
    const lw = 170;
    info.forEach(([k, label]) => {
      const ls = wrap(d.info[k], reg, 10, CW - lw - 12), h = Math.max(20, ls.length * 12.5 + 8);
      ensure(h); rect(M, y - h, lw, h, LIGHT); rect(M + lw, y - h, CW - lw, h);
      txt(label, M + 6, y - 13.5, 9.5, bold);
      ls.forEach((l, i) => txt(l, M + lw + 6, y - 13.5 - i * 12.5, 10, reg));
      y -= h;
    });
    y -= 14;
  }

  bar('SITE RULES');
  d.rules.filter((r) => r.trim()).forEach((r, i) => {
    const n = `${i + 1}.`, ls = wrap(r, reg, 10.5, CW - 30);
    ensure(ls.length * 14 + 6);
    txt(n, M + 2, y - 11, 10.5, bold, BRAND);
    ls.forEach((l, k) => txt(l, M + 28, y - 11 - k * 14, 10.5, reg));
    y -= ls.length * 14 + 6;
  });
  y -= 10;
  ensure(40);
  wrap('Everyone working on this site signs to confirm they have read and understood these rules (signed in OpHUB; the signatures are listed with the signed copy).', reg, 9, CW).forEach((l) => { txt(l, M, y - 9, 9, reg, SLATE); y -= 12; });

  // ---- the layout plan ----
  const img = await storageImage(pdf, 'mc-documents', d.layout);
  if (img) {
    newPage();
    bar('SITE LAYOUT');
    const dm = img.scale(1), s = Math.min(CW / dm.width, (y - M - 10) / dm.height);
    page.drawImage(img, { x: M + (CW - dm.width * s) / 2, y: y - dm.height * s, width: dm.width * s, height: dm.height * s });
  }

  const bytes = await pdf.save();
  const safeName = (d.siteName || 'Job').replace(/[\\/:*?"<>|]+/g, '-');
  return { bytes, filename: `Site Rules - ${safeName} - v${version}.pdf` };
}
