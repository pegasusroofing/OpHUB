// RAMS Builder data (586 / 587): a job's editable RAMS drafts, starting one
// from templates or other jobs, saving, saving items back to the library,
// and issuing the Risk Assessment and Method Statement as two signable docs.
import { useQuery } from '@tanstack/react-query';

import { log, tellOperatives } from '@/data/hsManager';
import { buildRamsPdf } from '@/lib/ramsPdf';
import { combineStart, defaultDetails, normaliseBuild, ramsSettings, siteClientContact, type Hazard, type LibItem, type RamsBuild, type RamsSettings, type RSection } from '@/lib/rules/rams';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { supabase } from '@/lib/supabase';
import type { Organization, Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a: object) => Promise<{ data: unknown; error: unknown }>;
type Me = Profile & { signature_path?: string | null };
type Org = (Organization & { rams_settings?: Partial<RamsSettings> | null }) | null;

export type BuildRow = { id: string; title: string; site_id: string; status: string | null; revision: number; updated_at: string };
export function useSiteBuilds(siteId: string | undefined) {
  return useQuery({ queryKey: ['ramsBuilds', siteId], enabled: !!siteId, queryFn: async () => ((await db.from('rams_builds').select('id,title,site_id,status,revision,updated_at').eq('site_id', siteId as string).order('updated_at', { ascending: false })).data as BuildRow[] | null) ?? [] });
}
export function useOrgBuilds(orgId: string | null | undefined) {
  return useQuery({ queryKey: ['ramsBuildsOrg', orgId], enabled: !!orgId, queryFn: async () => ((await db.from('rams_builds').select('id,title,site_id,status,updated_at,revision').eq('org_id', orgId as string).order('updated_at', { ascending: false }).limit(500)).data as BuildRow[] | null) ?? [] });
}
export async function loadLibrary(orgId: string | null): Promise<LibItem[]> {
  if (!orgId) return [];
  return ((await db.from('rams_library_items').select('*').eq('org_id', orgId).order('sort_order').order('title')).data as LibItem[] | null) ?? [];
}
export function useLibrary(orgId: string | null | undefined) {
  return useQuery({ queryKey: ['ramsLib', orgId], enabled: !!orgId, queryFn: () => loadLibrary(orgId ?? null) });
}
export async function loadSettings(org: Org): Promise<RamsSettings> {
  const r = org ? ((await db.from('organizations').select('rams_settings').eq('id', org.id).maybeSingle()).data as { rams_settings: Partial<RamsSettings> | null } | null) : null;
  return ramsSettings(r?.rams_settings ?? org?.rams_settings, org?.name);
}
const defaultsFor = (me: Me, site: Site | undefined, st: RamsSettings) => defaultDetails(site as never, (site && fullSiteAddress(site)) || '', me.name || '', st);

export async function loadBuild(me: Me, org: Org, site: Site | undefined, id: string): Promise<RamsBuild | null> {
  const raw = (await db.from('rams_builds').select('*').eq('id', id).maybeSingle()).data as Record<string, unknown> | null;
  if (!raw) return null;
  return normaliseBuild(raw, defaultsFor(me, site, await loadSettings(org)), siteClientContact(site as never));
}
export async function saveBuild(b: RamsBuild): Promise<boolean> {
  return !(await db.from('rams_builds').update({ title: b.title, details: b.details, hazards: b.hazards, sections: b.sections, ppe: b.ppe, updated_at: new Date().toISOString() } as never).eq('id', b.id)).error;
}

/** The database hands out the next RA / MS numbers, so two PMs never get the same one. */
async function takeNumbers(): Promise<{ ra: number; ms: number } | null> {
  try {
    const r = await rpc('rams_take_numbers', {});
    const d = r.data as { ok?: boolean; ra?: number; ms?: number } | null;
    return d && d.ok && Number(d.ra) > 0 && Number(d.ms) > 0 ? { ra: Number(d.ra), ms: Number(d.ms) } : null;
  } catch { return null; }
}
export async function createBuild(me: Me, org: Org, site: Site | undefined, siteId: string, title: string, tplIds: string[], copyIds: string[]): Promise<{ id: string; missing: string[] } | string> {
  const st = await loadSettings(org);
  const details = defaultsFor(me, site, st);
  const nums = await takeNumbers();
  if (nums) { details.raNumber = String(nums.ra).padStart(10, '0'); details.msNumber = String(nums.ms); }
  const lib = tplIds.length ? await loadLibrary(me.org_id) : [];
  const srcs = copyIds.length ? (((await db.from('rams_builds').select('*').in('id', copyIds)).data as Record<string, unknown>[] | null) ?? []).sort((x, y) => copyIds.indexOf(String(x.id)) - copyIds.indexOf(String(y.id))) : [];
  const out = combineStart(lib, tplIds, srcs as never, details);
  const r = await db.from('rams_builds').insert({ org_id: me.org_id, site_id: siteId, title, details: out.details, hazards: out.hazards, sections: out.sections, ppe: out.ppe, created_by: me.id } as never).select('id').single();
  const id = (r.data as { id: string } | null)?.id;
  if (!id) return 'Could not create the RAMS — try again.';
  // Numbers couldn't be taken up front: move the saved counter on.
  if (!nums && org) await db.from('organizations').update({ rams_settings: { ...(org.rams_settings || {}), ...st, nextRa: st.nextRa + 1, nextMs: st.nextMs + 1 } } as never).eq('id', org.id);
  log(me, siteId, 'rams_build_created', `Started RAMS "${title}"`);
  return { id, missing: out.missing };
}
export async function deleteBuild(id: string): Promise<boolean> {
  return !(await db.from('rams_builds').delete().eq('id', id)).error;
}

/** Saves a job's hazard or section back to the library (replacing a copy with the same id or name). */
export async function saveItemToLibrary(me: Me, kind: 'hazard' | 'section', it: Hazard | RSection, replace: (title: string) => Promise<boolean>): Promise<string | null> {
  const lib = await loadLibrary(me.org_id);
  const existing = lib.find((x) => x.kind === kind && (x.id === it.libId || x.title === it.title));
  const data = kind === 'hazard' ? (({ harm, p, s, rp, rs, controls }) => ({ harm, p, s, rp, rs, controls }))(it as Hazard) : (({ part, body, steps }) => ({ part, body, steps }))(it as RSection);
  if (existing) {
    if (!(await replace(existing.title))) return null;
    return (await db.from('rams_library_items').update({ title: it.title, data, updated_at: new Date().toISOString() } as never).eq('id', existing.id)).error ? 'Could not save' : existing.id;
  }
  const r = await db.from('rams_library_items').insert({ org_id: me.org_id, kind, title: it.title, data, sort_order: 999, created_by: me.id } as never).select('id').single();
  return (r.data as { id: string } | null)?.id ?? 'Could not save';
}
export async function saveAsTemplate(me: Me, b: RamsBuild, name: string): Promise<boolean> {
  const strip = <T extends { id?: string }>(x: T) => { const c = JSON.parse(JSON.stringify(x)) as T; delete c.id; return c; };
  return !(await db.from('rams_library_items').insert({ org_id: me.org_id, kind: 'template', title: name, sort_order: 999, created_by: me.id, data: { hazards: b.hazards.map(strip), sections: b.sections.map(strip), ppe: b.ppe.slice(), groups: (b.details.groups || []).slice() } } as never)).error;
}

export async function previewPdf(b: RamsBuild, which: 'ra' | 'ms', org: Org) {
  return buildRamsPdf(b, which, org, await loadSettings(org));
}
/** Issues (or re-issues) the RA and MS as two documents on the job's RAMS list. */
export async function issueBuild(me: Me, org: Org, siteId: string, b: RamsBuild): Promise<string | null> {
  const st = await loadSettings(org);
  const rev = b.revision + 1;
  const made: ['ra' | 'ms', string, string][] = [];
  for (const which of ['ra', 'ms'] as const) {
    const isRA = which === 'ra';
    if (isRA ? !b.hazards.length : !b.sections.length) continue;
    const out = await buildRamsPdf(b, which, org, st);
    const name = `${isRA ? 'Risk Assessment' : 'Method Statement'} — ${b.title}${rev > 1 ? ` (rev ${rev})` : ''}`;
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
    const up = await supabase.storage.from('rams-docs').upload(`${siteId}/rams/${rid}-${isRA ? 'RA' : 'MS'}-${b.title.replace(/[^a-z0-9.-]+/gi, '_').slice(0, 60)}.pdf`, out.bytes, { contentType: 'application/pdf' });
    if (up.error) return 'Upload failed — check signal and try again.';
    const prevId = isRA ? b.ra_doc_id : b.ms_doc_id;
    const r = await db.from('rams_docs').insert({ site_id: siteId, name, storage_path: up.data.path, uploaded_by: me.id, doc_type: isRA ? 'Risk Assessment' : 'Method Statement', supersedes: prevId || null, sign_layout: out.signLayout } as never).select('id').single();
    const id = (r.data as { id: string } | null)?.id;
    if (!id) return 'Could not save the document.';
    if (prevId) await db.from('rams_docs').update({ status: 'superseded', superseded_by: id } as never).eq('id', prevId);
    // Remember the new document straight away, so a failure on the next one never leaves two "current".
    const key = isRA ? 'ra_doc_id' : 'ms_doc_id';
    if (!(await db.from('rams_builds').update({ [key]: id } as never).eq('id', b.id)).error) b[key] = id;
    // Issuing it marks it issued straight away — by whoever issued it, with their signature.
    await db.from('rams_signatures').insert({ rams_id: id, user_id: me.id, issued: true, signature_image_path: me.signature_path || null } as never);
    made.push([which, id, name]);
  }
  const patch: Record<string, unknown> = { status: 'issued', revision: rev, issued_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  made.forEach(([w, id]) => { patch[w === 'ra' ? 'ra_doc_id' : 'ms_doc_id'] = id; });
  await db.from('rams_builds').update(patch as never).eq('id', b.id);
  made.forEach(([, , name]) => tellOperatives(me, siteId, `New RAMS published and needs signing: "${name}"`));
  log(me, siteId, 'rams_build_issued', `Issued RAMS "${b.title}" rev ${rev}`);
  return null;
}
