// Repair job Survey Report and Completed Works Report (340 buildRepairJobSurveyPdf
// / buildRepairJobCompletionPdf): brand header with the address, job details,
// the survey (or completion) fields, then the photos four to a page.
import { appendMediaSummary, DEFAULT_BRAND1, deliverPdf, drawFit, exportFilename, hexToRgb, INK, PDFDocument, rgb, safe, siteLabel, SLATE, StandardFonts, storageImage, WHITE, wrap, type PDFPage } from '@/lib/pdf';
import { REPAIR_ACCESS, type RepairJob } from '@/lib/rules/repairs';
import { supabase } from '@/lib/supabase';
import type { Organization, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const ukd = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export async function exportRepairReport(kind: 'survey' | 'completion', job: RepairJob, site: Site | null | undefined, org: Organization | null, surveyor: string): Promise<boolean> {
  const r = await buildRepairReport(kind, job, site, org, surveyor);
  return deliverPdf(r.bytes, r.filename);
}
/** The report itself (also sent to the job's OneDrive folder whenever it changes). */
export async function buildRepairReport(kind: 'survey' | 'completion', job: RepairJob, site: Site | null | undefined, org: Organization | null, surveyor: string): Promise<{ bytes: Uint8Array; filename: string }> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), reg = await doc.embedFont(StandardFonts.Helvetica);
  const FAINT = rgb(0.85, 0.84, 0.8), HEADBAR = rgb(0.933, 0.941, 0.961), BRAND = hexToRgb(org?.color_primary || DEFAULT_BRAND1);
  const W = 595.28, H = 841.89, M = 44, CW = W - 2 * M;
  const logo = await storageImage(doc, 'org-logos', org?.logo_path);
  let page!: PDFPage, y = 0;
  const newPage = () => {
    page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: BRAND });
    if (logo) { const d = logo.scale(1), s = 40 / Math.max(d.width, d.height); page.drawRectangle({ x: M, y: H - 76, width: 40, height: 40, color: WHITE }); page.drawImage(logo, { x: M + (40 - d.width * s) / 2, y: H - 76 + (40 - d.height * s) / 2, width: d.width * s, height: d.height * s }); }
    const tx = logo ? M + 52 : M;
    page.drawText(kind === 'survey' ? 'SURVEY REPORT' : 'COMPLETED WORKS REPORT', { x: tx, y: H - 40, size: 9, font: bold, color: WHITE, opacity: 0.85 });
    drawFit(page, safe(job.address || 'Repair Job'), { x: tx, y: H - 60, size: 16, font: bold, color: WHITE, maxWidth: W - tx - M });
    drawFit(page, safe(`${org?.name || 'OpHUB'}${site ? ` · ${siteLabel(site)}` : ''}`), { x: tx, y: H - 76, size: 9.5, font: reg, color: WHITE, opacity: 0.9, maxWidth: W - tx - M });
    y = H - 118;
  };
  const ensure = (h: number) => { if (y - h < 50) newPage(); };
  const bar = (label: string) => { ensure(30); page.drawRectangle({ x: M, y: y - 26, width: CW, height: 26, color: HEADBAR }); page.drawText(label, { x: M + 10, y: y - 18, size: 11.5, font: bold, color: INK }); y -= 34; };
  const field = (label: string, value: string | null | undefined) => {
    ensure(30); page.drawText(label.toUpperCase(), { x: M, y: y - 11, size: 8.5, font: bold, color: SLATE }); y -= 16;
    String(value || '—').split('\n').forEach((p) => wrap(safe(p), reg, 10.5, CW).forEach((l) => { ensure(14); page.drawText(l, { x: M, y: y - 10, size: 10.5, font: reg, color: INK }); y -= 14; }));
    y -= 8;
  };
  newPage();
  bar('Job Details');
  field('Job Number', job.job_number); field('Address', job.address);
  if (job.description) field('Description of Call Out', job.description);
  if (kind === 'survey') {
    bar('Survey');
    field('Survey Date', job.survey_date ? `${ukd(job.survey_date)}${surveyor ? ` — surveyed by ${surveyor}` : ''}` : 'Not yet surveyed');
    field('Access Requirement', REPAIR_ACCESS[job.access_requirement || ''] || 'None');
    if (job.access_notes) field('Access Notes', job.access_notes);
    field('Survey Notes', job.survey_notes || '(no notes recorded)');
  } else {
    bar('Completion');
    field('Works Completed', job.works_completed_date ? ukd(job.works_completed_date) : 'Not yet marked complete');
    field('Completion Notes', job.works_notes || '(no notes recorded)');
  }
  const cats = kind === 'survey' ? ['survey', 'access'] : ['completion'];
  const photos = ((await db.from('repair_job_photos').select('storage_path').eq('repair_job_id', job.id).in('category', cats).is('deleted_at', null).order('created_at')).data as { storage_path: string }[] | null) ?? [];
  await appendMediaSummary(doc, photos.map((p) => ({ path: p.storage_path, bucket: 'site-photos' })), { maxDim: 900, quality: 0.72 });
  const total = doc.getPageCount();
  doc.getPages().forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 34 }, end: { x: W - M, y: 34 }, thickness: 0.75, color: FAINT });
    p.drawText('Generated via OpHUB', { x: M, y: 20, size: 8, font: reg, color: SLATE });
    const lbl = `${i + 1} of ${total}`; p.drawText(lbl, { x: W - M - reg.widthOfTextAtSize(lbl, 8), y: 20, size: 8, font: reg, color: SLATE });
  });
  const filename = exportFilename(job.address || '', kind === 'survey' ? 'Survey Report' : 'Completed Works Report', 'pdf');
  doc.setTitle(filename.replace(/\.pdf$/i, ''));
  return { bytes: await doc.save(), filename };
}
