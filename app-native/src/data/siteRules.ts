// Site Rules & Layout sheets (Andy, 20 Nov 2026): built like the RAMS / CPP builders from the company's template and the
// job (site hours, first aiders, the site layout plan and the PM from the job's Construction Phase Plan). Issuing makes
// the PDF and files it as a Site Rules & Layout document (site_layout_docs), signed by everyone exactly as an upload is.
// Database: SQL file 13 (site_rules_builds; the company template is the row with no job).
import { useQuery } from '@tanstack/react-query';

import { packPdfBytes } from '@/data/jobPack';
import { buildSiteRulesPdf } from '@/lib/pdfLazy';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { blankSiteRules, normaliseSiteRules, templateOf, type SiteRulesDoc } from '@/lib/rules/siteRules';
import { supabase } from '@/lib/supabase';
import type { Organization, Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Org = (Organization & { color_primary?: string | null; logo_path?: string | null }) | null;
export type SiteRulesRow = { id: string; org_id: string; site_id: string | null; data: Partial<SiteRulesDoc> | null; version: number; status: 'draft' | 'issued'; layout_doc_id: string | null; updated_at: string };

export function useSiteRulesBuilds(siteId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['siteRulesBuilds', siteId], enabled: !!siteId && enabled,
    queryFn: async () => ((await db.from('site_rules_builds').select('*').eq('site_id', siteId as string).order('updated_at', { ascending: false })).data as SiteRulesRow[] | null) ?? [],
  });
}
export async function loadSiteRules(id: string): Promise<{ row: SiteRulesRow; doc: SiteRulesDoc } | null> {
  const row = (await db.from('site_rules_builds').select('*').eq('id', id).maybeSingle()).data as SiteRulesRow | null;
  return row ? { row, doc: normaliseSiteRules(row.data) } : null;
}
export const saveSiteRules = async (id: string, doc: SiteRulesDoc) =>
  !!(await db.from('site_rules_builds').update({ data: doc, updated_at: new Date().toISOString() } as never).eq('id', id).select('id')).data?.length;
export const deleteSiteRules = async (id: string) => !!(await db.from('site_rules_builds').delete().eq('id', id).select('id')).data?.length;

/** The company's template: the saved one, or the standard rules. */
export async function loadSiteRulesTemplate(orgId: string | null | undefined): Promise<SiteRulesDoc> {
  if (!orgId) return blankSiteRules();
  const r = (await db.from('site_rules_builds').select('data').eq('org_id', orgId).is('site_id', null).maybeSingle()).data as { data: Partial<SiteRulesDoc> | null } | null;
  return r?.data ? normaliseSiteRules(r.data) : blankSiteRules();
}
export async function saveSiteRulesTemplate(orgId: string, doc: SiteRulesDoc): Promise<boolean> {
  const t = templateOf(doc);
  const cur = (await db.from('site_rules_builds').select('id').eq('org_id', orgId).is('site_id', null).maybeSingle()).data as { id: string } | null;
  if (cur) return !!(await db.from('site_rules_builds').update({ data: t, updated_at: new Date().toISOString() } as never).eq('id', cur.id).select('id')).data?.length;
  return !(await db.from('site_rules_builds').insert({ org_id: orgId, site_id: null, data: t } as never)).error;
}

/** A new sheet for this job: the company template, then what the job and its Construction Phase Plan already know. */
export async function createSiteRules(me: Profile, site: Site): Promise<string | null> {
  const d = await loadSiteRulesTemplate(me.org_id);
  d.siteName = site.name || '';
  d.siteAddress = String(fullSiteAddress(site) || '').trim();
  const [cppR, pmR] = await Promise.all([
    db.from('cpp_plans').select('data').eq('site_id', site.id).order('updated_at', { ascending: false }).limit(1),
    site.responsible_pm_id ? db.from('profiles').select('name,phone').eq('id', site.responsible_pm_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const cpp = ((((cppR.data as { data: Record<string, unknown> | null }[] | null) ?? [])[0]?.data) || {}) as { siteHours?: string; firstAiders?: string; sitePlan?: string | null; sitePlanMarks?: { base: string | null; ops: unknown[] }; pm?: { name?: string; phone?: string }; emergencyMobile?: string };
  const pm = (pmR.data as { name: string | null; phone: string | null } | null) || { name: me.name || '', phone: (me as Profile & { phone?: string | null }).phone || '' };
  if (cpp.siteHours) d.info.siteHours = String(cpp.siteHours).replace(/^The hours on site will be\s*/i, '').replace(/\.\s*Weekend.*$/i, '').trim() || d.info.siteHours;
  if (cpp.firstAiders) d.info.firstAiders = String(cpp.firstAiders).split('\n').map((x) => x.replace(/\s*Tel:.*$/, '').trim()).filter(Boolean).join(', ');
  d.info.emergencyName = cpp.pm?.name || pm.name || '';
  d.info.emergencyPhone = cpp.emergencyMobile || cpp.pm?.phone || pm.phone || '';
  if (cpp.sitePlan) { d.layout = cpp.sitePlan; d.layoutMarks = cpp.sitePlanMarks || { base: null, ops: [] }; }
  const r = await db.from('site_rules_builds').insert({ org_id: me.org_id, site_id: site.id, data: d, status: 'draft', version: 1 } as never).select('id').single();
  return (r.data as { id: string } | null)?.id ?? null;
}

export async function previewSiteRules(org: Org, doc: SiteRulesDoc, version: number) {
  return buildSiteRulesPdf(doc, org, version);
}
/** Issues the sheet: its PDF becomes a Site Rules & Layout document for everyone to sign. Issuing again is a revision:
 *  the earlier document stays, named as superseded. */
export async function issueSiteRules(me: Profile, org: Org, row: SiteRulesRow, d: SiteRulesDoc, note: string): Promise<{ doc: SiteRulesDoc; version: number; docId: string } | string> {
  const version = row.status === 'issued' ? (row.version || 1) + 1 : row.version || 1;
  const today = new Date().toISOString().slice(0, 10);
  const doc: SiteRulesDoc = { ...d, revisions: [...d.revisions.filter((r) => r.version !== version), { version, date: today, by: me.name || '', note: note.trim() || (version === 1 ? 'First issue' : ''), docId: null, path: null }] };
  const out = await buildSiteRulesPdf(doc, org, version);
  const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  const up = await supabase.storage.from('mc-documents').upload(`${row.site_id}/site-layout/${rid}-Site_Rules_v${version}.pdf`, out.bytes, { contentType: 'application/pdf' });
  if (up.error) return 'Upload failed - check signal and try again.';
  const ins = await db.from('site_layout_docs').insert({ site_id: row.site_id, name: `${doc.title || 'Site Rules'} v${version} - ${doc.siteName || 'Job'}`, storage_path: up.data.path, uploaded_by: me.id } as never).select('id').single();
  const docId = (ins.data as { id: string } | null)?.id;
  if (!docId) return 'Could not file the sheet - try again.';
  packPdfBytes(row.site_id, 'site_rules_issued', out.filename, out.bytes);
  doc.revisions = doc.revisions.map((r) => (r.version === version ? { ...r, docId, path: up.data.path } : r));
  if (row.status === 'issued' && row.layout_doc_id) {
    const old = (await db.from('site_layout_docs').select('name').eq('id', row.layout_doc_id).maybeSingle()).data as { name: string } | null;
    if (old && !/superseded/i.test(old.name)) await db.from('site_layout_docs').update({ name: `${old.name} (Superseded by v${version})` } as never).eq('id', row.layout_doc_id);
  }
  const ok = !!(await db.from('site_rules_builds').update({ data: doc, version, status: 'issued', layout_doc_id: docId, updated_at: new Date().toISOString() } as never).eq('id', row.id).select('id')).data?.length;
  return ok ? { doc, version, docId } : 'The sheet is filed, but could not be updated - try again.';
}
