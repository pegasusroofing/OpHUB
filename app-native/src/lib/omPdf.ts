// O&M manual PDF (857 hoBuildPdf): page 1 cover (heading, wide photo, title,
// project, address, volume), page 2 logo + CDM wording + Contractor and Revision
// Details, then every section (text, tables, maintenance, photos), then the
// Appendices list and the attached documents (data sheets, guarantees, COSHH,
// drawings, chosen files, Schedule of Works, reports). Page numbers on the
// manual's own pages only.
import { collectAttachments } from '@/data/omManual';
import { buildReportPdf, type PdfSub } from '@/lib/reportPdf';
import { embedImage, fetchBytes, fetchScaled, hexToRgb, PDFDocument, rgb, safe, StandardFonts, type PDFImage, type PDFPage } from '@/lib/pdf';
import { publicUrl } from '@/lib/privateFiles';
import { addrLines, contractorRows, contractorSec, omFmtDate, type OmData } from '@/lib/rules/omManual';
import { buildSowPdf } from '@/lib/sowPdf';
import { supabase } from '@/lib/supabase';
import type { Organization, Site } from '@/lib/types';

export async function buildOmPdf(d: OmData, site: Site, org: Organization | null, nameOf: (id: string | null | undefined) => string, onStatus?: (m: string) => void): Promise<{ bytes: Uint8Array; notAttached: string[] }> {
  const c = d.cover || {};
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold), reg = await pdf.embedFont(StandardFonts.Helvetica);
  const BRAND = hexToRgb(org?.color_primary || '#8B1A1A'), INK = rgb(0.08, 0.08, 0.09), SLATE = rgb(0.35, 0.36, 0.4), LINE = rgb(0.7, 0.7, 0.72), LIGHT = rgb(0.94, 0.94, 0.95), WHITE = rgb(1, 1, 1);
  const NAVY = rgb(0.12, 0.2, 0.3), DARK = rgb(0.09, 0.2, 0.23);
  const W = 595.28, H = 841.89, M = 42, CW = W - 2 * M;
  let page!: PDFPage, y = 0;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
  const ensure = (h: number) => { if (y - h < M + 20) newPage(); };
  const wrap = (t: unknown, font: typeof reg, size: number, maxW: number) => {
    const out: string[] = [];
    safe(String(t ?? '')).split('\n').forEach((par) => {
      const words = par.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(''); return; }
      let line = '';
      words.forEach((w) => { const t2 = line ? `${line} ${w}` : w; if (font.widthOfTextAtSize(t2, size) > maxW && line) { out.push(line); line = w; } else line = t2; });
      if (line) out.push(line);
    });
    return out;
  };
  const txt = (t: string, x: number, yy: number, size: number, font = reg, color = INK) => page.drawText(safe(t), { x, y: yy, size, font, color });
  const ctr = (t: string, yy: number, size: number, font = reg, color = INK) => txt(t, M + (CW - font.widthOfTextAtSize(safe(t), size)) / 2, yy, size, font, color);
  const img = async (bucket: string, path: string, max: number): Promise<PDFImage | null> => embedImage(pdf, await fetchScaled(publicUrl(bucket, path), max, 0.82));

  // page 1 — heading, wide photo, title block
  newPage();
  if (c.header) wrap(c.header, bold, 12, CW).forEach((l, i) => ctr(l, H - M - 12 - i * 15, 12, bold));
  y = H - M - 70;
  if (c.coverPhoto) {
    const im = await img(c.coverPhoto.bucket, c.coverPhoto.path, 1800);
    if (im) { const wide = CW, maxH = CW / 2, s = im.scale(1); let w = wide, h = (w * s.height) / s.width; if (h > maxH) { h = maxH; w = (h * s.width) / s.height; } page.drawImage(im, { x: M + (CW - w) / 2, y: y - h, width: w, height: h }); y -= h; }
  }
  y -= 80;
  wrap(c.title || 'O&M MANUAL', reg, 26, CW).forEach((l) => { txt(l, M, y, 26); y -= 34; });
  wrap(c.project || '', reg, 26, CW).forEach((l) => { txt(l, M, y, 26); y -= 34; });
  y -= 2;
  addrLines(c.address).forEach((a) => wrap(a, bold, 15, CW).forEach((l) => { txt(l, M, y, 15, bold); y -= 25; }));
  if (c.volume) wrap(c.volume, bold, 9, CW).forEach((l) => { txt(l, M, y + 2, 9, bold); y -= 13; });

  // page 2 — logo, CDM wording, contractor + revision details
  newPage();
  y = H - M - 60;
  const logo = org?.logo_path ? await embedImage(pdf, await fetchBytes(publicUrl('org-logos', org.logo_path))) : null;
  if (logo) { const s = logo.scale(1); let w = 210, h = (w * s.height) / s.width; if (h > 170) { h = 170; w = (h * s.width) / s.height; } page.drawImage(logo, { x: M + (CW - w) / 2, y: y - h, width: w, height: h }); y -= h; }
  y -= 70;
  String(c.subtitle || '').split('\n').forEach((par) => { if (!par.trim()) { y -= 14; return; } wrap(par, reg, 15, CW).forEach((l) => { ctr(l, y, 15, reg, NAVY); y -= 20; }); });
  {
    const rowsC = contractorRows(d);
    const L = CW * 0.38, rh = 23, hb = 15;
    let ty = Math.min(y - 60, M + 60 + hb * 2 + rh * (rowsC.length + 1));
    const bar = (label: string) => { page.drawRectangle({ x: M, y: ty - hb, width: CW, height: hb, color: DARK, borderColor: INK, borderWidth: 0.6 }); txt(label, M + 5, ty - 11, 8.5, reg, WHITE); ty -= hb; };
    const cell = (x: number, w: number, t: string) => { page.drawRectangle({ x, y: ty - rh, width: w, height: rh, borderColor: INK, borderWidth: 0.6 }); const ls = wrap(t, reg, 9, w - 10).slice(0, 2); ls.forEach((l, li) => txt(l, x + 5, ty - rh / 2 - 3 - li * 10 + (ls.length - 1) * 5, 9)); };
    bar('Contractor Details');
    rowsC.forEach((r) => { cell(M, L, `${String(r[0] || '').trim().replace(/:?$/, ':')}`); cell(M + L, CW - L, r.slice(1).filter(Boolean).join('  ')); ty -= rh; });
    bar('Revision Details');
    const w2 = CW * 0.29, w3 = CW * 0.16, w4 = CW - L - w2 - w3;
    cell(M, L, 'Revision Number:'); cell(M + L, w2, c.revision || ''); cell(M + L + w2, w3, 'Date:'); cell(M + L + w2 + w3, w4, omFmtDate(c.date)); ty -= rh;
  }

  // sections
  newPage();
  const skip = contractorSec(d);
  for (const s of d.sections) {
    if (s === skip) continue;
    ensure(40);
    const tl = wrap(s.title || '', bold, 13, CW - 12);
    page.drawRectangle({ x: M, y: y - 18 - (tl.length - 1) * 15, width: CW, height: 18 + (tl.length - 1) * 15 + 4, color: BRAND });
    tl.forEach((l, i) => txt(l, M + 6, y - 14 - i * 15, 13, bold, WHITE)); y -= 26 + (tl.length - 1) * 15;
    if (s.type === 'text') { wrap(s.body || '', reg, 10, CW).forEach((l) => { ensure(14); txt(l, M, y - 10, 10); y -= 13.5; }); y -= 10; }
    else if (s.type === 'maint') {
      (s.items || []).forEach((it) => {
        if (it.title) { ensure(30); wrap(it.title, bold, 11, CW).forEach((l) => { txt(l, M, y - 11, 11, bold); y -= 15; }); y -= 2; }
        wrap(it.text || '', reg, 10, CW).forEach((l) => { ensure(14); txt(l, M, y - 10, 10); y -= 13.5; }); y -= 10;
      });
    } else if (s.type === 'table' || s.type === 'materials') {
      const cols = (s.columns || []).length || 1, colW = CW / cols, hasHead = (s.columns || []).some((h) => String(h || '').trim());
      const all = (hasHead ? [s.columns || []] : []).concat(s.rows || []);
      all.forEach((r, ri) => {
        const head = hasHead && ri === 0;
        const cells = r.map((v, ci) => wrap(v || '', head || (ci === 0 && !hasHead) ? bold : reg, 9, colW - 8));
        const h = Math.max(16, Math.max(1, ...cells.map((cl) => cl.length)) * 11 + 6);
        ensure(h);
        r.forEach((_, ci) => {
          const shade = head || (ci === 0 && !hasHead);
          page.drawRectangle({ x: M + ci * colW, y: y - h, width: colW, height: h, color: shade ? LIGHT : WHITE, borderColor: LINE, borderWidth: 0.6 });
          cells[ci].forEach((l, li) => txt(l, M + ci * colW + 4, y - 11 - li * 11, 9, shade ? bold : reg));
        });
        y -= h;
      });
      y -= 14;
    } else if (s.type === 'photos') {
      const ph0 = s.photos || [], gap = 10, pw = (CW - gap) / 2, ph = pw * 0.75;
      for (let i = 0; i < ph0.length; i += 2) {
        ensure(ph + 26);
        for (let j = 0; j < 2 && i + j < ph0.length; j++) {
          const p = ph0[i + j], im = await img(p.bucket, p.path, 1200), x = M + j * (pw + gap);
          if (im) { const sc = im.scale(1); let w = pw, h = (w * sc.height) / sc.width; if (h > ph) { h = ph; w = (h * sc.width) / sc.height; } page.drawImage(im, { x: x + (pw - w) / 2, y: y - ph + (ph - h) / 2, width: w, height: h }); }
          wrap(p.caption || '', reg, 8.5, pw).slice(0, 2).forEach((l, li) => txt(l, x, y - ph - 11 - li * 10, 8.5, reg, SLATE));
        }
        y -= ph + 30;
      }
    }
  }

  // attachments
  const att = await collectAttachments(site.id, d);
  let nOwn = pdf.getPageCount();
  const notAttached: string[] = [];
  if (att.length) {
    newPage(); txt('Appendices', M, y - 20, 18, bold); y -= 44;
    att.forEach((a, i) => wrap(`${i + 1}.  ${a.name}`, reg, 10, CW).forEach((l) => { ensure(14); txt(l, M, y, 10); y -= 14; }));
    nOwn = pdf.getPageCount();
    for (let i = 0; i < att.length; i++) {
      const a = att[i]; onStatus?.(`Attaching ${i + 1} of ${att.length}…`);
      let placed = false;
      try {
        let src: PDFDocument | null = null;
        if (a.gen?.kind === 'sow-app') { const r = await buildSowPdf(site, org, 'all', null); if (typeof r !== 'string') src = await PDFDocument.load(r.bytes, { ignoreEncryption: true }); }
        else if (a.gen?.kind === 'report' && a.gen.reportId) {
          const sub = (await supabase.from('report_submissions').select('*').eq('id', a.gen.reportId).maybeSingle()).data as unknown as PdfSub | null;
          const r = sub ? await buildReportPdf(sub, site, org, nameOf) : null; if (r?.bytes.length) src = await PDFDocument.load(r.bytes, { ignoreEncryption: true });
        } else if (a.path && /\.(jpe?g|png)$/i.test(a.path)) {
          const im = await img(a.bucket || '', a.path, 1800);
          if (im) { newPage(); const sc = im.scale(1); let w = CW, h = (w * sc.height) / sc.width; if (h > H - 2 * M) { h = H - 2 * M; w = (h * sc.width) / sc.height; } page.drawImage(im, { x: M, y: H - M - h, width: w, height: h }); placed = true; }
        } else if (a.path) { const b = await fetchBytes(publicUrl(a.bucket || '', a.path)); if (b) src = await PDFDocument.load(b, { ignoreEncryption: true }); }
        if (src) { (await pdf.copyPages(src, src.getPageIndices())).forEach((pg) => pdf.addPage(pg)); placed = true; }
      } catch { /* listed below */ }
      if (!placed) notAttached.push(a.name + (a.gen?.kind === 'sow-app' ? ' (no tasks on this job yet)' : ''));
    }
  }
  // page numbers on the manual's own pages (not the first two, not attached documents)
  const total = pdf.getPageCount();
  pdf.getPages().slice(0, nOwn).forEach((pg, i) => { if (i < 2) return; pg.drawText(safe(`${c.project || ''} — O&M Manual   ·   Page ${i + 1} of ${total}`), { x: M, y: 20, size: 7.5, font: reg, color: SLATE }); });
  return { bytes: await pdf.save(), notAttached };
}
