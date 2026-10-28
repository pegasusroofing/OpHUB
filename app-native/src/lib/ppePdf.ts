// PPE issuance record PDF (650 buildPpeIssuancePdf): items issued, who issued
// it, and the operative's signature — or "issued in person, not signed".
// Several ticked records become one PDF to export, or attachments to email.
import { DEFAULT_BRAND1, drawFit, embedImage, exportFilename, fetchBytes, hexToRgb, INK, PDFDocument, rgb, safe, siteLabel, SLATE, StandardFonts, storageImage, WHITE } from '@/lib/pdf';
import { publicUrl } from '@/lib/privateFiles';
import { supabase } from '@/lib/supabase';
import type { Organization, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Iss = { id: string; user_id: string; items: string[] | null; issued_by: string | null; issued_at: string; signed_at: string | null; signature_image_path: string | null };
type NameOf = (id: string | null | undefined) => string;

async function onePdf(i: Iss, site: Site, org: Organization | null, nameOf: NameOf) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), reg = await doc.embedFont(StandardFonts.Helvetica);
  const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 44, LINE = rgb(0.85, 0.85, 0.85);
  const logo = await storageImage(doc, 'org-logos', org?.logo_path);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: PAGE_H - 92, width: PAGE_W, height: 92, color: hexToRgb(org?.color_primary || DEFAULT_BRAND1) });
  if (logo) { const d = logo.scale(1), s = 40 / Math.max(d.width, d.height); page.drawRectangle({ x: MARGIN, y: PAGE_H - 76, width: 40, height: 40, color: WHITE }); page.drawImage(logo, { x: MARGIN + (40 - d.width * s) / 2, y: PAGE_H - 76 + (40 - d.height * s) / 2, width: d.width * s, height: d.height * s }); }
  const tx = logo ? MARGIN + 52 : MARGIN, day = new Date(i.issued_at).toLocaleDateString('en-GB');
  page.drawText('PPE ISSUANCE RECORD', { x: tx, y: PAGE_H - 40, size: 9, font: bold, color: WHITE, opacity: 0.85 });
  drawFit(page, nameOf(i.user_id), { x: tx, y: PAGE_H - 60, size: 16, font: bold, color: WHITE });
  drawFit(page, `${siteLabel(site)} · ${day}`, { x: tx, y: PAGE_H - 76, size: 9.5, font: reg, color: WHITE, opacity: 0.9 });
  let y = PAGE_H - 130;
  page.drawText('Items issued', { x: MARGIN, y, size: 9.5, font: bold, color: SLATE }); y -= 16;
  (i.items || []).forEach((it) => { drawFit(page, `• ${it}`, { x: MARGIN, y, size: 11.5, font: reg, color: INK }); y -= 16; });
  y -= 8; page.drawLine({ start: { x: MARGIN, y: y + 8 }, end: { x: PAGE_W - MARGIN, y: y + 8 }, thickness: 0.5, color: LINE }); y -= 8;
  drawFit(page, `Issued by ${nameOf(i.issued_by)} on ${day}`, { x: MARGIN, y, size: 10, font: reg, color: SLATE }); y -= 34;
  if (i.signature_image_path) {
    page.drawText('I confirm I have received the above PPE items and will use/maintain them as instructed.', { x: MARGIN, y, size: 9.5, font: reg, color: SLATE }); y -= 22;
    drawFit(page, `Signed by ${nameOf(i.user_id)} · ${i.signed_at ? new Date(i.signed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}`, { x: MARGIN, y, size: 9.5, font: bold, color: SLATE });
  } else drawFit(page, `Issued in person by ${nameOf(i.issued_by)} — not signed by the operative.`, { x: MARGIN, y, size: 9.5, font: bold, color: SLATE });
  y -= 20;
  if (i.signature_image_path) { const img = await embedImage(doc, await fetchBytes(publicUrl('signatures', i.signature_image_path))); if (img) { const d = img.scale(1), s = 28 / d.height; page.drawImage(img, { x: MARGIN, y: y - 28, width: d.width * s, height: 28 }); } }
  page.drawLine({ start: { x: MARGIN, y: 34 }, end: { x: PAGE_W - MARGIN, y: 34 }, thickness: 0.75, color: rgb(0.85, 0.84, 0.8) });
  page.drawText('Generated via OpHUB', { x: MARGIN, y: 20, size: 8, font: reg, color: SLATE });
  return { bytes: await doc.save(), filename: exportFilename(site.name, safe(`PPE - ${nameOf(i.user_id)} - ${day}`), 'pdf') };
}

const load = async (ids: string[]) => ((await db.from('ppe_issuances').select('*').in('id', ids)).data as Iss[] | null) ?? [];

export async function ppeExportPdf(ids: string[], site: Site, org: Organization | null, nameOf: NameOf) {
  const merged = await PDFDocument.create();
  for (const i of await load(ids)) { const b = await onePdf(i, site, org, nameOf); const src = await PDFDocument.load(b.bytes); (await merged.copyPages(src, src.getPageIndices())).forEach((p) => merged.addPage(p)); }
  if (!merged.getPageCount()) return null;
  const filename = exportFilename(site.name, `PPE Issued (${ids.length})`, 'pdf');
  merged.setTitle(filename.replace(/\.pdf$/i, ''));
  return { bytes: await merged.save(), filename };
}

/** Each ticked record as its own attachment, to the person sending it (send-report-email). */
export async function ppeEmailPdfs(ids: string[], site: Site, org: Organization | null, nameOf: NameOf): Promise<{ ok: boolean; msg: string }> {
  const attachments: { filename: string; content_base64: string }[] = [];
  for (const i of await load(ids)) {
    const b = await onePdf(i, site, org, nameOf);
    let bin = ''; for (let k = 0; k < b.bytes.length; k += 0x8000) bin += String.fromCharCode(...b.bytes.subarray(k, k + 0x8000));
    attachments.push({ filename: b.filename, content_base64: btoa(bin) });
  }
  if (!attachments.length) return { ok: false, msg: 'Could not build any of the selected records.' };
  const r = await supabase.functions.invoke('send-report-email', { body: { attachments } });
  const d = r.data as { error?: string } | null;
  return r.error || d?.error ? { ok: false, msg: `Email failed — ${d?.error || 'try again'}` } : { ok: true, msg: `${attachments.length} record(s) emailed to you` };
}
