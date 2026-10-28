// The COSHH assessment PDF (589 buildCoshhPdf): product and job, hazard
// symbols and signal word, H / P statements in full, controls and PPE,
// emergencies, storage and disposal, issued by (with signature), and the
// manufacturer's Safety Data Sheet attached at the back.
import { COSHH_PICTO_IMG } from '@/lib/coshhPictoImages';
import { fetchBytes, hexToRgb, PDFDocument, rgb, safe, StandardFonts, storageImage, type PDFFont, type PDFPage } from '@/lib/pdf';
import { publicUrl } from '@/lib/privateFiles';
import { RAMS_PPE_IMG } from '@/lib/ramsPpeImages';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { codeText, COSHH_PICTOS, COSHH_ROUTES, type CoshhItem } from '@/lib/rules/coshh';
import { RAMS_PPE, type RamsSettings } from '@/lib/rules/rams';

type Org = { name?: string | null; color_primary?: string | null; logo_path?: string | null } | null;
type Me = { name?: string | null; signature_path?: string | null };
type SiteLike = { name: string; address: string | null; postcode: string | null } | null | undefined;

export async function buildCoshhPdf(it: CoshhItem, site: SiteLike, job: { where: string; note: string }, org: Org, me: Me, st: RamsSettings): Promise<Uint8Array> {
  const d = it.data;
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold), reg = await pdf.embedFont(StandardFonts.Helvetica);
  const INK = rgb(0.08, 0.08, 0.09), SLATE = rgb(0.35, 0.36, 0.4), LINE = rgb(0.55, 0.55, 0.58), LIGHT = rgb(0.93, 0.93, 0.94), WHITE = rgb(1, 1, 1);
  const BRAND = hexToRgb(org?.color_primary || '#8B1A1A');
  const W = 595.28, H = 841.89, M = 36, CW = W - 2 * M;
  const pages: PDFPage[] = []; let page: PDFPage = null as unknown as PDFPage, y = 0;
  const pdfSafe = (t: unknown) => safe(String(t ?? '').replace(/→/g, '->').replace(/×/g, 'x').replace(/³/g, '3'));
  const newPage = () => { page = pdf.addPage([W, H]); pages.push(page); y = H - M; };
  const ensure = (h: number) => { if (y - h < 46) newPage(); };
  const txt = (t: unknown, x: number, yy: number, size: number, font?: PDFFont, color?: ReturnType<typeof rgb>) => page.drawText(pdfSafe(t), { x, y: yy, size, font: font || reg, color: color || INK });
  const rect = (x: number, yy: number, w: number, h: number, fill?: ReturnType<typeof rgb>, border: ReturnType<typeof rgb> | false = LINE) => page.drawRectangle({ x, y: yy, width: w, height: h, color: fill, borderColor: border === false ? undefined : border, borderWidth: border === false ? 0 : 0.6 });
  const wrap = (t: unknown, font: PDFFont, size: number, maxW: number) => {
    const out: string[] = [];
    pdfSafe(t).split('\n').forEach((par) => {
      const words = par.split(/\s+/).filter(Boolean); let line = '';
      if (!words.length) { out.push(''); return; }
      words.forEach((w) => {
        const test = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(test, size) > maxW && line) { out.push(line); line = w; } else line = test;
        while (font.widthOfTextAtSize(line, size) > maxW && line.length > 1) { let k = line.length - 1; while (k > 1 && font.widthOfTextAtSize(line.slice(0, k), size) > maxW) k--; out.push(line.slice(0, k)); line = line.slice(k); }
      });
      if (line) out.push(line);
    });
    return out;
  };
  const bar = (label: string) => { ensure(26); rect(M, y - 18, CW, 18, BRAND, false); txt(label, M + 6, y - 13, 10.5, bold, WHITE); y -= 24; };
  const kv = (rows: [string, unknown][]) => {
    const lw = 150;
    rows.filter((r) => r[1]).forEach(([k, v]) => {
      const ls = wrap(v, reg, 9, CW - lw - 10), h = Math.max(16, ls.length * 11 + 6);
      ensure(h); rect(M, y - h, lw, h, LIGHT); rect(M + lw, y - h, CW - lw, h);
      txt(k, M + 5, y - 11.5, 9, bold); ls.forEach((l, i) => txt(l, M + lw + 5, y - 11.5 - i * 11, 9, reg)); y -= h;
    });
    y -= 10;
  };
  const para = (t: unknown, size = 9) => { wrap(t, reg, size, CW).forEach((l) => { ensure(size + 4); txt(l, M, y - size, size, reg); y -= size + 3.5; }); y -= 6; };
  const embedData = async (u: string | undefined) => { try { return u ? await pdf.embedJpg(u) : null; } catch { return null; } };
  // header
  newPage();
  const logo = await storageImage(pdf, 'org-logos', org?.logo_path);
  let hy = y - 12; txt((org?.name || '').toUpperCase(), M, hy, 12, bold); hy -= 14;
  String(st.address || '').split('\n').map((s) => s.trim()).filter(Boolean).forEach((l) => { txt(l, M, hy, 9, reg, SLATE); hy -= 11; });
  if (st.phone) { txt(`Tel: ${st.phone}`, M, hy, 9, reg, SLATE); hy -= 11; }
  if (logo) { const dim = logo.scale(1), s = Math.min(150 / dim.width, 64 / dim.height); page.drawImage(logo, { x: W - M - dim.width * s, y: y - dim.height * s, width: dim.width * s, height: dim.height * s }); }
  y = Math.min(hy, y - 70) - 10;
  const title = 'COSHH Assessment'; txt(title, (W - bold.widthOfTextAtSize(title, 17)) / 2, y - 17, 17, bold); y -= 28;
  const pname = pdfSafe(it.title); txt(pname, (W - bold.widthOfTextAtSize(pname, 13)) / 2, y - 13, 13, bold, BRAND); y -= 26;
  const today = new Date(), review = new Date(); review.setFullYear(review.getFullYear() + 1);
  const fmt = (t: Date) => t.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  bar('1.0 Product & Job');
  const addr = site ? fullSiteAddress(site) : '';
  kv([['Product', it.title], ['Manufacturer / supplier', d.manufacturer], ['Used for', d.use], ['Job / site', site ? `${site.name}${addr ? ` — ${addr}` : ''}` : ''], ['Where used on this job', job.where], ['Notes', job.note], ['Assessed by', me.name || ''], ['Date', fmt(today)], ['Review date', fmt(review)], ['Risk level', d.risk]]);
  bar('2.0 Hazards');
  if (d.pictos.length) {
    const IS = 52, per = 6, cw = CW / per;
    for (let i = 0; i < d.pictos.length; i += per) {
      ensure(IS + 24);
      for (const [j, k] of d.pictos.slice(i, i + per).entries()) {
        const img = await embedData(COSHH_PICTO_IMG[k]), cx = M + j * cw + cw / 2;
        if (img) page.drawImage(img, { x: cx - IS / 2, y: y - IS, width: IS, height: IS });
        const lb = COSHH_PICTOS.find((p) => p.key === k)?.label || k;
        txt(lb, cx - reg.widthOfTextAtSize(lb, 7.5) / 2, y - IS - 10, 7.5, reg);
      }
      y -= IS + 22;
    }
  }
  if (d.signal) { ensure(22); txt('Signal word: ', M, y - 12, 11, bold); txt(d.signal.toUpperCase(), M + bold.widthOfTextAtSize('Signal word: ', 11), y - 12, 11, bold, d.signal === 'Danger' ? rgb(0.8, 0.1, 0.1) : rgb(0.75, 0.45, 0.05)); y -= 22; }
  const codeRows = (list: string[]) => list.map((c) => [c, codeText(c) || '—'] as [string, string]);
  if (d.h.length) { ensure(20); txt('Hazard statements', M, y - 11, 10, bold); y -= 16; kv(codeRows(d.h)); }
  if (d.wel) kv([['Workplace exposure limit', d.wel]]);
  if (d.routes.length) kv([['How it can harm you', COSHH_ROUTES.filter(([k]) => d.routes.includes(k)).map(([, l]) => l).join(', ')]]);
  bar('3.0 Controls');
  if (d.p.length) { ensure(20); txt('Precautionary statements', M, y - 11, 10, bold); y -= 16; kv(codeRows(d.p)); }
  if (d.controls) para(d.controls);
  const ppe = RAMS_PPE.filter((p) => d.ppe.includes(p.key));
  if (ppe.length) {
    ensure(20); txt('PPE to wear', M, y - 11, 10, bold); y -= 18;
    const IS = 38, per = 5, cw = CW / per;
    for (let i = 0; i < ppe.length; i += per) {
      ensure(IS + 22);
      for (const [j, p] of ppe.slice(i, i + per).entries()) {
        const img = await embedData(RAMS_PPE_IMG[p.key]), cx = M + j * cw + cw / 2;
        if (img) page.drawImage(img, { x: cx - IS / 2, y: y - IS, width: IS, height: IS });
        txt(p.label, cx - reg.widthOfTextAtSize(pdfSafe(p.label), 8) / 2, y - IS - 11, 8, reg);
      }
      y -= IS + 20;
    }
    y -= 4;
  }
  bar('4.0 Emergencies');
  kv([['First aid', d.firstAid], ['Spillage', d.spill], ['Fire', d.fire]]);
  bar('5.0 Storage & Disposal');
  kv([['Storage', d.storage], ['Disposal', d.disposal]]);
  ensure(60);
  txt(`ISSUED BY: ${me.name || ''}`, M, y - 12, 10, bold); txt(`Date: ${fmt(today)}`, M + 300, y - 12, 10, reg);
  const sig = await storageImage(pdf, 'signatures', me.signature_path);
  if (sig) { const dim = sig.scale(1), s = Math.min(120 / dim.width, 34 / dim.height); page.drawImage(sig, { x: M, y: y - 52, width: dim.width * s, height: dim.height * s }); }
  y -= 60;
  if (d.sdsPath) { ensure(20); txt("The manufacturer's Safety Data Sheet is attached at the back of this assessment.", M, y - 10, 8.5, reg, SLATE); y -= 16; }
  pages.forEach((pg, i) => { const f = pdfSafe(`COSHH Assessment - ${it.title} || Page ${i + 1} of ${pages.length}`); pg.drawText(f, { x: (W - reg.widthOfTextAtSize(f, 8)) / 2, y: 20, size: 8, font: reg, color: SLATE }); pg.drawText('Generated via OpHUB', { x: M, y: 20, size: 7, font: reg, color: SLATE }); });
  // the data sheet itself, at the back
  if (d.sdsPath) {
    try {
      const bytes = await fetchBytes(publicUrl('coshh-library', d.sdsPath));
      if (bytes) { const src = await PDFDocument.load(bytes, { ignoreEncryption: true }); (await pdf.copyPages(src, src.getPageIndices())).forEach((p) => pdf.addPage(p)); }
    } catch { /* the assessment still goes out without it */ }
  }
  pdf.setTitle(`COSHH Assessment - ${it.title}`);
  return pdf.save();
}
