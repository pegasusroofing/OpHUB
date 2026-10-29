// Purchase order PDF (909 finBuildPoPdf): brand header, supplier and deliver-to,
// PO details, the items with qty / unit / rate / amount, totals, notes, the
// "quote this PO" line and the company footer.
import { hexToRgb, PDFDocument, rgb, safe, StandardFonts, storageImage, wrap, type PDFFont, type PDFPage } from '@/lib/pdf';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { fdate, money } from '@/lib/rules/finance';

type Row = Record<string, any>;
export async function buildPoPdf(po: Row, site: Row | undefined, st: Row, supplier: Row | null, org: { name?: string | null; color_primary?: string | null; logo_path?: string | null } | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 44;
  const INK = rgb(0.07, 0.08, 0.09), SLATE = rgb(0.36, 0.39, 0.45), LINE = rgb(0.86, 0.88, 0.9), WHITE = rgb(1, 1, 1);
  const BRAND = org?.color_primary ? hexToRgb(org.color_primary) : rgb(0.78, 0.06, 0.18);
  let page: PDFPage = pdf.addPage([W, H]);
  const logo = await storageImage(pdf, 'org-logos', org?.logo_path);
  type O = { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> };
  const txt = (s: unknown, x: number, y: number, o: O = {}) => page.drawText(safe(String(s ?? '')), { x, y, size: o.size || 10, font: o.font || reg, color: o.color || INK });
  const right = (s: unknown, xr: number, y: number, o: O = {}) => { const f = o.font || reg, sz = o.size || 10; txt(s, xr - f.widthOfTextAtSize(safe(String(s ?? '')), sz), y, o); };
  const n2 = (v: unknown) => Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  page.drawRectangle({ x: 0, y: H - 96, width: W, height: 96, color: BRAND });
  let hx = M;
  if (logo) { const d = logo.scale(1), s = 52 / Math.max(d.width, d.height); page.drawRectangle({ x: M, y: H - 76, width: 56, height: 56, color: WHITE }); page.drawImage(logo, { x: M + 2 + (52 - d.width * s) / 2, y: H - 74 + (52 - d.height * s) / 2, width: d.width * s, height: d.height * s }); hx = M + 68; }
  txt(org?.name || '', hx, H - 48, { font: bold, size: 16, color: WHITE });
  right(po.status === 'cancelled' ? 'CANCELLED' : 'PURCHASE ORDER', W - M, H - 54, { font: bold, size: 20, color: WHITE });
  let y = H - 130;
  txt('SUPPLIER', M, y, { font: bold, size: 8.5, color: SLATE });
  let by = y - 15;
  txt(po.supplier_name || '', M, by, { font: bold, size: 11 }); by -= 14;
  if (po.supplier_branch) { txt(po.supplier_branch, M, by, { size: 9.5, color: SLATE }); by -= 13; }
  if (supplier?.email) { txt(supplier.email, M, by, { size: 9.5, color: SLATE }); by -= 13; }
  by -= 8;
  txt(po.fulfilment === 'collection' ? 'COLLECTION' : 'DELIVER TO', M, by, { font: bold, size: 8.5, color: SLATE }); by -= 15;
  if (po.fulfilment !== 'collection') {
    txt(site?.name || '', M, by, { font: bold, size: 10.5 }); by -= 13;
    wrap(safe(site ? fullSiteAddress(site as never) || [site.address, site.postcode].filter(Boolean).join(', ') : ''), reg, 10, 240).slice(0, 4).forEach((l) => { txt(l, M, by); by -= 13; });
  } else { txt('Supplier’s branch — we will collect', M, by); by -= 13; }
  let dy = y;
  [['PO number', po.number], ['Date', fdate(String(po.created_at || '').slice(0, 10))], ['Project no.', site?.job_number || '—'], ['Required by', po.required_by ? fdate(po.required_by) : 'Please advise'], ['Ordered by', po.ordered_by_name || '']].forEach(([k, v]) => { txt(k, 330, dy, { size: 9, color: SLATE }); txt(v, 420, dy, { font: bold, size: 10 }); dy -= 15; });
  y = Math.min(by, dy) - 20;
  const cols = { d: M + 8, q: W - M - 230, u: W - M - 180, r: W - M - 90, a: W - M - 8 };
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 22, color: rgb(0.95, 0.96, 0.97) });
  const hd = { font: bold, size: 8.5, color: SLATE };
  txt('DESCRIPTION', cols.d, y + 1, hd); right('QTY', cols.q, y + 1, hd); txt('UNIT', cols.u, y + 1, hd); right('RATE £', cols.r, y + 1, hd); right('AMOUNT £', cols.a, y + 1, hd);
  y -= 26;
  for (const it of (po.items || []) as Row[]) {
    const w = wrap(safe(String(it.item || it.description || '')), reg, 10, cols.q - cols.d - 50), lines = w.length ? w : [''];
    if (y - lines.length * 13 < 150) { page = pdf.addPage([W, H]); y = H - M; }
    lines.forEach((ln, i) => txt(ln, cols.d, y - i * 13));
    right(it.qty != null ? String(it.qty) : '', cols.q, y); txt(it.unit || '', cols.u, y);
    if (it.rate != null) right(n2(it.rate), cols.r, y);
    if (it.amount != null) right(n2(it.amount), cols.a, y);
    const last = y - (lines.length - 1) * 13;
    page.drawLine({ start: { x: M, y: last - 7 }, end: { x: W - M, y: last - 7 }, thickness: 0.6, color: LINE });
    y = last - 22;
  }
  y -= 6;
  if (po.value != null) {
    if (po.vat != null) {
      txt('Subtotal', W - M - 210, y); right(money(po.value), W - M - 8, y); y -= 15;
      txt('VAT', W - M - 210, y); right(money(po.vat), W - M - 8, y); y -= 15;
      txt('Order total', W - M - 210, y, { font: bold, size: 11 }); right(money(po.total != null ? po.total : Number(po.value) + Number(po.vat)), W - M - 8, y, { font: bold, size: 11 }); y -= 22;
    } else { txt('Order total (excl. VAT)', W - M - 210, y, { font: bold, size: 11 }); right(money(po.value), W - M - 8, y, { font: bold, size: 11 }); y -= 22; }
  }
  if (po.note) { txt('NOTES', M, y, { font: bold, size: 8.5, color: SLATE }); y -= 14; wrap(safe(po.note), reg, 10, W - 2 * M).forEach((l) => { txt(l, M, y); y -= 13; }); y -= 6; }
  wrap(`Please quote PO ${po.number} on your delivery note and invoice. Invoices without a PO number, or over the value of this order, may be held.`, reg, 9.5, W - 2 * M).forEach((l) => { txt(l, M, y, { size: 9.5, color: SLATE }); y -= 12; });
  page.drawLine({ start: { x: M, y: 108 }, end: { x: W - M, y: 108 }, thickness: 0.6, color: LINE });
  let cy = 90;
  [st.company_address || '', st.company_reg_no ? `Company no. ${st.company_reg_no}` : '', st.company_vat_no ? `VAT no. ${st.company_vat_no}` : ''].filter(Boolean).forEach((s) => wrap(safe(s), reg, 9, W - 2 * M).forEach((l) => { txt(l, M, cy, { size: 9, color: SLATE }); cy -= 11; }));
  pdf.setTitle(`Purchase order ${po.number}`);
  return pdf.save();
}
