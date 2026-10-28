// Site Inductions (550): every operative ticks the company's induction checklist,
// gives an emergency contact, answers the health questionnaire and signs; a signed
// PDF is built (same layout as today) and filed in mc-documents. Managers see who's
// outstanding / completed, delete one so it's redone, and edit the company-wide
// question list.
import { useQuery } from '@tanstack/react-query';

import { orThrow } from '@/lib/offlineCache';
import { DEFAULT_BRAND1, drawFit, exportFilename, hexToRgb, INK, OK, PDFDocument, rgb, safe, siteLabel, SLATE, StandardFonts, storageImage, WHITE, wrap } from '@/lib/pdf';
import { supabase } from '@/lib/supabase';
import type { Organization, Profile, Site } from '@/lib/types';
import { invokeAsUser } from '@/lib/userFunctions';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export const DEFAULT_INDUCTION_ITEMS = [
  "I have been shown this site's emergency procedures, including the fire exits, evacuation routes and the assembly point.",
  'I know the location of the first aid box and who the appointed first aiders are on this site.',
  'I understand I must wear the correct PPE for my task at all times on this site.',
  'I have been shown the site welfare facilities (toilets, drying room, canteen/rest area).',
  "I understand this site's permit-to-work requirements (e.g. hot works, confined spaces, working at height) and will not start such work without the correct permit in place.",
  'I have been made aware of the specific hazards on this site (traffic routes, excavations, overhead services, asbestos register where applicable).',
  'I understand how to report an accident, incident or near miss on this site.',
  'I agree to follow all site rules at all times, including signing in/out and wearing my ID badge.',
];
export const HEALTH_ITEMS = [
  { category: 'Physical Fitness', question: 'Do you have any condition affecting your balance, mobility, or ability to lift loads?' },
  { category: 'Working at Height', question: 'Do you suffer from vertigo, severe dizziness, or epilepsy?' },
  { category: 'Sensory / Alertness', question: 'Do you have uncorrected visual or hearing impairments that impact site safety?' },
  { category: 'Respiratory Health', question: 'Do you suffer from severe asthma or respiratory conditions aggravated by dust/fumes?' },
  { category: 'Medication / Safety', question: 'Are you taking medication that causes drowsiness or restricts operating machinery?' },
  { category: 'Emergency Info', question: 'Do you have any severe allergies (e.g., penicillin, latex, bee stings) or medical conditions (e.g., diabetes) that first aiders should be aware of?' },
];
type OrgQ = Organization & { site_induction_questions?: string[] | null };
export const inductionItems = (org: Organization | null) => {
  const q = (org as OrgQ | null)?.site_induction_questions;
  return Array.isArray(q) && q.length ? q : DEFAULT_INDUCTION_ITEMS;
};

export type Completion = { id: string; site_id: string; operative_id: string; completed_at: string; pdf_path: string | null };
export function useInductions(siteId: string | undefined) {
  return useQuery({
    queryKey: ['inductions', siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const [a, c, p] = await Promise.all([
        db.from('site_assignments').select('user_id').eq('site_id', siteId as string),
        db.from('site_induction_completions').select('id,site_id,operative_id,completed_at,pdf_path').eq('site_id', siteId as string).order('completed_at', { ascending: false }),
        db.from('profiles').select('id,role'),
      ]);
      const roles = Object.fromEntries(((p.data as { id: string; role: string }[] | null) ?? []).map((x) => [x.id, x.role]));
      const completions = orThrow(c) as Completion[];
      const byOp: Record<string, Completion> = {};
      completions.forEach((x) => { if (!byOp[x.operative_id]) byOp[x.operative_id] = x; });
      const assigned = ((a.data as { user_id: string }[] | null) ?? []).map((x) => x.user_id);
      const roster = (assigned.length ? assigned : Object.keys(byOp)).filter((u) => !roles[u] || roles[u] === 'operative' || byOp[u]);
      return { roster, byOp, total: completions.length };
    },
  });
}

async function buildPdf(site: Site, org: Organization | null, op: Profile & { signature_path?: string | null }, f: { emergencyName: string; emergencyNumber: string; health: Record<number, string>; details: Record<number, string> }) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const BRAND = hexToRgb(org?.color_primary || DEFAULT_BRAND1);
  const W = 595.28, H = 841.89, M = 42;
  const items = inductionItems(org);
  const logo = await storageImage(doc, 'org-logos', org?.logo_path);
  let page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: BRAND });
  if (logo) {
    const dim = logo.scale(1); const s = 40 / Math.max(dim.width, dim.height);
    page.drawRectangle({ x: M, y: H - 76, width: 40, height: 40, color: WHITE });
    page.drawImage(logo, { x: M + (40 - dim.width * s) / 2, y: H - 76 + (40 - dim.height * s) / 2, width: dim.width * s, height: dim.height * s });
  }
  const tx = logo ? M + 52 : M;
  page.drawText('SITE INDUCTION', { x: tx, y: H - 40, size: 9, font: bold, color: WHITE, opacity: 0.85 });
  drawFit(page, siteLabel(site), { x: tx, y: H - 60, size: 16, font: bold, color: WHITE });
  page.drawText(safe(org?.name || 'OpHUB'), { x: tx, y: H - 76, size: 9.5, font: reg, color: WHITE, opacity: 0.9 });
  let y = H - 118;
  page.drawText(safe(`Operative: ${op.name}`), { x: M, y, size: 11, font: bold, color: INK }); y -= 16;
  page.drawText(`Completed: ${new Date().toLocaleString('en-GB')}`, { x: M, y, size: 9.5, font: reg, color: SLATE });
  if (f.emergencyName || f.emergencyNumber) { y -= 16; page.drawText(safe(`Emergency contact: ${[f.emergencyName, f.emergencyNumber].filter(Boolean).join(' - ')}`), { x: M, y, size: 9.5, font: reg, color: SLATE }); }
  y -= 26;
  for (const q of items) {
    const lines = wrap(q, reg, 10, W - 2 * M - 24);
    const h = 16 + lines.length * 13;
    if (y - h < 60) { page = doc.addPage([W, H]); y = H - M; }
    const t = y - 11; // drawn tick: the font has no ✓ glyph
    page.drawLine({ start: { x: M, y: t - 2 }, end: { x: M + 3.5, y: t - 5.5 }, thickness: 1.6, color: OK });
    page.drawLine({ start: { x: M + 3.5, y: t - 5.5 }, end: { x: M + 10, y: t + 3 }, thickness: 1.6, color: OK });
    lines.forEach((l, i) => page.drawText(l, { x: M + 20, y: y - 11 - i * 13, size: 10, font: reg, color: INK }));
    y -= h;
  }
  y -= 10;
  if (y < 130) { page = doc.addPage([W, H]); y = H - M; }
  page.drawText('Signature', { x: M, y, size: 9, font: bold, color: SLATE }); y -= 8;
  const sig = await storageImage(doc, 'signatures', op.signature_path);
  if (sig) {
    const dim = sig.scale(1); const s = Math.min(160 / dim.width, 40 / dim.height);
    page.drawImage(sig, { x: M, y: y - dim.height * s, width: dim.width * s, height: dim.height * s }); y -= dim.height * s + 6;
  }
  page.drawText(safe(`${op.name} - ${new Date().toLocaleDateString('en-GB')}`), { x: M, y: y - 4, size: 9.5, font: reg, color: SLATE });
  let p2 = doc.addPage([W, H]);
  p2.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: BRAND });
  p2.drawText('HEALTH QUESTIONNAIRE', { x: M, y: H - 32, size: 9, font: bold, color: WHITE, opacity: 0.85 });
  drawFit(p2, siteLabel(site), { x: M, y: H - 52, size: 14, font: bold, color: WHITE });
  let y2 = H - 100;
  p2.drawText(safe(`Operative: ${op.name}`), { x: M, y: y2, size: 11, font: bold, color: INK }); y2 -= 24;
  HEALTH_ITEMS.forEach((it, i) => {
    const ans = f.health[i] || ''; const det = f.details[i] || '';
    const ql = wrap(`${it.category}: ${it.question}`, bold, 10, W - 2 * M);
    const dl = det ? wrap(`Details: ${det}`, reg, 9.5, W - 2 * M) : [];
    const h = ql.length * 13 + 16 + (dl.length ? dl.length * 12 + 6 : 0) + 12;
    if (y2 - h < 60) { p2 = doc.addPage([W, H]); y2 = H - M; }
    ql.forEach((l, li) => p2.drawText(l, { x: M, y: y2 - li * 13, size: 10, font: bold, color: INK }));
    y2 -= ql.length * 13 + 4;
    p2.drawText(`Answer: ${ans === 'yes' ? 'Yes' : ans === 'no' ? 'No' : '-'}`, { x: M, y: y2, size: 10, font: reg, color: ans === 'yes' ? rgb(0.72, 0.28, 0.22) : SLATE });
    y2 -= 16;
    if (dl.length) { dl.forEach((l, li) => p2.drawText(l, { x: M, y: y2 - li * 12, size: 9.5, font: reg, color: SLATE })); y2 -= dl.length * 12 + 6; }
    y2 -= 12;
  });
  const filename = exportFilename(site.name, `Site Induction - ${op.name}`);
  doc.setTitle(filename.replace(/\.pdf$/i, ''));
  return { bytes: await doc.save(), filename };
}

export async function submitInduction(me: Profile & { signature_path?: string | null }, org: Organization | null, site: Site, f: { emergencyName: string; emergencyNumber: string; health: Record<number, string>; details: Record<number, string> }, onStep: (s: string) => void): Promise<string | null> {
  onStep('Saving — building PDF…');
  let built: { bytes: Uint8Array; filename: string };
  try { built = await buildPdf(site, org, me, f); } catch (e) { return `Could not build the induction PDF — ${e instanceof Error ? e.message : 'unknown error'}. Please try again.`; }
  onStep('Saving — uploading PDF…');
  const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  const up = await supabase.storage.from('mc-documents').upload(`${site.id}/site-inductions/${rid}-${me.id}.pdf`, built.bytes, { contentType: 'application/pdf' });
  if (up.error) return 'Could not upload the PDF — check your signal and try again.';
  onStep('Saving — writing record…');
  const answers: Record<string, unknown> = {};
  inductionItems(org).forEach((_, i) => { answers[`item_${i}`] = true; });
  answers.health = HEALTH_ITEMS.map((it, i) => ({ category: it.category, question: it.question, answer: f.health[i], details: f.health[i] === 'yes' ? (f.details[i] || '').trim() : null }));
  const r = await db.from('site_induction_completions').insert({ site_id: site.id, operative_id: me.id, answers, signature_image_path: me.signature_path, pdf_path: up.data.path, emergency_contact_name: f.emergencyName, emergency_contact_number: f.emergencyNumber } as never).select('id').single();
  if (r.error) return 'The PDF uploaded but the record failed to save — please try again.';
  // Best-effort copy to the job's linked OneDrive inductions folder, as today.
  const s = site as Site & { site_inductions_folder_id?: string | null; site_inductions_drive_id?: string | null };
  if (s.site_inductions_folder_id) {
    let bin = ''; for (let i = 0; i < built.bytes.length; i += 0x8000) bin += String.fromCharCode(...built.bytes.subarray(i, i + 0x8000));
    void invokeAsUser<{ ok?: boolean }>('onedrive-upload', { filename: built.filename, content_base64: btoa(bin), folder_id: s.site_inductions_folder_id, drive_id: s.site_inductions_drive_id || undefined })
      .then((x) => { if (x.data?.ok) void db.from('site_induction_completions').update({ pushed_to_onedrive_at: new Date().toISOString() } as never).eq('id', (r.data as { id: string }).id); });
  }
  return null;
}

export const deleteCompletion = async (id: string) => !(await db.from('site_induction_completions').delete().eq('id', id)).error;
export async function setInductionQuestions(orgId: string, list: string[]) {
  return !(await db.from('organizations').update({ site_induction_questions: list } as never).eq('id', orgId)).error;
}
