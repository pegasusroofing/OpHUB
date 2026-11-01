// A Permit To Work as a PDF: details, who issued it, who has signed and how it was closed. The old app has no
// permit PDF; this is new so a permit can go out as an attachment, be exported, and be kept in the job's OneDrive.
import { DEFAULT_BRAND1, drawFit, embedImage, exportFilename, fetchScaled, hexToRgb, INK, PDFDocument, rgb, safe, siteLabel, SLATE, StandardFonts, storageImage, WHITE, wrap } from '@/lib/pdf';
import { publicUrl } from '@/lib/privateFiles';
import { supabase } from '@/lib/supabase';
import type { Organization, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type P = {
  id: string; site_id: string; permit_type: string; description: string | null; location: string | null; work_date: string | null; assigned_user_ids: string[] | null;
  issued_by: string | null; issued_at: string; issuer_signature_path: string | null; status: string; closed_by: string | null; closed_at: string | null; closed_notes: string | null;
  closer_signature_path: string | null; closedown_photo_path_1: string | null; closedown_photo_path_2: string | null;
};
const when = (s: string | null) => (s ? new Date(s.length === 10 ? `${s}T00:00:00` : s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export async function buildPermitPdf(p: P, label: string, site: Site, org: Organization | null): Promise<{ bytes: Uint8Array; filename: string }> {
  const ids = [...new Set([p.issued_by, p.closed_by, ...(p.assigned_user_ids ?? [])].filter(Boolean))] as string[];
  const sig = ((await db.from('permit_signoffs').select('user_id,signature_image_path,signed_at').eq('permit_id', p.id)).data as { user_id: string; signature_image_path: string | null; signed_at: string }[] | null) ?? [];
  const who = ((await db.from('profiles').select('id,name').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])).data as { id: string; name: string | null }[] | null) ?? [];
  const nameOf = (id: string | null) => who.find((x) => x.id === id)?.name || 'Unknown';

  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), reg = await doc.embedFont(StandardFonts.Helvetica);
  const LINE = rgb(0.88, 0.88, 0.9), BRAND = hexToRgb(org?.color_primary || DEFAULT_BRAND1);
  const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 44, CONTENT_W = PAGE_W - 2 * MARGIN;
  const logo = await storageImage(doc, 'org-logos', org?.logo_path);
  let page = doc.addPage([PAGE_W, PAGE_H]), y = 0;
  const head = (first = false) => {
    if (!first) page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: PAGE_H - 92, width: PAGE_W, height: 92, color: BRAND });
    if (logo) { const d = logo.scale(1), s = 40 / Math.max(d.width, d.height); page.drawRectangle({ x: MARGIN, y: PAGE_H - 76, width: 40, height: 40, color: WHITE }); page.drawImage(logo, { x: MARGIN + (40 - d.width * s) / 2, y: PAGE_H - 76 + (40 - d.height * s) / 2, width: d.width * s, height: d.height * s }); }
    const tx = logo ? MARGIN + 52 : MARGIN;
    page.drawText(p.status === 'closed' ? 'PERMIT TO WORK - CLOSED' : 'PERMIT TO WORK', { x: tx, y: PAGE_H - 40, size: 9, font: bold, color: WHITE, opacity: 0.85 });
    drawFit(page, label, { x: tx, y: PAGE_H - 60, size: 16, font: bold, color: WHITE });
    drawFit(page, `${siteLabel(site)} · ${org?.name || 'OpHUB'}`, { x: tx, y: PAGE_H - 76, size: 9.5, font: reg, color: WHITE, opacity: 0.9 });
    page.drawLine({ start: { x: MARGIN, y: 34 }, end: { x: PAGE_W - MARGIN, y: 34 }, thickness: 0.75, color: rgb(0.85, 0.84, 0.8) });
    page.drawText('Generated via OpHUB', { x: MARGIN, y: 20, size: 8, font: reg, color: SLATE });
    y = PAGE_H - 118;
  };
  const ensure = (h: number) => { if (y - h < 50) head(); };
  const row = (l: string, v: string | null | undefined) => {
    if (!v) return;
    ensure(30);
    page.drawText(l, { x: MARGIN, y, size: 9.5, font: bold, color: SLATE }); y -= 13;
    v.split(/\r?\n/).flatMap((t) => wrap(safe(t), reg, 11, CONTENT_W)).forEach((t) => { ensure(15); page.drawText(t, { x: MARGIN, y, size: 11, font: reg, color: INK }); y -= 15; });
    y -= 6; page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: PAGE_W - MARGIN, y: y + 2 }, thickness: 0.5, color: LINE }); y -= 8;
  };
  const signature = async (l: string, name: string, path: string | null, at: string | null) => {
    ensure(52);
    page.drawText(safe(`${l}: ${name}`), { x: MARGIN, y, size: 10.5, font: bold, color: INK });
    if (at) page.drawText(when(at), { x: PAGE_W - MARGIN - 70, y, size: 9.5, font: reg, color: SLATE });
    y -= 6;
    const img = path ? await storageImage(doc, 'signatures', path) : null;
    if (img) { const d = img.scale(1), s = Math.min(130 / d.width, 34 / d.height); page.drawImage(img, { x: MARGIN, y: y - d.height * s, width: d.width * s, height: d.height * s }); y -= 38; } else { page.drawText(path === null && l !== 'Issued by' ? 'Not signed yet' : '', { x: MARGIN, y: y - 12, size: 9.5, font: reg, color: SLATE }); y -= 18; }
    y -= 6;
  };
  head(true);
  row('Job', siteLabel(site));
  row('Location', p.location);
  row('Date of work', when(p.work_date));
  row('Work covered', p.description);
  await signature('Issued by', nameOf(p.issued_by), p.issuer_signature_path, p.issued_at);
  for (const u of p.assigned_user_ids ?? []) { const s = sig.find((x) => x.user_id === u); await signature('Signed by', nameOf(u), s?.signature_image_path ?? null, s?.signed_at ?? null); }
  if (p.status === 'closed') {
    row('Closed notes', p.closed_notes);
    await signature('Closed by', nameOf(p.closed_by), p.closer_signature_path, p.closed_at);
    for (const ph of [p.closedown_photo_path_1, p.closedown_photo_path_2]) {
      if (!ph) continue;
      const img = await embedImage(doc, await fetchScaled(publicUrl('site-photos', ph), 900, 0.72));
      if (!img) continue;
      ensure(250);
      const d = img.scale(1), s = Math.min(CONTENT_W / d.width, 240 / d.height);
      page.drawImage(img, { x: MARGIN, y: y - d.height * s, width: d.width * s, height: d.height * s }); y -= d.height * s + 12;
    }
  }
  const filename = exportFilename(site.name, `${label} Permit`, 'pdf');
  doc.setTitle(filename.replace(/\.pdf$/i, ''));
  return { bytes: await doc.save(), filename };
}

/** Builds the permit's PDF and stores it for the manager email. null if that fails: the email still goes, without it. */
export async function permitAttachment(permitId: string, label: string): Promise<{ bucket: string; path: string; name: string } | null> {
  try {
    const p = ((await db.from('permits').select('*').eq('id', permitId).limit(1)).data as P[] | null)?.[0];
    if (!p) return null;
    const site = ((await db.from('sites').select('*').eq('id', p.site_id).limit(1)).data as Site[] | null)?.[0];
    if (!site) return null;
    const org = ((await db.from('organizations').select('*').eq('id', (site as Site & { org_id: string }).org_id).limit(1)).data as Organization[] | null)?.[0] ?? null;
    const b = await buildPermitPdf(p, label, site, org);
    const path = `${p.site_id}/permits/${p.id}-${p.status}.pdf`;
    const up = await supabase.storage.from('mc-documents').upload(path, b.bytes, { contentType: 'application/pdf', upsert: true });
    return up.error ? null : { bucket: 'mc-documents', path, name: b.filename };
  } catch { return null; }
}
