// Construction Phase Plan PDF (Andy, 19 Nov 2026), in the layout of RTB's Richardson Court plan: a cover, version
// and issue record with the outline of works, contents, the project directory, the numbered sections, emergency
// numbers and the nearest A&E, the contact sheet, the site documents list and the plans as appendices.
import { hexToRgb, PDFDocument, rgb, safe, StandardFonts, storageImage, type PDFFont, type PDFPage } from '@/lib/pdf';
import { CPP_SITE_DOCUMENTS, f10Needed, fillCpp, isCppHeading, type CppPlan } from '@/lib/rules/cpp';

const pdfSafe = (t: unknown) => safe(String(t ?? '').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/•/g, '-').replace(/→/g, '->'));
const ukDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? new Date(`${v}T00:00:00`).toLocaleDateString('en-GB') : v || '');

export async function buildCppPdf(p: CppPlan, org: { name?: string | null; color_primary?: string | null; logo_path?: string | null } | null, docs: { rams: string[]; coshh: string[] }) {
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold), reg = await pdf.embedFont(StandardFonts.Helvetica);
  const INK = rgb(0.08, 0.08, 0.09), SLATE = rgb(0.35, 0.36, 0.4), LINE = rgb(0.6, 0.6, 0.63), LIGHT = rgb(0.93, 0.93, 0.94), WHITE = rgb(1, 1, 1);
  const BRAND = hexToRgb(org?.color_primary || '#4E8FD1');
  const W = 595.28, H = 841.89, M = 44, CW = W - 2 * M;
  const logo = await storageImage(pdf, 'org-logos', org?.logo_path);
  let page: PDFPage = null as unknown as PDFPage, y = 0;
  const pages: PDFPage[] = [];
  const newPage = () => { page = pdf.addPage([W, H]); pages.push(page); y = H - M; };
  const ensure = (h: number) => { if (y - h < 50) newPage(); };
  const txt = (t: unknown, x: number, yy: number, size: number, font?: PDFFont, color?: ReturnType<typeof rgb>) => page.drawText(pdfSafe(t), { x, y: yy, size, font: font || reg, color: color || INK });
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
  const rect = (x: number, yy: number, w: number, h: number, fill?: ReturnType<typeof rgb>, border: ReturnType<typeof rgb> | false = LINE) =>
    page.drawRectangle({ x, y: yy, width: w, height: h, color: fill, borderColor: border === false ? undefined : border, borderWidth: border === false ? 0 : 0.6 });
  const bar = (label: string) => { ensure(40); rect(M, y - 20, CW, 20, BRAND, false); txt(label, M + 7, y - 14, 11, bold, WHITE); y -= 28; };
  const para = (t: unknown, size = 9.5, font = reg) => { wrap(t, font, size, CW).forEach((l) => { ensure(size + 4); txt(l, M, y - size, size, font); y -= size + 4; }); y -= 4; };
  /** Body text: sub-headings in bold, bullets indented. */
  const body = (t: string) => {
    fillCpp(t, p).split('\n').forEach((raw) => {
      const line = raw.trim();
      if (!line) { y -= 5; return; }
      if (isCppHeading(line)) { ensure(26); y -= 4; para(line, 10, bold); return; }
      const bullet = /^[•-]\s+/.test(line);
      const ls = wrap(bullet ? line.replace(/^[•-]\s+/, '') : line, reg, 9.5, CW - (bullet ? 16 : 0));
      ls.forEach((l, i) => { ensure(14); if (bullet && i === 0) txt('-', M + 4, y - 9.5, 9.5, bold); txt(l, M + (bullet ? 16 : 0), y - 9.5, 9.5, reg); y -= 13.5; });
      y -= 2;
    });
    y -= 6;
  };
  const kv = (rows: [string, unknown][], lw = 150) => {
    rows.filter(([, v]) => String(v ?? '').trim()).forEach(([k, v]) => {
      const ls = wrap(v, reg, 9.5, CW - lw - 12), h = Math.max(18, ls.length * 12 + 7);
      ensure(h); rect(M, y - h, lw, h, LIGHT); rect(M + lw, y - h, CW - lw, h);
      txt(k, M + 6, y - 12.5, 9.5, bold);
      ls.forEach((l, i) => txt(l, M + lw + 6, y - 12.5 - i * 12, 9.5, reg));
      y -= h;
    });
    y -= 10;
  };
  const table = (cols: [string, number][], rows: string[][]) => {
    ensure(40);
    let x = M; cols.forEach(([c, f]) => { rect(x, y - 18, CW * f, 18, LIGHT); txt(c, x + 5, y - 12.5, 9, bold); x += CW * f; }); y -= 18;
    rows.forEach((r) => {
      const cells = cols.map(([, f], i) => wrap(r[i] || '', reg, 9, CW * f - 10)), h = Math.max(18, Math.max(...cells.map((c) => c.length)) * 11.5 + 7);
      ensure(h); x = M;
      cols.forEach(([, f], i) => { rect(x, y - h, CW * f, h); cells[i].forEach((l, k) => txt(l, x + 5, y - 12.5 - k * 11.5, 9, reg)); x += CW * f; });
      y -= h;
    });
    y -= 12;
  };
  const picture = async (path: string | null, caption: string) => {
    const img = await storageImage(pdf, 'mc-documents', path);
    if (!img) return false;
    const dim = img.scale(1), s = Math.min(CW / dim.width, (H - 2 * M - 60) / dim.height);
    ensure(dim.height * s + 30);
    txt(caption, M, y - 12, 11, bold); y -= 22;
    page.drawImage(img, { x: M + (CW - dim.width * s) / 2, y: y - dim.height * s, width: dim.width * s, height: dim.height * s });
    y -= dim.height * s + 16;
    return true;
  };

  // ---- cover ----
  newPage();
  if (logo) { const d = logo.scale(1), s = Math.min(180 / d.width, 90 / d.height); page.drawImage(logo, { x: (W - d.width * s) / 2, y: H - M - d.height * s - 30, width: d.width * s, height: d.height * s }); }
  y = H * 0.62;
  ['CONSTRUCTION PHASE', 'HEALTH AND SAFETY PLAN'].forEach((t) => { txt(t, (W - bold.widthOfTextAtSize(t, 24)) / 2, y, 24, bold, BRAND); y -= 32; });
  y -= 30;
  const cover = (k: string, v: string) => { txt(k, M + 40, y, 11, bold, SLATE); wrap(v, reg, 12, CW - 200).forEach((l, i) => txt(l, M + 200, y - i * 16, 12, reg)); y -= Math.max(1, wrap(v, reg, 12, CW - 200).length) * 16 + 14; };
  cover('PRINCIPAL CONTRACTOR', p.pc.name);
  cover('SITE ADDRESS', p.siteAddress);
  if (p.client.name) cover('CLIENT', p.client.name);

  // ---- version, issue record and outline ----
  newPage();
  kv([['Version Number', String(p.version)], ['Date Prepared', ukDate(p.preparedDate)], ['Prepared By', p.preparedBy], ['Start Date', ukDate(p.startDate)], ['Expected Duration', p.duration]]);
  txt('Construction Phase Plan Issue Record', M, y - 12, 12, bold); y -= 22;
  table([['Copy Number', 0.18], ['Version', 0.14], ['Issued To', 0.46], ['Date', 0.22]], (p.issues.length ? p.issues : [{ copy: '1', version: String(p.version), issuedTo: '', date: '' }]).map((i) => [i.copy, i.version, i.issuedTo, ukDate(i.date)]));
  txt('Outline Of Works To Be Carried Out', M, y - 12, 12, bold); y -= 22;
  para(p.outline || 'To be confirmed.', 10);

  // ---- contents ----
  newPage();
  txt('Contents', M, y - 16, 18, bold); y -= 34;
  ['1. Project Directory', ...p.sections.map((s) => `${s.num}. ${s.title}`), 'Contact Details', 'Site Documents', ...(p.sitePlan || p.firePlan ? ['Appendices: Site Plans'] : [])].forEach((l) => { ensure(18); txt(l, M + 10, y - 11, 11, reg); y -= 18; });

  // ---- 1. project directory ----
  newPage();
  bar('1.0 Project Directory');
  txt('Health and Safety Executive', M, y - 11, 10.5, bold); y -= 18; para(p.hse, 9.5);
  const party = (title: string, rows: [string, unknown][]) => { if (rows.some(([, v]) => String(v ?? '').trim())) { ensure(40); txt(title, M, y - 11, 10.5, bold); y -= 17; kv(rows); } };
  party('Client', [['Name', p.client.name], ['Contact', p.client.contact], ['Address', p.client.address], ['Tel', p.client.phone], ['Email', p.client.email]]);
  party('Client Agent / Project Management', [['Details', p.clientAgent]]);
  party('Principal Designer', [['Details', p.principalDesigner]]);
  party('Principal Contractor', [['Name', p.pc.name], ['Address', p.pc.address], ['Tel', p.pc.phone], ['Email', p.pc.email]]);
  party('Project Manager', [['Name', p.pm.name], ['Tel', p.pm.phone], ['Email', p.pm.email]]);
  party('First Aiders', [['Names', p.firstAiders]]);

  // ---- 2..18 ----
  const f10 = f10Needed(p.duration, p.workers);
  for (const s of p.sections) {
    bar(`${s.num}.0 ${s.title}`);
    body(s.body);
    if (/^15$/.test(s.num.trim()) && f10 !== null) para(f10 ? `Based on the expected duration (${p.duration}) and up to ${p.workers} workers on site at once, this project IS notifiable: an F10 must be submitted to HSE before work starts and displayed on site.` : `Based on the expected duration (${p.duration}) and up to ${p.workers} workers on site at once, this project is not notifiable to HSE (no F10 needed).`, 9.5, bold);
    if (/^11$/.test(s.num.trim())) {
      txt('Emergency Telephone Numbers', M, y - 11, 10.5, bold); y -= 17;
      para('Should undetected services not shown on drawings become affected during works, emergency telephone numbers are listed below.', 9);
      table([['Service', 0.22], ['Company', 0.36], ['Telephone', 0.21], ['Emergency', 0.21]], [...p.utilities.filter((u) => u.service || u.company || u.phone || u.emergency).map((u) => [u.service, u.company, u.phone, u.emergency]), ...(p.hospital.name ? [['Hospital', [p.hospital.name, p.hospital.address].filter(Boolean).join(', '), p.hospital.phone, '999']] : [])]);
    }
    if (/^12$/.test(s.num.trim()) && p.hospital.name) {
      txt('Nearest A&E Hospital', M, y - 11, 10.5, bold); y -= 17;
      kv([['Hospital', p.hospital.name], ['Address', p.hospital.address], ['Phone', p.hospital.phone], ['Distance', p.hospital.distance], ['Route Plan', p.hospital.route]]);
    }
    if (/^17$/.test(s.num.trim()) && (docs.rams.length || docs.coshh.length)) {
      if (docs.rams.length) { txt('Risk Assessments and Method Statements For This Job', M, y - 11, 10.5, bold); y -= 17; docs.rams.forEach((n) => { ensure(14); txt('-', M + 4, y - 9.5, 9.5, bold); txt(n, M + 16, y - 9.5, 9.5, reg); y -= 13.5; }); y -= 8; }
      if (docs.coshh.length) { txt('COSHH Assessments For This Job', M, y - 11, 10.5, bold); y -= 17; docs.coshh.forEach((n) => { ensure(14); txt('-', M + 4, y - 9.5, 9.5, bold); txt(n, M + 16, y - 9.5, 9.5, reg); y -= 13.5; }); y -= 8; }
    }
  }

  // ---- contact details, site documents ----
  bar('Contact Details');
  table([['Person', 0.25], ['Name', 0.29], ['Daytime Telephone', 0.23], ['Out Of Hours Emergency', 0.23]], p.contacts.filter((c) => c.role).map((c) => [c.role, c.name, c.day, c.ooh]));
  bar('Site Documents');
  CPP_SITE_DOCUMENTS.forEach((d, i) => { ensure(15); txt(`${i + 1}.`, M + 4, y - 10, 9.5, bold); txt(d, M + 26, y - 10, 9.5, reg); y -= 15; });
  y -= 8;

  // ---- appendices ----
  if (p.sitePlan || p.firePlan) {
    newPage(); bar('Appendices: Site Plans');
    await picture(p.sitePlan, 'Site Layout - Access, Egress and Compound');
    await picture(p.firePlan, 'Route Plan For Emergency Fire Response');
  }

  // ---- footers ----
  pages.forEach((pg, i) => {
    if (i === 0) return;
    const f = pdfSafe(`${p.siteName || 'Construction Phase Plan'} - Construction Phase Plan v${p.version} || Page ${i + 1} of ${pages.length}`);
    pg.drawText(f, { x: (W - reg.widthOfTextAtSize(f, 8)) / 2, y: 22, size: 8, font: reg, color: SLATE });
    pg.drawText('Generated via OpHUB', { x: M, y: 22, size: 7, font: reg, color: SLATE });
  });
  return { bytes: await pdf.save(), pageCount: pages.length };
}
