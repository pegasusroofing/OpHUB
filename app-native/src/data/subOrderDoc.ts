// The subcontract order as a document, with its variations as numbered VOs (Andy, 21 Nov 2026: "The variations can be
// added to the subcontract order no new order needs to be raised but clearly a vo on the po. Once the po is approved it
// should give the option to resend the po"). The order value already includes approved variations (sub_variation_decide
// adds them), so the original value is the order value less them. Sending emails it to the subcontractor; while Finance is
// on trial nothing is emailed from Finance, so it's downloaded instead to send yourself.
import { useQuery } from '@tanstack/react-query';

import { fdb } from '@/data/finance';
import { deliverPdf, emailPdf, exportFilename, INK, PDFDocument, rgb, SLATE, StandardFonts, wrap } from '@/lib/pdf';
import { finBlocked, money } from '@/lib/rules/finance';
import type { Organization, Profile } from '@/lib/types';

export type Vo = { no: number; id: string; title: string; description: string | null; value: number; date: string | null };
/** The order's approved variations, numbered VO1, VO2… in the order they were approved. */
export function useOrderVos(subcontractId: string | undefined) {
  return useQuery({
    queryKey: ['orderVos', subcontractId], enabled: !!subcontractId,
    queryFn: async () => loadVos(subcontractId as string),
  });
}
async function loadVos(subcontractId: string): Promise<Vo[]> {
  const r = ((await fdb.from('fin_sub_variations').select('id,title,description,value,added_to_order,decided_at').eq('subcontract_id', subcontractId).eq('status', 'approved').order('decided_at')).data as { id: string; title: string; description: string | null; value: number; added_to_order: number | null; decided_at: string | null }[] | null) ?? [];
  return r.map((v, i) => ({ no: i + 1, id: v.id, title: v.title, description: v.description, value: Number(v.added_to_order ?? v.value), date: v.decided_at }));
}

type Order = { id: string; site_id: string; number: string | null; name: string | null; email: string | null; description: string | null; order_value: number | null; retention_pct: number | null; cis_rate: number | null; created_at: string };
/** The order as a PDF: the work, the original value, each VO, the revised value, retention and CIS. */
export async function buildSubOrderPdf(org: Organization | null, sc: Order, job: { name: string; address: string }, vos: Vo[], by: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595.28, 841.89]); let y = 790;
  const line = (text: string, o: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb>; x?: number; right?: string } = {}) => {
    if (y < 70) { page = doc.addPage([595.28, 841.89]); y = 790; }
    const size = o.size ?? 10.5;
    page.drawText(text, { x: o.x ?? 50, y, size, font: o.f ?? font, color: o.color ?? INK });
    if (o.right) page.drawText(o.right, { x: 545 - (o.f ?? font).widthOfTextAtSize(o.right, size), y, size, font: o.f ?? font, color: o.color ?? INK });
    y -= size + 6;
  };
  const rule = () => { page.drawLine({ start: { x: 50, y: y + 4 }, end: { x: 545, y: y + 4 }, thickness: 0.6, color: rgb(0.85, 0.86, 0.88) }); y -= 6; };
  const total = Number(sc.order_value || 0), voTotal = vos.reduce((t, v) => t + v.value, 0), original = total - voTotal;
  line(org?.name || 'Subcontract Order', { size: 16, f: bold });
  line(`Subcontract Order ${sc.number || ''}${vos.length ? ` · Revision ${vos.length} (VO${vos.length})` : ''}`, { size: 13, f: bold });
  line(`Issued ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}${by ? ` by ${by}` : ''}`, { color: SLATE });
  y -= 6; rule();
  line('To', { f: bold, size: 9.5, color: SLATE }); line(sc.name || 'Subcontractor', { f: bold }); if (sc.email) line(sc.email);
  y -= 4;
  line('Project', { f: bold, size: 9.5, color: SLATE }); line(job.name, { f: bold }); if (job.address) wrap(job.address, font, 10.5, 495).forEach((l) => line(l));
  y -= 4;
  if (sc.description) { line('Work', { f: bold, size: 9.5, color: SLATE }); wrap(sc.description, font, 10.5, 495).forEach((l) => line(l)); y -= 4; }
  rule();
  line('Original Order Value', { f: bold, right: money(original) });
  if (vos.length) {
    y -= 2;
    line('Variations (VOs) Added To This Order', { f: bold, size: 9.5, color: SLATE });
    vos.forEach((v) => {
      line(`VO${v.no}  ${v.title}`, { right: money(v.value) });
      if (v.description) wrap(v.description, font, 9.5, 430).forEach((l) => line(l, { size: 9.5, color: SLATE, x: 80 }));
      if (v.date) line(`Approved ${new Date(v.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`, { size: 9, color: SLATE, x: 80 });
    });
    line('Total Of Variations', { right: money(voTotal) });
  }
  rule();
  line(vos.length ? 'Revised Order Value' : 'Order Value', { f: bold, size: 12.5, right: money(total) });
  y -= 6;
  line(`Retention: ${sc.retention_pct ?? 0}%  ·  CIS: ${sc.cis_rate ?? 20}% on labour  ·  Values exclude VAT.`, { size: 9.5, color: SLATE });
  line('This order replaces any earlier issue of it. Please quote the order number on every application.', { size: 9.5, color: SLATE });
  const filename = exportFilename(job.name, `Subcontract Order ${sc.number || ''}${vos.length ? ` Rev ${vos.length}` : ''} - ${sc.name || ''}`.trim(), 'pdf');
  return { bytes: await doc.save(), filename };
}

/** Sends (or, while Finance is on trial or there's no email, downloads) the order with its VOs. A message to show. */
export async function sendSubOrder(me: Profile, org: Organization | null, subcontractId: string, emailIt = true): Promise<string> {
  const sc = (await fdb.from('fin_subcontracts').select('id,site_id,number,name,email,description,order_value,retention_pct,cis_rate,created_at').eq('id', subcontractId).maybeSingle()).data as Order | null;
  if (!sc) return 'Could not find the order.';
  const site = (await fdb.from('sites').select('name,address,postcode,job_number').eq('id', sc.site_id).maybeSingle()).data as { name: string; address: string | null; postcode: string | null; job_number: string | null } | null;
  const vos = await loadVos(subcontractId);
  const pdf = await buildSubOrderPdf(org, sc, { name: [site?.job_number, site?.name].filter(Boolean).join(' ') || 'Project', address: [site?.address, site?.postcode].filter(Boolean).join(', ') }, vos, me.name || '');
  const blocked = finBlocked('send-finance-email', undefined, me.org_id);
  if (emailIt && sc.email && !blocked) {
    const err = await emailPdf(pdf.bytes, pdf.filename, `${sc.site_id}/sub-orders`, { site_id: sc.site_id, recipient_email: sc.email, doc_title: `Subcontract Order ${sc.number || ''}${vos.length ? ` (Revision ${vos.length})` : ''}` });
    return err || `Sent to ${sc.email}.`;
  }
  const ok = await deliverPdf(pdf.bytes, pdf.filename);
  if (!ok) return 'Could not make the PDF — try again.';
  return !emailIt ? 'The order PDF is ready.' : blocked ? 'Finance is on trial, so nothing is emailed from Finance yet: the order PDF is downloaded for you to send.' : 'There is no email for them on the order: the PDF is downloaded for you to send.';
}
