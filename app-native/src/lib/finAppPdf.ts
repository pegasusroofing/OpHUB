// Application for payment PDF (9219p finAppPdfBytes), landscape: a summary page (details, the General
// Summary by section, discount, retention, previously certified, VAT, net due — applied and certified
// side by side), then each section's lines with Prev / Applied / Certified.
import { hexToRgb, PDFDocument, rgb, safe, StandardFonts, type PDFFont, type PDFPage } from '@/lib/pdf';
import { isItem, pct } from '@/lib/rules/finApp';
import { appSummary, vatLabel, type AppDoc } from '@/lib/rules/finAppExcel';
import { money, round2 } from '@/lib/rules/finance';

type Row = Record<string, any>;
const STATUS: Record<string, string> = { draft: 'Draft', submitted: 'Applied', certified: 'Certified', invoiced: 'Invoiced', void: 'Void' };

export async function buildAppPdf(a: Row, D: AppDoc, info: { company: string; brand?: string | null; client: string; project: string; jobNo: string; valDate: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const F = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 842, Hh = 595, M = 30;
  const brand = info.brand ? hexToRgb(info.brand) : rgb(0.78, 0.06, 0.18);
  const grey = rgb(0.36, 0.39, 0.45), line = rgb(0.82, 0.84, 0.87), headBg = rgb(0.96, 0.96, 0.86), secBg = rgb(1, 1, 0.8), subBg = rgb(0.9, 0.95, 1), ink = rgb(0, 0, 0);
  let page: PDFPage, y = 0;
  const txt = (s: unknown, x: number, yy: number, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {}) => page.drawText(safe(String(s ?? '')), { x, y: yy, size: o.size || 8.5, font: o.font || F, color: o.color || ink });
  const fit = (s: unknown, w: number, size = 8.5, font = F) => { let t = safe(String(s ?? '')); if (font.widthOfTextAtSize(t, size) <= w) return t; while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > w) t = t.slice(0, -1); return `${t}...`; };
  const wrap = (s: unknown, w: number, size: number) => { const out: string[] = []; let cur = ''; safe(String(s ?? '')).split(/\s+/).forEach((wd) => { const t = cur ? `${cur} ${wd}` : wd; if (F.widthOfTextAtSize(t, size) <= w) cur = t; else { if (cur) out.push(cur); cur = wd; } }); if (cur) out.push(cur); return out.slice(0, 3); };
  const right = (s: unknown, xr: number, yy: number, o: { font?: PDFFont; size?: number } = {}) => { const f = o.font || F, sz = o.size || 8.5, t = safe(String(s ?? '')); txt(t, xr - f.widthOfTextAtSize(t, sz), yy, o); };
  const m = (v: unknown) => money(v), p = (v: unknown) => `${Math.round(Number(v || 0) * 100) / 100}%`;
  const newPage = () => { page = doc.addPage([W, Hh]); y = Hh - M; txt(`${info.company}  ·  Application for payment No. ${a.number}  ·  ${info.project}`, M, M - 16, { size: 7.5, color: grey }); };

  // Page 1 — summary
  newPage();
  page!.drawText(safe(info.company), { x: M, y: y - 14, size: 16, font: B, color: brand }); y -= 34;
  page!.drawText(`Application for Payment No. ${a.number}`, { x: M, y, size: 13, font: B }); y -= 22;
  [['Client Name', info.client], ['Project Name', info.project], ['Project ID', info.jobNo], ['Valuation Date', info.valDate], ['Client PO', a.client_po || ''], ['Status', STATUS[a.status] || a.status]].forEach(([k, v]) => { txt(k, M, y, { font: B, color: grey }); txt(fit(v, 400), M + 120, y); y -= 13; });
  y -= 12;
  page!.drawText('General Summary', { x: M, y, size: 11.5, font: B }); y -= 8;
  const cols = [M, M + 260, M + 380, M + 500, M + 570, M + 690, W - M];
  const row = (cells: (string | null)[], o: { bold?: boolean; bg?: ReturnType<typeof rgb> } = {}) => {
    const h = 16; if (o.bg) page.drawRectangle({ x: M, y: y - h + 4, width: W - 2 * M, height: h, color: o.bg });
    page.drawLine({ start: { x: M, y: y - h + 4 }, end: { x: W - M, y: y - h + 4 }, thickness: 0.5, color: line });
    cells.forEach((c, i) => { if (c == null || c === '') return; const f = o.bold ? B : F; if (i === 0) txt(fit(c, cols[1] - cols[0] - 6, 8.5, f), cols[0] + 4, y - 8, { font: f }); else right(c, cols[i + 1] - 6, y - 8, { font: f }); });
    y -= h;
  };
  row(['Section', 'Total', 'Applied Total', 'Applied %', 'Certified Total', 'Certified %'], { bold: true, bg: headBg });
  const S = appSummary(a, D), A = S.applied, C = S.certified;
  S.secs.forEach((s) => row([s.title, m(s.t), m(s.ap), p(s.t ? (s.ap / s.t) * 100 : 0), m(s.ce), p(s.t ? (s.ce / s.t) * 100 : 0)], { bg: secBg }));
  y -= 6;
  row(['SubTotal', m(S.t), m(A.gross), p(S.t ? (A.gross / S.t) * 100 : 0), m(C.gross), p(S.t ? (C.gross / S.t) * 100 : 0)], { bold: true });
  row([`Less Discount at ${D.discPct}%`, '', m(A.disc), '', m(C.disc), '']);
  row([`Retention at ${D.retPct}%`, '', m(A.ret), '', m(C.ret), '']);
  row(['Net After Retention', '', m(A.net), '', m(C.net), '']);
  row(['Previously Certified (excl VAT)', '', m(D.previous), '', m(D.previous), '']);
  row(['Gross Payment Due', '', m(A.due), '', m(C.due), ''], { bold: true });
  row([vatLabel(D.vt), '', m(A.vat), '', m(C.vat), '']);
  row(['Net Payment Due', '', m(A.total), '', m(C.total), ''], { bold: true, bg: headBg });

  // Section pages
  const X = { ref: M, desc: M + 34, qty: M + 300, unit: M + 340, rate: M + 378, amt: M + 440, prevp: M + 505, appp: M + 548, app: M + 612, certp: M + 656, cert: W - M };
  const headRow = () => {
    const h = 18; page.drawRectangle({ x: M, y: y - h + 4, width: W - 2 * M, height: h, color: headBg });
    ([['Ref', X.ref, 'l'], ['Description', X.desc, 'l'], ['Qty', X.unit - 6, 'r'], ['Unit', X.unit, 'l'], ['Rate', X.amt - 6, 'r'], ['Amount', X.prevp - 6, 'r'], ['Prev %', X.appp - 6, 'r'], ['Applied %', X.app - 6, 'r'], ['Applied', X.certp - 6, 'r'], ['Cert %', X.certp + 40, 'r'], ['Certified', X.cert - 4, 'r']] as [string, number, string][])
      .forEach(([t, x, al]) => (al === 'l' ? txt(t, x + 2, y - 9, { font: B, size: 8 }) : right(t, x, y - 9, { font: B, size: 8 })));
    y -= h;
  };
  let curTitle = '';
  const ensure = (need: number, title?: string) => { if (y - need < M + 10) { newPage(); if (title) { page.drawText(safe(`${title} (continued)`), { x: M, y: y - 12, size: 11, font: B }); y -= 22; headRow(); } } };
  const itemRow = (ref: unknown, desc: unknown, qty: number | null, unit: unknown, rate: number | null, amount: number, prevP: number, appP: number, certP: number) => {
    const ls = wrap(desc, X.qty - X.desc - 8, 8.5), h = Math.max(15, 11 * ls.length + 4);
    ensure(h, curTitle);
    page.drawLine({ start: { x: M, y: y - h + 4 }, end: { x: W - M, y: y - h + 4 }, thickness: 0.4, color: line });
    txt(fit(ref, 30), X.ref + 2, y - 9); ls.forEach((l, i) => txt(l, X.desc + 2, y - 9 - i * 11));
    if (qty != null) right(String(qty), X.unit - 6, y - 9); txt(fit(unit || '', 34), X.unit + 2, y - 9); if (rate != null) right(m(rate), X.amt - 6, y - 9);
    right(m(amount), X.prevp - 6, y - 9); right(p(prevP), X.appp - 6, y - 9); right(p(appP), X.app - 6, y - 9); right(m(round2((amount * appP) / 100)), X.certp - 6, y - 9);
    right(p(certP), X.certp + 40, y - 9); right(m(round2((amount * certP) / 100)), X.cert - 4, y - 9);
    y -= h;
  };
  const sectionStart = (title: string) => { curTitle = title; ensure(60); y -= 8; page.drawRectangle({ x: M, y: y - 14, width: W - 2 * M, height: 18, color: secBg }); page.drawText(fit(title, 600, 11, B), { x: M + 4, y: y - 9, size: 11, font: B }); y -= 22; headRow(); };
  newPage();
  D.sections.forEach((sec) => {
    sectionStart(sec.title);
    sec.rows.forEach((l) => {
      if (l.kind === 'subsection') { ensure(16, curTitle); page.drawRectangle({ x: M, y: y - 11, width: W - 2 * M, height: 15, color: subBg }); txt(fit(`${l.ref ? `${l.ref} ` : ''}${l.description || ''}`, 600, 8.5, B), X.desc + 2, y - 8, { font: B }); y -= 16; return; }
      if (!isItem(l)) return;
      const ap = pct(l.pct), cp = D.certPct[l.item_id] != null ? D.certPct[l.item_id] : ap, hasQ = l.qty != null && l.rate != null;
      itemRow(l.ref || '', l.description, hasQ ? Number(l.qty) : null, l.unit, hasQ ? Number(l.rate) : null, Number(l.value || 0), D.prevPct[l.item_id] || 0, ap, cp);
    });
  });
  if (D.vars.length) { sectionStart('Variations'); D.vars.forEach((x) => itemRow('', x.v.description || 'Variation', 1, 'item', Number(x.v.value || 0), Number(x.v.value || 0), x.prev, pct(x.v.pct), pct(x.v.pct))); }
  if ((a.dayworks || []).length) { sectionStart('Dayworks'); a.dayworks.forEach((d: Row) => itemRow('', d.description || 'Daywork', null, '', null, Number(d.value || 0), 0, 100, 100)); }
  return doc.save();
}
