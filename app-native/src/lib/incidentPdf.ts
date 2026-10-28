// Accident / incident / near miss report PDF (690 buildIncidentPdf) and its
// email (send-incident-email, to the person sending it, optionally CC client).
import { DEFAULT_BRAND1, drawFit, embedImage, exportFilename, fetchBytes, fetchScaled, hexToRgb, INK, PDFDocument, rgb, safe, siteLabel, SLATE, StandardFonts, storageImage, WHITE, wrap } from '@/lib/pdf';
import { publicUrl } from '@/lib/privateFiles';
import { supabase } from '@/lib/supabase';
import type { Organization, Site } from '@/lib/types';

type R = Record<string, unknown> & { site_id: string; location?: string | null; incident_date?: string | null; created_by?: string | null; signed_at?: string | null; signature_image_path?: string | null; area_photo_paths?: string[] | null; damage_photo_paths?: string[] | null };
const yesNo = (v: unknown) => (v === true ? 'Yes' : v === false ? 'No' : '');
const cap = (v: unknown) => (typeof v === 'string' && v ? v.charAt(0).toUpperCase() + v.slice(1) : '');
const fmtDT = (v: unknown) => (v ? new Date(String(v)).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export async function buildIncidentPdf(r: R, site: Site, org: Organization | null, nameOf: (id: string | null | undefined) => string) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), reg = await doc.embedFont(StandardFonts.Helvetica);
  const LINE = rgb(0.88, 0.88, 0.9), BRAND = hexToRgb(org?.color_primary || DEFAULT_BRAND1);
  const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 44, CONTENT_W = PAGE_W - 2 * MARGIN;
  const logo = await storageImage(doc, 'org-logos', org?.logo_path);
  const date = r.incident_date ? new Date(`${r.incident_date}T00:00:00`).toLocaleDateString('en-GB') : '';
  let page = doc.addPage([PAGE_W, PAGE_H]), y = 0;
  const newPage = (first = false) => {
    if (!first) page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: PAGE_H - 92, width: PAGE_W, height: 92, color: BRAND });
    if (logo) { const d = logo.scale(1), s = 40 / Math.max(d.width, d.height); page.drawRectangle({ x: MARGIN, y: PAGE_H - 76, width: 40, height: 40, color: WHITE }); page.drawImage(logo, { x: MARGIN + (40 - d.width * s) / 2, y: PAGE_H - 76 + (40 - d.height * s) / 2, width: d.width * s, height: d.height * s }); }
    const tx = logo ? MARGIN + 52 : MARGIN;
    page.drawText('ACCIDENT / INCIDENT / NEAR MISS REPORT', { x: tx, y: PAGE_H - 40, size: 9, font: bold, color: WHITE, opacity: 0.85 });
    drawFit(page, r.location || siteLabel(site), { x: tx, y: PAGE_H - 60, size: 16, font: bold, color: WHITE });
    drawFit(page, `${siteLabel(site)} · ${date}`, { x: tx, y: PAGE_H - 76, size: 9.5, font: reg, color: WHITE, opacity: 0.9 });
    page.drawLine({ start: { x: MARGIN, y: 34 }, end: { x: PAGE_W - MARGIN, y: 34 }, thickness: 0.75, color: rgb(0.85, 0.84, 0.8) });
    page.drawText('Generated via OpHUB', { x: MARGIN, y: 20, size: 8, font: reg, color: SLATE });
    y = PAGE_H - 118;
  };
  const ensure = (h: number) => { if (y - h < 50) newPage(); };
  const row = (label: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return;
    ensure(30);
    page.drawText(safe(label), { x: MARGIN, y, size: 9.5, font: bold, color: SLATE }); y -= 13;
    String(value).split(/\r?\n/).flatMap((p) => wrap(safe(p), reg, 11, CONTENT_W)).forEach((l) => { ensure(15); page.drawText(l, { x: MARGIN, y, size: 11, font: reg, color: INK }); y -= 15; });
    y -= 6; page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: PAGE_W - MARGIN, y: y + 2 }, thickness: 0.5, color: LINE }); y -= 8;
  };
  const photos = async (label: string, paths: string[] | null | undefined) => {
    if (!paths || !paths.length) return;
    ensure(24); page.drawText(label, { x: MARGIN, y, size: 9.5, font: bold, color: SLATE }); y -= 8;
    let x = MARGIN; const size = 90;
    for (const p of paths) {
      if (x + size > PAGE_W - MARGIN) { x = MARGIN; y -= size + 8; }
      ensure(size + 8);
      const img = await embedImage(doc, await fetchScaled(publicUrl('incident-photos', p), size * 3, 0.78));
      if (img) page.drawImage(img, { x, y: y - size, width: size, height: size });
      x += size + 8;
    }
    y -= size + 14;
  };
  newPage(true);
  row('Site of accident / incident / near miss', r.site_address);
  row('Location of incident', r.location);
  row('Date of incident', date);
  row('Operatives involved', r.operatives_involved);
  row('Form filed by', r.filed_by_name);
  row('Detail of the incident', r.detail);
  await photos('Photo of area of incident', r.area_photo_paths);
  row('Date and time of incident', fmtDT(r.incident_datetime));
  row('Date and time incident was reported', fmtDT(r.reported_datetime));
  row('To whom was the incident reported', r.reported_to);
  row('Witnesses', r.witnesses === 'na' ? 'N/A' : cap(r.witnesses));
  row('Witness name(s)', r.witness_names);
  row('Operative requires further medical treatment', yesNo(r.medical_treatment_required));
  row('Medical treatment required/advised', r.medical_treatment_detail);
  row('Any injuries occurred', yesNo(r.injury_occurred));
  row('Injury to who', r.injury_to);
  row('Description of injury', r.injury_description);
  row('Further medical treatment required', yesNo(r.injury_further_treatment));
  row('Damage to property or plant', yesNo(r.damage_occurred));
  row('Damage severity', cap(r.damage_severity));
  await photos('Photo of damage', r.damage_photo_paths);
  row('How the incident happened', r.damage_description);
  row('Contributing factors', r.contributing_factors);
  row('Corrective action', r.corrective_action);
  row('Potential severity', cap(r.potential_severity));
  row('What could have potentially happened', r.potential_outcome);
  row('Probability of reoccurrence', cap(r.reoccurrence_probability));
  row('RIDDOR reportable', yesNo(r.riddor_reportable));
  ensure(60);
  drawFit(page, `Signed by ${nameOf(r.created_by)} · ${r.signed_at ? new Date(r.signed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}`, { x: MARGIN, y, size: 9.5, font: bold, color: SLATE, maxWidth: CONTENT_W });
  y -= 20;
  if (r.signature_image_path) { const img = await embedImage(doc, await fetchBytes(publicUrl('signatures', r.signature_image_path))); if (img) { const d = img.scale(1), s = 28 / d.height; page.drawImage(img, { x: MARGIN, y: y - 28, width: d.width * s, height: 28 }); } }
  return { bytes: await doc.save(), filename: exportFilename(site.name, `Incident Report - ${r.location || ''} - ${r.incident_date || ''}`, 'pdf') };
}

export async function emailIncidentPdf(siteId: string, bytes: Uint8Array, filename: string, clientCc: string | null): Promise<string> {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const r = await supabase.functions.invoke('send-incident-email', { body: { site_id: siteId, filename, content_base64: btoa(bin), client_cc_email: clientCc } });
  const d = r.data as { error?: string } | null;
  return r.error || d?.error ? `Email failed — ${d?.error || 'try again'}` : 'Incident report emailed to you';
}
