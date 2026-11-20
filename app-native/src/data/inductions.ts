// Site Inductions (550): every operative ticks the company's induction checklist,
// gives an emergency contact, answers the health questionnaire and signs; a signed
// PDF is built (same layout as today) and filed in mc-documents. Managers see who's
// outstanding / completed, delete one so it's redone, and edit the company-wide
// question list.
import { useQuery } from '@tanstack/react-query';

import { orThrow } from '@/lib/offlineCache';
import { fetchBytes } from '@/lib/fileOut';
import { buildInductionPdf } from '@/lib/pdfLazy';
import { publicUrl } from '@/lib/privateFiles';
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

/** The job's Site Rules & Layout documents: read and signed with the induction (Andy, 20 Nov 2026). */
export type SiteRule = { id: string; name: string; storage_path: string };
export function useSiteRules(siteId: string | undefined) {
  return useQuery({ queryKey: ['siteRules', siteId], enabled: !!siteId, queryFn: async () => ((await db.from('site_layout_docs').select('id,name,storage_path').eq('site_id', siteId as string).order('uploaded_at')).data as SiteRule[] | null) ?? [] });
}

export async function submitInduction(me: Profile & { signature_path?: string | null }, org: Organization | null, site: Site, f: { emergencyName: string; emergencyNumber: string; health: Record<number, string>; details: Record<number, string> }, onStep: (s: string) => void, rules: SiteRule[] = []): Promise<string | null> {
  onStep('Saving — building PDF…');
  let built: { bytes: Uint8Array; filename: string };
  // The site rules go in the back of the induction PDF.
  const ruleFiles = await Promise.all(rules.map(async (r) => ({ name: r.name, bytes: await fetchBytes(publicUrl('mc-documents', r.storage_path)).catch(() => null) })));
  try { built = await buildInductionPdf(site, org, me, { ...f, rules: ruleFiles }); } catch (e) { return `Could not build the induction PDF — ${e instanceof Error ? e.message : 'unknown error'}. Please try again.`; }
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
  // Signing the induction signs the site rules too: one signature for both (any not already signed by them).
  if (rules.length) {
    const had = new Set((((await db.from('site_layout_signatures').select('layout_id').eq('user_id', me.id).in('layout_id', rules.map((x) => x.id))).data as { layout_id: string }[] | null) ?? []).map((x) => x.layout_id));
    const todo = rules.filter((x) => !had.has(x.id));
    if (todo.length) await db.from('site_layout_signatures').insert(todo.map((x) => ({ layout_id: x.id, user_id: me.id, signature_image_path: me.signature_path || null })) as never);
  }
  // Best-effort copy to the job's linked OneDrive inductions folder, as today.
  const s = site as Site & { site_inductions_folder_id?: string | null; site_inductions_drive_id?: string | null };
  if (s.site_inductions_folder_id) {
    let bin = ''; for (let i = 0; i < built.bytes.length; i += 0x8000) bin += String.fromCharCode(...built.bytes.subarray(i, i + 0x8000));
    void invokeAsUser<{ ok?: boolean }>('onedrive-upload', { filename: built.filename, content_base64: btoa(bin), folder_id: s.site_inductions_folder_id, drive_id: s.site_inductions_drive_id || undefined })
      .then((x) => { if (x.data?.ok) void db.from('site_induction_completions').update({ pushed_to_onedrive_at: new Date().toISOString() } as never).eq('id', (r.data as { id: string }).id).then(undefined, () => undefined); });
  }
  return null;
}

export const deleteCompletion = async (id: string) => !!(await db.from('site_induction_completions').delete().eq('id', id).select('id')).data?.length;
export async function setInductionQuestions(orgId: string, list: string[]) {
  return !!(await db.from('organizations').update({ site_induction_questions: list } as never).eq('id', orgId).select('id')).data?.length;
}
