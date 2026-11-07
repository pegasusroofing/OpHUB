// Repair job reports (340 buildRepairJobSurveyPdf / buildRepairJobCompletionPdf; Andy 7 Nov 2026): the Attendance
// Report (the works required: fault, repair, whether it was done in the visit, the attendance photos), the Completed
// Works Report, and the Quote. Brand header with the address, the job details, then the photos four to a page.
import { appendMediaSummary, DEFAULT_BRAND1, drawFit, exportFilename, hexToRgb, INK, PDFDocument, rgb, safe, showPdf, siteLabel, SLATE, StandardFonts, storageImage, WHITE, wrap, type PDFPage } from '@/lib/pdf';
import { quoteTotals, lineValue, type QuoteLine } from '@/lib/rules/repairQuote';
import { REPAIR_ACCESS, type RepairJob } from '@/lib/rules/repairs';
import { supabase } from '@/lib/supabase';
import type { Organization, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const ukd = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type Kind = 'survey' | 'completion' | 'quote';
type J = RepairJob & Record<string, any>;
const TITLE: Record<Kind, string> = { survey: 'ATTENDANCE REPORT', completion: 'COMPLETED WORKS REPORT', quote: 'QUOTE' };
const FILE: Record<Kind, string> = { survey: 'Attendance Report', completion: 'Completed Works Report', quote: 'Quote' };

export async function exportRepairReport(kind: Kind, job: RepairJob, site: Site | null | undefined, org: Organization | null, surveyor: string, vat?: string | null): Promise<boolean> {
  const r = await buildRepairReport(kind, job, site, org, surveyor, vat);
  // Opened to read (Andy, 7 Nov 2026: no OneDrive question here; the reports go to the job's folder by themselves).
  return showPdf(r.bytes, r.filename);
}
/** The report itself (the attendance and completed works reports also go to the job's OneDrive folder when they change). */
export async function buildRepairReport(kind: Kind, job0: RepairJob, site: Site | null | undefined, org: Organization | null, surveyor: string, vat?: string | null): Promise<{ bytes: Uint8Array; filename: string }> {
  const job = job0 as J;
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
    page.drawText(TITLE[kind], { x: tx, y: H - 40, size: 9, font: bold, color: WHITE, opacity: 0.85 });
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
  field('Works Order', job.job_number); field('Address', job.address);
  if (job.tenant_name || job.tenant_no) field('Tenant', [job.tenant_name, job.tenant_no ? `Tenant No. ${job.tenant_no}` : ''].filter(Boolean).join(' · '));
  if (job.description) field('Call-Out', job.description);
  if (kind === 'survey') {
    bar('Attendance');
    field('Attended', job.survey_date ? `${ukd(job.survey_date)}${surveyor ? ` — ${surveyor}` : ''}` : 'Not attended yet');
    field('Description Of Fault Found', job.fault_description || '(not recorded)');
    field('Description Of Repair Required', job.repair_description || job.survey_notes || '(not recorded)');
    field('Completed Repair Whilst In Attendance', job.completed_in_visit === true ? 'Yes' : job.completed_in_visit === false ? 'No — needs a quote' : '—');
    if (job.access_requirement && job.access_requirement !== 'none') field('Access', `${REPAIR_ACCESS[job.access_requirement] || job.access_requirement}${job.access_notes ? ` — ${job.access_notes}` : ''}`);
  } else if (kind === 'completion') {
    bar('Completion');
    field('Works Completed', job.works_completed_date ? ukd(job.works_completed_date) : 'Not yet complete');
    field('Description Of Works Completed', job.works_notes || '(not recorded)');
  } else {
    // The quote: a table of the lines, then the totals (the contract's VAT once, at the bottom).
    const lines = (Array.isArray(job.quote_lines) ? job.quote_lines : []) as QuoteLine[];
    const disc = Number(job.quote_discount_pct || 0);
    const t = quoteTotals(lines.length ? lines : [{ description: job.priced_schedule_of_works || 'Works as described', qty: 1, rate: Number(job.variation_cost || 0) }], disc, vat);
    bar(`Quote${job.variation_issued_at ? ` — ${ukd(job.variation_issued_at)}` : ''}`);
    const cols = [M, M + 300, M + 345, M + 395, W - M];
    const head = ['Item', 'Qty', 'Unit', 'Rate', 'Value'];
    ensure(20); head.forEach((h, i) => { const x = i === 4 ? cols[4] - bold.widthOfTextAtSize(h, 8.5) : cols[i]; page.drawText(h.toUpperCase(), { x, y: y - 10, size: 8.5, font: bold, color: SLATE }); }); y -= 18;
    (lines.length ? lines : [{ description: job.priced_schedule_of_works || 'Works as described', qty: 1, rate: Number(job.variation_cost || 0) }]).forEach((l) => {
      const desc = wrap(safe(`${l.code ? `${l.code} ` : ''}${l.description}`), reg, 10, 290);
      ensure(14 * desc.length + 6);
      desc.forEach((d, i) => page.drawText(d, { x: cols[0], y: y - 10 - i * 13, size: 10, font: reg, color: INK }));
      page.drawText(String(l.qty ?? ''), { x: cols[1], y: y - 10, size: 10, font: reg, color: INK });
      page.drawText(safe(l.unit || ''), { x: cols[2], y: y - 10, size: 10, font: reg, color: INK });
      page.drawText(gbp(Number(l.rate || 0)), { x: cols[3], y: y - 10, size: 10, font: reg, color: INK });
      const v = gbp(lineValue(l, disc)); page.drawText(v, { x: cols[4] - reg.widthOfTextAtSize(v, 10), y: y - 10, size: 10, font: reg, color: INK });
      y -= 13 * desc.length + 6;
    });
    y -= 6;
    const tot = (label: string, v: string, b = false) => { ensure(16); const f = b ? bold : reg; page.drawText(label, { x: cols[3] - 80, y: y - 10, size: 10.5, font: f, color: INK }); page.drawText(v, { x: cols[4] - f.widthOfTextAtSize(v, 10.5), y: y - 10, size: 10.5, font: f, color: INK }); y -= 16; };
    if (t.discount) { tot('Schedule of rates', gbp(t.sorGross)); tot(`Less ${disc}% discount`, `-${gbp(t.discount)}`); }
    tot('Net', gbp(t.net), true);
    tot(t.vatPct ? `VAT ${t.vatPct}%` : 'VAT', t.vatPct ? gbp(t.vat) : '—');
    tot('Total', gbp(t.total), true);
    if (t.vatNote) { y -= 4; field('Note', t.vatNote); }
  }
  if (kind !== 'quote') {
    const cats = kind === 'survey' ? ['survey', 'access'] : ['completion', 'progress', 'scaffold'];
    const photos = ((await db.from('repair_job_photos').select('storage_path').eq('repair_job_id', job.id).in('category', cats).is('deleted_at', null).order('created_at')).data as { storage_path: string }[] | null) ?? [];
    await appendMediaSummary(doc, photos.map((p) => ({ path: p.storage_path, bucket: 'site-photos' })), { maxDim: 900, quality: 0.72 });
  }
  const total = doc.getPageCount();
  doc.getPages().forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 34 }, end: { x: W - M, y: 34 }, thickness: 0.75, color: FAINT });
    p.drawText('Generated via OpHUB', { x: M, y: 20, size: 8, font: reg, color: SLATE });
    const lbl = `${i + 1} of ${total}`; p.drawText(lbl, { x: W - M - reg.widthOfTextAtSize(lbl, 8), y: 20, size: 8, font: reg, color: SLATE });
  });
  const filename = exportFilename(job.job_number || job.address || '', FILE[kind], 'pdf');
  doc.setTitle(filename.replace(/\.pdf$/i, ''));
  return { bytes: await doc.save(), filename };
}
