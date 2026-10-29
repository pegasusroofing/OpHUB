// CIS payment and deduction statement (905 openFinCisStatement): one A4 page for a subcontractor or
// operative payment — contractor and subcontractor details (UTRs), the tax month, gross, materials,
// the amount liable, the CIS deducted and the amount payable.
import { fdb, loadSettings } from '@/data/finance';
import { deliverPdf, hexToRgb, PDFDocument, rgb, safe, StandardFonts } from '@/lib/pdf';
import { fdate, money } from '@/lib/rules/finance';
import type { Organization, Profile } from '@/lib/types';

type Row = Record<string, any>;
/** The tax month a payment falls in ends on the 5th (after the 5th → the 5th of next month). */
export function cisTaxMonthEnd(day: string): string {
  const d = new Date(`${day}T12:00:00`), after = d.getDate() > 5;
  d.setDate(5); if (after) d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export async function cisStatement(me: Profile, org: Organization | null, p: Row): Promise<boolean> {
  const [st, rate] = await Promise.all([
    loadSettings(me.org_id),
    p.user_id ? fdb.from('fin_labour_rates').select('utr').eq('user_id', p.user_id).maybeSingle() : p.worker_id ? fdb.from('fin_labour_rates').select('utr').eq('id', p.worker_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const s = st as Row, r = ((rate as { data: unknown }).data as Row | null) || {};
  const pdf = await PDFDocument.create(); const page = pdf.addPage([595.28, 841.89]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const INK = rgb(0.07, 0.08, 0.09), SLATE = rgb(0.36, 0.39, 0.45), WHITE = rgb(1, 1, 1);
  const BRAND = org?.color_primary ? hexToRgb(org.color_primary) : rgb(0.78, 0.06, 0.18);
  page.drawRectangle({ x: 0, y: 841.89 - 70, width: 595.28, height: 70, color: BRAND });
  page.drawText(safe(org?.name || ''), { x: 44, y: 841.89 - 42, size: 16, font: bold, color: WHITE });
  page.drawText('Payment and deduction statement', { x: 44, y: 841.89 - 60, size: 10, font: reg, color: WHITE });
  let y = 720;
  const kv = (k: string, v: unknown, b = false) => { page.drawText(k, { x: 44, y, size: 10, font: reg, color: SLATE }); page.drawText(safe(String(v || '—')), { x: 300, y, size: b ? 12 : 10.5, font: b ? bold : reg, color: INK }); y -= b ? 22 : 18; };
  kv('Contractor', org?.name || ''); kv('Contractor UTR', s.contractor_utr); kv('Employer reference', s.employer_ref);
  y -= 8; kv('Subcontractor', p.name); kv('Subcontractor UTR', r.utr || p.utr); kv('Tax month ending', fdate(cisTaxMonthEnd(p.paid_on || p.period_end)));
  kv('Work period', `${fdate(p.period_start)} – ${fdate(p.period_end)}`); kv('Paid on', p.paid_on ? fdate(p.paid_on) : 'Not paid yet');
  y -= 8; page.drawLine({ start: { x: 44, y: y + 8 }, end: { x: 551, y: y + 8 }, thickness: 0.6, color: rgb(0.86, 0.88, 0.9) }); y -= 8;
  kv('Gross amount paid (excl. VAT)', money(p.gross)); kv('Less cost of materials', money(p.materials)); kv('Amount liable to deduction', money(p.labour));
  kv(`Amount deducted (${p.cis_rate}%)`, money(p.cis_deduction), true); kv('Amount payable', money(p.net_pay), true);
  y -= 10; page.drawText('Keep this statement: it shows the tax deducted under the Construction Industry Scheme.', { x: 44, y, size: 9, font: reg, color: SLATE });
  return deliverPdf(await pdf.save(), `CIS statement - ${String(p.name || '').replace(/[\\/:*?"<>|]+/g, '')} - ${p.period_start}.pdf`);
}
