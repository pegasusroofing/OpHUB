// RAMS Builder PDFs (587): the Risk Assessment and the Method Statement as two
// A4 documents in RTB's RAMS layout — details table, signatures, data
// protection, groups, hazard tables with pre-control / residual P-S-RR, the
// risk legend, PPE, the sign-off sheet and the optional dynamic risk
// assessment. The sign-off rows are registered as signature boxes (op1..opN,
// and the author as 'pm'), so operatives' signatures drop straight in.
import { hexToRgb, PDFDocument, rgb, safe, StandardFonts, storageImage, type PDFFont, type PDFPage } from '@/lib/pdf';
import { RAMS_PPE_IMG } from '@/lib/ramsPpeImages';
import { P_LABELS, RAMS_PPE, riskBand, S_LABELS, type RamsBuild, type RamsSettings } from '@/lib/rules/rams';

const SIGN_ROWS = 18;
const pdfSafe = (t: unknown) => safe(String(t ?? '').replace(/→/g, '->').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/×/g, 'x'));
type Box = { p: number; w: string; t: string; r: [number, number, number, number] };

export async function buildRamsPdf(b: RamsBuild, which: 'ra' | 'ms', org: { name?: string | null; color_primary?: string | null; logo_path?: string | null } | null, st: RamsSettings) {
  const d = b.details, isRA = which === 'ra';
  const docNo = isRA ? d.raNumber || '' : d.msNumber || '';
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold), reg = await pdf.embedFont(StandardFonts.Helvetica);
  const INK = rgb(0.08, 0.08, 0.09), SLATE = rgb(0.35, 0.36, 0.4), LINE = rgb(0.55, 0.55, 0.58), LIGHT = rgb(0.93, 0.93, 0.94), WHITE = rgb(1, 1, 1);
  const BRAND = hexToRgb(org?.color_primary || '#8B1A1A');
  const W = 595.28, H = 841.89, M = 36, CW = W - 2 * M;
  const company = org?.name || 'Company';
  const logo = await storageImage(pdf, 'org-logos', org?.logo_path);
  let page: PDFPage = null as unknown as PDFPage, y = 0;
  const pages: PDFPage[] = [], boxes: Box[] = [];
  const newPage = () => { page = pdf.addPage([W, H]); pages.push(page); y = H - M; };
  const ensure = (h: number) => { if (y - h < 46) newPage(); };
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
  const bar = (label: string) => { ensure(26); rect(M, y - 18, CW, 18, BRAND, false); txt(label, M + 6, y - 13, 10.5, bold, WHITE); y -= 24; };
  const para = (t: unknown, size = 9) => { wrap(t, reg, size, CW).forEach((l) => { ensure(size + 4); txt(l, M, y - size, size, reg); y -= size + 3.5; }); y -= 4; };
  const kvTable = (rows: [string, unknown][]) => {
    const lw = 190;
    rows.forEach(([k, v]) => {
      const ls = wrap(v || '', reg, 9, CW - lw - 10), h = Math.max(16, ls.length * 11 + 6);
      ensure(h); rect(M, y - h, lw, h, LIGHT); rect(M + lw, y - h, CW - lw, h);
      txt(k, M + 5, y - 11.5, 9, bold);
      ls.forEach((l, i) => txt(l, M + lw + 5, y - 11.5 - i * 11, 9, reg));
      y -= h;
    });
    y -= 10;
  };
  const box = (who: string, t: string, x: number, w: number, h: number) => boxes.push({ p: pages.length, w: who, t, r: [(x + 2) / W, (H - (y - 2)) / H, (w - 4) / W, (h - 4) / H] });

  // ---- header (first page) ----
  newPage();
  let hy = y - 12;
  txt(company.toUpperCase(), M, hy, 12, bold); hy -= 13;
  String(st.address || '').split('\n').map((s) => s.trim()).filter(Boolean).forEach((l) => { txt(l, M, hy, 9, reg, SLATE); hy -= 11; });
  if (st.phone) { txt(`Tel: ${st.phone}`, M, hy, 9, reg, SLATE); hy -= 11; }
  if (logo) { const dim = logo.scale(1), s = Math.min(150 / dim.width, 64 / dim.height); page.drawImage(logo, { x: W - M - dim.width * s, y: y - dim.height * s, width: dim.width * s, height: dim.height * s }); }
  y = Math.min(hy, y - 70) - 14;
  const L = isRA ? 'Risk Assessment' : 'Method Statement';
  txt(L, (W - bold.widthOfTextAtSize(L, 18)) / 2, y - 16, 18, bold); y -= 32;
  const fmt = (v: string) => (v ? (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`).toLocaleDateString('en-GB') : v) : '');
  bar(isRA ? '1.0 Risk Assessment Details' : 'Method Statement Details');
  kvTable([[`${L} Number`, docNo], [`${L} Date`, fmt(d.date)], ...(isRA ? [['Risk Review Date', fmt(d.reviewDate)] as [string, string]] : []), [`${L} Author`, d.author], ['Project/Contract', d.project], ['Start Date', fmt(d.startDate)], ['Expected Job Duration', d.duration], ['Client Contact', d.clientContact], ['Description', d.description], ['Site Address', d.address]]);
  bar(isRA ? '2.0 Signatures' : 'Signatures');
  {
    ensure(40); const cols: [string, number][] = [['', 120], ['Name', 110], ['Title', 90], ['Signature', 105], ['Date', CW - 425]]; let x = M;
    cols.forEach(([c, w]) => { rect(x, y - 14, w, 14, LIGHT); txt(c, x + 4, y - 10, 8.5, bold); x += w; }); y -= 14;
    x = M; const rowH = 26, vals = ['Document Author', d.author || '', '', '', fmt(d.date)];
    cols.forEach(([, w], i) => { rect(x, y - rowH, w, rowH); if (vals[i]) txt(vals[i], x + 4, y - 16, 9, i === 0 ? bold : reg); if (i === 3) box('pm', 'sig', x, w, rowH); x += w; });
    y -= rowH + 12;
  }
  bar('Data Protection Statement'); para(st.dataProtection, 8.5);
  if (isRA) {
    if (d.notes) { bar('3.0 Risk Assessment Notes'); para(d.notes); }
    bar('4.0 Individuals or Groups Affected By This Assessment');
    kvTable([['Groups Affected', (d.groups || []).join(', ')], ...(d.mainContractor ? [['Main Contractor', d.mainContractor] as [string, string]] : [])]);
    bar('5.0 Hazards and Control Procedures');
    const sideW = 66, cellW = sideW / 3, midW = CW - 2 * sideW;
    b.hazards.forEach((hz) => {
      const harm = wrap(hz.harm || '', reg, 8.5, midW - 8), ctrl = (hz.controls || []).map((c) => wrap(c, reg, 8.5, midW - 8));
      const hH = Math.max(14, harm.length * 10.5 + 4);
      ensure(16 + 12 + hH + 16 + (ctrl[0] ? ctrl[0].length * 10.5 + 6 : 0));
      rect(M, y - 16, sideW, 16, LIGHT); txt('Pre-Control', M + 4, y - 11.5, 8, bold);
      rect(M + sideW, y - 16, midW, 16, LIGHT); txt(`Hazard: ${hz.title || ''}`, M + sideW + 4, y - 11.5, 9.5, bold);
      rect(M + sideW + midW, y - 16, sideW, 16, LIGHT); txt('Residual Risk', M + sideW + midW + 4, y - 11.5, 8, bold);
      y -= 16;
      ['P', 'S', 'RR'].forEach((c, i) => { rect(M + i * cellW, y - hH, cellW, hH, LIGHT); txt(c, M + i * cellW + cellW / 2 - 3, y - 10, 8, bold); rect(M + sideW + midW + i * cellW, y - hH, cellW, hH, LIGHT); txt(c, M + sideW + midW + i * cellW + cellW / 2 - 3, y - 10, 8, bold); });
      rect(M + sideW, y - hH, midW, hH); harm.forEach((l, i) => txt(l, M + sideW + 4, y - 10 - i * 10.5, 8.5, reg));
      y -= hH;
      const valH = 16;
      [[hz.p, hz.s], [hz.rp, hz.rs]].forEach(([p, s], side) => {
        const x0 = side ? M + sideW + midW : M, n = (Number(p) || 0) * (Number(s) || 0), band = riskBand(n);
        [p, s, n].forEach((v, i) => { const isRR = i === 2; rect(x0 + i * cellW, y - valH, cellW, valH, isRR ? hexToRgb(band.bg) : undefined); txt(String(v), x0 + i * cellW + cellW / 2 - String(v).length * 2.4, y - 11.5, 9, bold, isRR && band.fg === '#fff' ? WHITE : INK); });
      });
      rect(M + sideW, y - valH, midW, valH, LIGHT); txt('Control Procedures', M + sideW + 4, y - 11.5, 9, bold);
      y -= valH;
      ctrl.forEach((ls) => { const h = ls.length * 10.5 + 6; ensure(h); rect(M + sideW, y - h, midW, h); ls.forEach((l, i) => txt(l, M + sideW + 4, y - 10 - i * 10.5, 8.5, reg)); y -= h; });
      y -= 12;
    });
    ensure(80);
    const bands = ['1-2  Very low', '3-7  Low priority', '8-9  Medium priority', '10-14  High priority', '15-25  Urgent action required'];
    [['Probability (P)', 'Severity (S)', 'Risk Ranking (RR = P x S)'], ...[1, 2, 3, 4, 5].map((n) => [`${n} ${P_LABELS[n]}`, `${n} ${S_LABELS[n]}`, bands[n - 1]])].forEach((r, i) => {
      const cw = CW / 3; r.forEach((c, j) => { rect(M + j * cw, y - 13, cw, 13, i === 0 ? LIGHT : undefined); txt(c, M + j * cw + 4, y - 9.5, 8, i === 0 ? bold : reg); }); y -= 13;
    });
    y -= 12;
    if (b.ppe.length) {
      bar('6.0 Required PPE');
      const items = RAMS_PPE.filter((p) => b.ppe.includes(p.key)), cw = CW / 3, IS = 40, rowH = IS + 22;
      const imgs: Record<string, Awaited<ReturnType<typeof pdf.embedJpg>>> = {};
      for (const p of items) { try { if (RAMS_PPE_IMG[p.key]) imgs[p.key] = await pdf.embedJpg(RAMS_PPE_IMG[p.key]); } catch { /* falls back to the X box */ } }
      for (let i = 0; i < items.length; i += 3) {
        ensure(rowH + 4);
        items.slice(i, i + 3).forEach((p, j) => {
          const cx = M + j * cw + cw / 2, lw = reg.widthOfTextAtSize(pdfSafe(p.label), 9);
          if (imgs[p.key]) page.drawImage(imgs[p.key], { x: cx - IS / 2, y: y - IS - 2, width: IS, height: IS });
          else { rect(cx - 6, y - IS / 2 - 8, 12, 12, WHITE); txt('X', cx - 3, y - IS / 2 - 5.5, 9, bold, BRAND); }
          txt(p.label, cx - lw / 2, y - IS - 14, 9, reg);
        });
        y -= rowH;
      }
      y -= 6;
    }
  } else {
    if (d.emergencyName || d.emergencyPhone) { bar('Emergency Contact Details'); kvTable([['Name', d.emergencyName], ['Telephone Number', d.emergencyPhone]]); }
    const gen = b.sections.filter((s) => s.part !== 'method'), meth = b.sections.filter((s) => s.part === 'method');
    const out = (s: (typeof b.sections)[number]) => {
      ensure(40); txt(s.title || '', M, y - 12, 11, bold); y -= 18;
      if (s.body) para(s.body, 9);
      (s.steps || []).forEach((stp, i) => { const ls = wrap(stp, reg, 9, CW - 22); ensure(ls.length * 12 + 2); txt(`${i + 1}.`, M + 4, y - 9, 9, bold); ls.forEach((l, k) => txt(l, M + 20, y - 9 - k * 12, 9, reg)); y -= ls.length * 12 + 2; });
      y -= 10;
    };
    if (gen.length) { bar('General Precautions'); para('To be observed by all staff at all times; any deviation from these control procedures must be authorised by the site manager or safety representative.', 8.5); gen.forEach(out); }
    if (meth.length) { bar('Method Statements'); meth.forEach(out); }
  }
  // ---- sign-off sheet ----
  newPage();
  txt('Sign Off Sheet', M, y - 16, 16, bold); y -= 34;
  [`I have read and understood the contents of this ${L}.`, 'Anything I did not understand has been explained to me to my satisfaction.', `I agree to follow the ${L} and understand that any ${isRA ? 'control procedures' : 'instructions'} are provided for my safety and the safety of others.`]
    .forEach((s) => { wrap(s, reg, 9.5, CW).forEach((l) => { txt(l, (W - reg.widthOfTextAtSize(l, 9.5)) / 2, y - 10, 9.5, reg); y -= 13; }); y -= 3; });
  y -= 8;
  const cols: [string, number][] = [['Print Name', CW * 0.42], ['Signed', CW * 0.36], ['Date', CW * 0.22]];
  {
    const ih = 30, lw = CW * 0.16;
    rect(M, y - ih, lw, ih, LIGHT); txt('ISSUED BY:', M + 5, y - ih / 2 - 3, 9, bold);
    let x = M + lw;
    [CW * 0.42 - lw, CW * 0.36, CW * 0.22].forEach((w, i) => { rect(x, y - ih, w, ih); box('pm', ['name', 'sig', 'date'][i], x, w, ih); x += w; });
    y -= ih + 14;
  }
  let x = M; cols.forEach(([c, w]) => { rect(x, y - 16, w, 16, LIGHT); txt(c, x + 5, y - 11.5, 9, bold); x += w; }); y -= 16;
  const rowH = Math.min(34, Math.floor((y - 60) / SIGN_ROWS));
  for (let r = 0; r < SIGN_ROWS; r++) {
    x = M;
    cols.forEach(([, w], i) => { rect(x, y - rowH, w, rowH); box(`op${r + 1}`, ['name', 'sig', 'date'][i], x, w, rowH); x += w; });
    y -= rowH;
  }
  // ---- dynamic risk assessment ----
  if (isRA && d.includeDynamic !== false) {
    newPage();
    const T = 'Dynamic Risk Assessment';
    txt(T, (W - bold.widthOfTextAtSize(T, 15)) / 2, y - 15, 15, bold); y -= 28;
    para('Please note a copy of this Dynamic Risk Assessment must be returned to head office complete with signatures. Tick items covered by the risk assessment, then list in the table below hazards and controls for any additional items on this job.', 8.5);
    const dyn = ['Access / Egress', 'Adverse Weather', 'Asbestos', 'Biological', 'Excavations', 'Exposure to Gases', 'Movement of Vehicles', 'Chemicals', 'Confined Space', 'Dusts / Particles', 'Electrical', 'Other Contractors', 'Limited Headroom', 'Moving Machinery', 'Lone Working', 'Fire', 'Fumes', 'Lighting', 'Flooding', 'Noise', 'Scaffold', 'Work at Height', 'Slips, Trips or Falls', 'Extreme Temperatures', 'Demolition Works', 'Work Near Water', 'Vibration', 'Wastes', 'Uneven Surfaces', 'Ladders / Stepladders', 'Ventilation', 'Vermin / Weils Disease', 'Overhead Cables', 'Hidden Services', 'Manual Handling'];
    const cw = CW / 5;
    for (let i = 0; i < dyn.length; i += 5) { dyn.slice(i, i + 5).forEach((h, j) => { rect(M + j * cw, y - 20, cw, 20); rect(M + j * cw + 4, y - 15, 9, 9, WHITE); txt(h, M + j * cw + 17, y - 13, 7.5, reg); }); y -= 20; }
    y -= 14;
    txt('Additional task(s) or hazards not covered by the original risk assessment', M, y - 10, 9.5, bold); y -= 18;
    const dc: [string, number][] = [['Hazard identified', 0.2], ['Injury risk', 0.15], ['Control measure adopted', 0.25], ['L', 0.05], ['S', 0.05], ['LxS', 0.06], ['Proceed Y/N', 0.08], ['Supervisor', 0.08], ['Client', 0.08]];
    x = M; dc.forEach(([c, f]) => { rect(x, y - 24, CW * f, 24, LIGHT); wrap(c, bold, 7.5, CW * f - 6).forEach((l, k) => txt(l, x + 3, y - 9 - k * 9, 7.5, bold)); x += CW * f; }); y -= 24;
    for (let r = 0; r < 6; r++) { x = M; dc.forEach(([, f]) => { rect(x, y - 26, CW * f, 26); x += CW * f; }); y -= 26; }
    y -= 12;
    ([['15 - 25 = High Risk - STOP - advise your supervisor that the risk is high and seek further advice.', '#E0301E'], ['8 - 12 = Medium Risk - CAUTION - proceed but take extra precautions.', '#F39237'], ['1 - 6 = Low Risk - PROCEED with task maintaining controls.', '#9BD27A']] as [string, string][])
      .forEach(([t, c]) => { rect(M, y - 14, 14, 12, hexToRgb(c), false); txt(t, M + 20, y - 11, 8.5, reg); y -= 17; });
  }
  // ---- footers ----
  pages.forEach((pg, i) => { const f = pdfSafe(`Doc #: ${docNo} || Page ${i + 1} of ${pages.length}`); pg.drawText(f, { x: (W - reg.widthOfTextAtSize(f, 8)) / 2, y: 20, size: 8, font: reg, color: SLATE }); pg.drawText('Generated via OpHUB', { x: M, y: 20, size: 7, font: reg, color: SLATE }); });
  return { bytes: await pdf.save(), signLayout: { v: 2, boxes }, pageCount: pages.length };
}
