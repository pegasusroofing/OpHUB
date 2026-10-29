// Payment / pay less notice for a subcontractor application (912 openFinSubNotice):
// applied, certified, retention, contras, previously certified, sum due, CIS and
// the amount to pay, with the reasons and the Construction Act wording.
import { hexToRgb, PDFDocument, rgb, safe, StandardFonts, wrap } from '@/lib/pdf';
import { fdate, money } from '@/lib/rules/finance';

type Row = Record<string, any>;
export async function buildSubNoticePdf(a: Row, sc: Row, site: Row | undefined, st: Row, org: { name?: string | null; color_primary?: string | null } | null, issuedBy: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); const page = pdf.addPage([595.28, 841.89]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const INK = rgb(0.07, 0.08, 0.09), SLATE = rgb(0.36, 0.39, 0.45), LINE = rgb(0.86, 0.88, 0.9), WHITE = rgb(1, 1, 1);
  const BRAND = org?.color_primary ? hexToRgb(org.color_primary) : rgb(0.78, 0.06, 0.18);
  page.drawRectangle({ x: 0, y: 841.89 - 80, width: 595.28, height: 80, color: BRAND });
  page.drawText(safe(org?.name || ''), { x: 44, y: 841.89 - 44, size: 16, font: bold, color: WHITE });
  page.drawText(a.payless ? 'PAY LESS NOTICE' : 'PAYMENT NOTICE', { x: 44, y: 841.89 - 64, size: 11, font: bold, color: WHITE });
  let y = 720;
  const kv = (k: string, v: unknown, b = false) => { page.drawText(safe(k), { x: 44, y, size: 10, font: reg, color: SLATE }); const t = safe(String(v == null || v === '' ? '—' : v)), f = b ? bold : reg, sz = b ? 12 : 10.5; page.drawText(t, { x: 551 - f.widthOfTextAtSize(t, sz), y, size: sz, font: f, color: INK }); y -= b ? 22 : 18; };
  kv('To', sc.name); kv('Subcontractor PO', `${sc.number}${sc.description ? ` — ${String(sc.description).slice(0, 60)}` : ''}`); kv('Project', `${site?.job_number ? `${site.job_number} · ` : ''}${site?.name || ''}`);
  kv('Your application', `No. ${a.number} dated ${fdate(a.app_date)}`); kv('Final date for payment', fdate(a.final_date)); kv('Date of this notice', fdate(a.notice_on || new Date().toISOString().slice(0, 10)));
  y -= 6; page.drawLine({ start: { x: 44, y: y + 8 }, end: { x: 551, y: y + 8 }, thickness: 0.6, color: LINE }); y -= 8;
  kv('Amount applied for (gross to date)', money(a.applied_gross)); kv('Amount certified (gross to date)', money(a.certified_gross));
  kv(`Less retention @ ${sc.retention_pct ?? 0}%`, `-${money(a.retention)}`); kv('Less contra charges to date', `-${money(a.contra)}`); kv('Less previously certified', `-${money(a.previous)}`);
  kv('Sum we consider due', money(a.net_due), true);
  kv(`Less CIS deduction @ ${sc.cis_rate ?? 20}%`, `-${money(a.cis_deduction)}`); kv('Amount to be paid (excl. VAT)', money(a.pay_amount), true);
  if (sc.vat_registered) { page.drawText('VAT: domestic reverse charge — customer to account for VAT to HMRC.', { x: 44, y, size: 9, font: reg, color: SLATE }); y -= 16; }
  const reason = a.payless_reason || a.contra_note;
  if (reason) { y -= 6; page.drawText(a.payless ? 'Basis on which the sum has been calculated / reasons for paying less:' : 'Notes:', { x: 44, y, size: 10, font: bold, color: INK }); y -= 15; wrap(safe(reason), reg, 10, 507).forEach((l) => { page.drawText(l, { x: 44, y, size: 10, font: reg, color: INK }); y -= 13; }); }
  y -= 14;
  wrap(a.payless ? 'This is a pay less notice under the Housing Grants, Construction and Regeneration Act 1996 (as amended), given before the final date for payment.' : 'This is a payment notice under the Housing Grants, Construction and Regeneration Act 1996 (as amended).', reg, 9, 507).forEach((l) => { page.drawText(l, { x: 44, y, size: 9, font: reg, color: SLATE }); y -= 12; });
  y -= 6; page.drawText(safe(`Issued by ${issuedBy} for ${org?.name || ''}`), { x: 44, y, size: 9.5, font: reg, color: INK });
  if (st.company_address) page.drawText(safe(String(st.company_address).replace(/\s*\n\s*/g, ', ').slice(0, 110)), { x: 44, y: 40, size: 8.5, font: reg, color: SLATE });
  return pdf.save();
}
