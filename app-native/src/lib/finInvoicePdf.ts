// Sales invoice PDF (901 finBuildInvoicePdf): brand header, bill to and
// details, the lines (VAT per line when mixed), totals with reverse-charge
// wording, notes, payment details and company footer.
import { hexToRgb, PDFDocument, rgb, safe, StandardFonts, storageImage, type PDFFont, type PDFPage } from '@/lib/pdf';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { fdate, money } from '@/lib/rules/finance';
import { INV_VAT, invTotals, lineVat, type InvLine } from '@/lib/rules/finInvoice';

type Row = Record<string, any>;
export async function buildInvoicePdf(inv: Row, site: Row | undefined, st: Row, org: { name?: string | null; color_primary?: string | null; logo_path?: string | null } | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 44;
  const INK = rgb(0.07, 0.08, 0.09), SLATE = rgb(0.36, 0.39, 0.45), LINE = rgb(0.86, 0.88, 0.9), WHITE = rgb(1, 1, 1);
  const BRAND = org?.color_primary ? hexToRgb(org.color_primary) : rgb(0.78, 0.06, 0.18);
  let page: PDFPage = pdf.addPage([W, H]);
  const logo = await storageImage(pdf, 'org-logos', org?.logo_path);
  const txt = (s: unknown, x: number, y: number, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {}) => page.drawText(safe(String(s ?? '')), { x, y, size: o.size || 10, font: o.font || reg, color: o.color || INK });
  const right = (s: unknown, xr: number, y: number, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {}) => { const f = o.font || reg, sz = o.size || 10; txt(s, xr - f.widthOfTextAtSize(safe(String(s ?? '')), sz), y, o); };
  const wrap = (t: unknown, f: PDFFont, size: number, w: number) => { const out: string[] = []; safe(String(t ?? '')).split('\n').forEach((p) => { let line = ''; p.split(/\s+/).filter(Boolean).forEach((word) => { const test = line ? `${line} ${word}` : word; if (f.widthOfTextAtSize(test, size) > w && line) { out.push(line); line = word; } else line = test; }); out.push(line); }); return out; };
  page.drawRectangle({ x: 0, y: H - 96, width: W, height: 96, color: BRAND });
  let hx = M;
  if (logo) { const d = logo.scale(1), s = 52 / Math.max(d.width, d.height); page.drawRectangle({ x: M, y: H - 76, width: 56, height: 56, color: WHITE }); page.drawImage(logo, { x: M + 2 + (52 - d.width * s) / 2, y: H - 74 + (52 - d.height * s) / 2, width: d.width * s, height: d.height * s }); hx = M + 70; }
  txt(org?.name || '', hx, H - 48, { font: bold, size: 16, color: WHITE });
  if (st.company_vat_no) txt(`VAT No. ${st.company_vat_no}`, hx, H - 64, { size: 9, color: WHITE });
  right(inv.status === 'void' ? 'VOID' : 'INVOICE', W - M, H - 54, { font: bold, size: 24, color: WHITE });
  let y = H - 130;
  txt('BILL TO', M, y, { font: bold, size: 8.5, color: SLATE });
  let by = y - 15;
  txt(inv.bill_name || '', M, by, { font: bold, size: 11 }); by -= 14;
  wrap(inv.bill_address || '', reg, 10, 230).forEach((l) => { txt(l, M, by); by -= 13; });
  let dy = y;
  [['Invoice no.', inv.number || 'Draft'], ['Invoice date', fdate(inv.issue_date)], ['Due date', fdate(inv.due_date)], ['Project no.', site?.job_number || '—'], ['Your PO', inv.client_po || '—'], ['Site', site?.name || '']].forEach(([k, v]) => {
    txt(k, 330, dy, { size: 9, color: SLATE }); const ls = wrap(v, bold, 10, W - M - 420); ls.forEach((l, i) => txt(l, 420, dy - i * 12, { font: bold, size: 10 })); dy -= 15 + (ls.length - 1) * 12;
  });
  if (site?.address) wrap(fullSiteAddress(site as never) || site.address, reg, 9, W - M - 420).slice(0, 3).forEach((l) => { txt(l, 420, dy + 3, { size: 9, color: SLATE }); dy -= 11; });
  y = Math.min(by, dy) - 22;
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 22, color: rgb(0.95, 0.96, 0.97) });
  txt('DESCRIPTION', M + 8, y + 1, { font: bold, size: 8.5, color: SLATE }); right('AMOUNT (£)', W - M - 8, y + 1, { font: bold, size: 8.5, color: SLATE });
  y -= 26;
  const t = invTotals(inv.lines, inv.vat_treatment, inv.vat_rate);
  for (const l of (inv.lines || []) as InvLine[]) {
    const ls = wrap(l.description || '', reg, 10, W - 2 * M - (t.mixed ? 240 : 130));
    if (y - ls.length * 13 < 170) { page = pdf.addPage([W, H]); y = H - M; }
    ls.forEach((ln, i) => txt(ln, M + 8, y - i * 13));
    if (t.mixed) right(`VAT ${INV_VAT[lineVat(l, inv.vat_treatment, inv.vat_rate)].l}`, W - M - 110, y, { size: 8.5, color: SLATE });
    right(Number(l.amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), W - M - 8, y);
    const last = y - (ls.length - 1) * 13;
    page.drawLine({ start: { x: M, y: last - 7 }, end: { x: W - M, y: last - 7 }, thickness: 0.6, color: LINE });
    y = last - 22;
  }
  y -= 8;
  if (y < 240) { page = pdf.addPage([W, H]); y = H - M; }
  const tot = (k: string, v: string, big?: boolean) => { txt(k, W - M - 210, y, { font: big ? bold : reg, size: big ? 12 : 10, color: big ? INK : SLATE }); right(v, W - M - 8, y, { font: bold, size: big ? 12 : 10 }); y -= big ? 20 : 16; };
  tot('Net', money(inv.net));
  const vks = Object.keys(t.by), chg = vks.filter((k) => !INV_VAT[k].rc && INV_VAT[k].r > 0);
  if (chg.length) chg.forEach((k) => tot(`VAT @ ${INV_VAT[k].l}${t.mixed ? ` on ${money(t.by[k].net)}` : ''}`, money(t.by[k].vat)));
  else tot(t.vatDue ? 'VAT (reverse charge)' : 'VAT (zero rated)', money(inv.vat));
  page.drawLine({ start: { x: W - M - 210, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 1, color: INK });
  y -= 4; tot('Total due', money(inv.total), true);
  if (t.vatDue) {
    y -= 4;
    const rcNet = vks.filter((k) => INV_VAT[k].rc).reduce((a, k) => a + t.by[k].net, 0);
    tot('Reverse charge VAT', money(t.vatDue));
    wrap(`Reverse charge: customer to account to HMRC for the VAT. VAT on ${money(rcNet)} of this invoice: ${money(t.vatDue)}. (Domestic reverse charge for building and construction services.)`, reg, 9, W - 2 * M).forEach((l) => { txt(l, M, y, { size: 9, color: SLATE }); y -= 12; });
  }
  if (inv.notes) { y -= 6; wrap(inv.notes, reg, 10, W - 2 * M).forEach((l) => { txt(l, M, y); y -= 13; }); }
  const fy = 120;
  page.drawLine({ start: { x: M, y: fy + 18 }, end: { x: W - M, y: fy + 18 }, thickness: 0.6, color: LINE });
  txt('PAYMENT DETAILS', M, fy, { font: bold, size: 8.5, color: SLATE });
  let py = fy - 14;
  [st.bank_account_name ? `Account name: ${st.bank_account_name}` : '', st.bank_name ? `Bank: ${st.bank_name}` : '', st.bank_sort_code ? `Sort code: ${st.bank_sort_code}` : '', st.bank_account_no ? `Account no.: ${st.bank_account_no}` : '', `Reference: ${inv.number || ''}`].filter(Boolean).forEach((p) => { txt(p, M, py, { size: 9.5 }); py -= 12; });
  let cy = fy - 14;
  [st.company_address || '', st.company_reg_no ? `Company no. ${st.company_reg_no}` : '', st.company_vat_no ? `VAT no. ${st.company_vat_no}` : ''].filter(Boolean).forEach((s) => wrap(s, reg, 9, 220).forEach((l) => { txt(l, 330, cy, { size: 9, color: SLATE }); cy -= 11; }));
  if (st.invoice_footer) wrap(st.invoice_footer, reg, 8.5, W - 2 * M).slice(0, 3).forEach((l, i) => txt(l, M, 40 - i * 10, { size: 8.5, color: SLATE }));
  const pages = pdf.getPages();
  pages.forEach((p, i) => { if (pages.length > 1) p.drawText(`${i + 1} of ${pages.length}`, { x: W - M - 30, y: 24, size: 8, font: reg, color: SLATE }); });
  pdf.setTitle(`Invoice ${inv.number || ''}`);
  return pdf.save();
}
