// Main Contractor area (510 / 520 / 530): the Main Contractor page's parts with their counts
// (and what operatives see), the document folders (CPP,
// Asbestos Register, F10), and Permits To Work — issue → sign-off → close down
// (hot works needs two fire-extinguisher photos to close).
import { packDoc } from '@/data/jobPack';
import { permitAttachment } from '@/lib/pdfLazy';
import { useQuery } from '@tanstack/react-query';

import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { compressOne, type Picked } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';
import { mustHit } from '@/lib/mustHit';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Me = Profile & { signature_path?: string | null };

export const MC_DOC_LABEL: Record<string, string> = { cpp: 'Construction Phase Plan', asbestos: 'Asbestos Register', f10: 'F10 Notification' };
export const PERMIT_LABEL: Record<string, string> = { hot_works: 'Hot Works', height: 'Working at Height', acm: 'Working with ACM (Asbestos)', hazardous: 'Hazardous Areas' };
export const PERMIT_ICON: Record<string, string> = { hot_works: '🔥', height: '🪜', acm: '☣️', hazardous: '⚠️' };

/* ---------- Main Contractor made simple (app review, 21 Nov 2026; Andy: "Yes build the 2 plans please") ---------- */
// Three tabs (Before Work · People · On Site) with a set-up line at the top, in place of nine tiles. The Programme tile
// went (it's the job's Drawings › Programme folder) and Site Rules sits under Before Work for managers (operatives read
// and sign it in their induction).

/** The parts, as rows. */
export type McPart = 'cpp' | 'f10' | 'asbestos' | 'site_layout' | 'subcontractors' | 'site_inductions' | 'permits' | 'inspections';
export const MC_PART_TITLE: Record<McPart, string> = {
  cpp: MC_DOC_LABEL.cpp, f10: MC_DOC_LABEL.f10, asbestos: MC_DOC_LABEL.asbestos, site_layout: 'Site Rules & Layout',
  subcontractors: 'Subcontractors', site_inductions: 'Site Inductions', permits: 'Permits To Work', inspections: 'Inspections',
};
/** What operatives see unless a manager hides it: My Induction and Permits To Sign. Anything else only once a manager
 *  shows it to them (the row's ⋮). MC_GUARDED: the parts a link is checked against (Site Rules pages stay open for signing). */
export const MC_OP_DEFAULT: McPart[] = ['site_inductions', 'permits'];
export const MC_GUARDED = ['cpp', 'f10', 'asbestos', 'subcontractors', 'site_inductions', 'permits', 'inspections'];
type McVis = Pick<Site, 'mc_hidden_tiles' | 'mc_shown_tiles' | 'f10_not_required'>;
/** An F10 marked not required is seen by managers only, even if it was shown to operatives. */
export const mcOpSees = (site: McVis, key: string) =>
  key === 'f10' && site.f10_not_required ? false : MC_OP_DEFAULT.includes(key as McPart) ? !(site.mc_hidden_tiles ?? []).includes(key) : (site.mc_shown_tiles ?? []).includes(key);
/** Shows a part to operatives on this job, or hides it again. */
export async function setMcOpSees(siteId: string, site: McVis, key: McPart, show: boolean) {
  const flip = (list: string[] | null | undefined, add: boolean) => (add ? [...new Set([...(list ?? []), key])] : (list ?? []).filter((k) => k !== key));
  const patch = MC_OP_DEFAULT.includes(key) ? { mc_hidden_tiles: flip(site.mc_hidden_tiles, !show) } : { mc_shown_tiles: flip(site.mc_shown_tiles, show) };
  return !!(await db.from('sites').update(patch as never).eq('id', siteId).select('id')).data?.length;
}

/** Marks the job's F10 as not required, or required again (Andy, 21 Nov 2026). */
export async function setF10NotRequired(siteId: string, on: boolean) {
  return !!(await db.from('sites').update({ f10_not_required: on } as never).eq('id', siteId).select('id')).data?.length;
}

/** The five things a Main Contractor job needs before work starts ("Set Up: 3 Of 5 Done"). Each ticks itself: an F10 and
 *  an Asbestos Register uploaded (or the F10 marked not required), the Construction Phase Plan issued (or one uploaded), a Site Rules sheet or document on
 *  the job, and the company's own Induction Form saved. go: a page in the job, or an address. */
export type McSetupKey = 'f10' | 'asbestos' | 'cpp' | 'rules' | 'form';
export const MC_SETUP: { k: McSetupKey; label: string; go: string }[] = [
  { k: 'f10', label: MC_DOC_LABEL.f10, go: 'mc/docs/f10' },
  { k: 'asbestos', label: MC_DOC_LABEL.asbestos, go: 'mc/docs/asbestos' },
  { k: 'cpp', label: MC_DOC_LABEL.cpp, go: 'mc/docs/cpp' },
  { k: 'rules', label: 'Site Rules', go: 'mc/layout' },
  { k: 'form', label: 'Induction Form', go: '/pm/admin/inductionform' },
];
export function useMcSetup(siteId: string | undefined, orgId: string | null | undefined, on = true) {
  return useQuery({
    queryKey: ['mcTiles', siteId, 'setup'],
    enabled: !!siteId && !!orgId && on,
    queryFn: async () => {
      const [docs, plan, rules, form, st] = await Promise.all([
        db.from('mc_documents').select('category').eq('site_id', siteId as string).in('category', ['f10', 'asbestos', 'cpp']),
        db.from('cpp_plans').select('status').eq('site_id', siteId as string).eq('status', 'issued').limit(1),
        db.from('site_layout_docs').select('id').eq('site_id', siteId as string).limit(1),
        db.from('induction_templates').select('org_id').eq('org_id', orgId as string).limit(1),
        db.from('sites').select('f10_not_required').eq('id', siteId as string).limit(1),
      ]);
      const f10Off = !!((st.data as { f10_not_required: boolean | null }[] | null) ?? [])[0]?.f10_not_required;
      const cats = new Set(((docs.data as { category: string }[] | null) ?? []).map((d) => d.category));
      const has = (r: { data: unknown }) => ((r.data as unknown[] | null) ?? []).length > 0;
      const done: Record<McSetupKey, boolean> = { f10: cats.has('f10') || f10Off, asbestos: cats.has('asbestos'), cpp: cats.has('cpp') || has(plan), rules: has(rules), form: has(form) };
      return { done, n: Object.values(done).filter(Boolean).length, f10Off };
    },
  });
}

const rowsOf = <T,>(r: { data: unknown }) => (r.data as T[] | null) ?? [];

/* ---------- Main Contractor mode: the job home's day (21 Nov 2026) ---------- */
/** Does this person get Main Contractor mode on this job? Managers on a main contractor job: all of them, or only the
 *  people chosen in Project Settings › Site Type (Andy, 21 Nov 2026). */
export const seesMcMode = (site: Pick<Site, 'acting_as_main_contractor' | 'mc_mode_users'> | null | undefined, me: Profile | null) =>
  !!site?.acting_as_main_contractor && !!me && ['pm', 'admin', 'site_manager'].includes(me.role) && (!site.mc_mode_users || site.mc_mode_users.includes(me.id));
export type McOnSite = { company: string; ours: boolean; people: { id: string; name: string }[] };
export type McToday = {
  onSite: McOnSite[]; onSiteTotal: number;
  toInduct: { id: string; name: string; company: string }[]; inducted: number;
  permits: { id: string; type: string; location: string; workDate: string | null }[];
  rams: { id: string; name: string; company: string }[];
  briefing: { at: string } | null;
  arriving: { what: string; when: string }[];
  companies: { id: string; name: string; people: number; toInduct: number; ramsPending: number; onSite: number }[];
  variations: { id: string; title: string; value: number; coId: string; company: string }[];
};
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** Who's on site and with whom, who still needs inducting, open permits, RAMS waiting for approval, today's briefing and
 *  what's arriving today, and each subcontractor's state. For a manager on a main contractor job. */
export function useMcToday(site: Site | undefined, me: Profile | null, on = true) {
  return useQuery({
    queryKey: ['mcTiles', site?.id, 'today'],
    enabled: !!site && !!me?.org_id && on,
    queryFn: async (): Promise<McToday> => {
      const s = site as Site, today = todayIso();
      const [checks, cos, subOps, assigned, profiles, done, permits, rams, tpls, deliveries, events] = await Promise.all([
        db.from('checkins').select('user_id,type,ts').eq('site_id', s.id).order('ts', { ascending: false }).limit(1000),
        db.from('subcontractor_companies').select('id,name').eq('site_id', s.id).order('name'),
        db.from('subcontractor_operatives').select('user_id,subcontractor_company_id').eq('site_id', s.id),
        db.from('site_assignments').select('user_id').eq('site_id', s.id),
        db.from('profiles').select('id,name,role').eq('org_id', (me as Profile).org_id as string),
        db.from('site_induction_completions').select('operative_id').eq('site_id', s.id),
        db.from('permits').select('id,permit_type,location,work_date').eq('site_id', s.id).eq('status', 'open').order('work_date'),
        db.from('rams_docs').select('id,name,subcontractor_company_id').eq('site_id', s.id).eq('approval_status', 'pending'),
        db.from('report_templates').select('id').eq('org_id', (me as Profile).org_id as string).eq('is_daily_briefing', true).eq('archived', false),
        db.from('delivery_tasks').select('description,time_slot,status').eq('site_id', s.id).eq('scheduled_date', today),
        db.from('site_calendar_events').select('title').eq('site_id', s.id).eq('event_date', today),
      ]);
      const subVars = rowsOf<{ id: string; title: string; value: number; subcontractor_company_id: string }>(await db.from('fin_sub_variations').select('id,title,value,subcontractor_company_id').eq('site_id', s.id).eq('status', 'requested').order('requested_at'));
      const names: Record<string, { name: string; role: string }> = {};
      rowsOf<{ id: string; name: string | null; role: string }>(profiles).forEach((p) => { names[p.id] = { name: p.name || 'Someone', role: p.role }; });
      const coName: Record<string, string> = {}; rowsOf<{ id: string; name: string }>(cos).forEach((c) => { coName[c.id] = c.name; });
      const coOf: Record<string, string> = {}; rowsOf<{ user_id: string; subcontractor_company_id: string }>(subOps).forEach((o) => { coOf[o.user_id] = o.subcontractor_company_id; });
      // On site: each person's latest check-in or out on this job.
      const latest: Record<string, string> = {};
      rowsOf<{ user_id: string; type: string }>(checks).forEach((c) => { if (!(c.user_id in latest)) latest[c.user_id] = c.type; });
      const inNow = Object.keys(latest).filter((u) => latest[u] === 'in');
      const groups: Record<string, McOnSite> = {};
      inNow.forEach((u) => {
        const co = coOf[u]; const key = co || 'ours';
        (groups[key] = groups[key] || { company: co ? coName[co] || 'Subcontractor' : 'Ours', ours: !co, people: [] }).people.push({ id: u, name: names[u]?.name || 'Someone' });
      });
      const onSite = Object.values(groups).sort((x, y) => (x.ours ? -1 : y.ours ? 1 : y.people.length - x.people.length));
      // To induct: our operatives on the job and everyone in its subcontractors, not yet inducted here.
      const doneSet = new Set(rowsOf<{ operative_id: string }>(done).map((d) => d.operative_id));
      const crew = new Set([...rowsOf<{ user_id: string }>(assigned).map((x) => x.user_id).filter((u) => !names[u] || names[u].role === 'operative'), ...Object.keys(coOf)]);
      const toInduct = [...crew].filter((u) => !doneSet.has(u)).map((u) => ({ id: u, name: names[u]?.name || 'Someone', company: coOf[u] ? coName[coOf[u]] || 'Subcontractor' : 'Ours' }));
      const tIds = rowsOf<{ id: string }>(tpls).map((t) => t.id);
      const br = tIds.length ? rowsOf<{ created_at: string; submitted_at: string | null }>(await db.from('report_submissions').select('created_at,submitted_at').eq('site_id', s.id).in('template_id', tIds).gte('created_at', `${today}T00:00:00`).order('created_at').limit(1)) : [];
      const ramsList = rowsOf<{ id: string; name: string; subcontractor_company_id: string | null }>(rams).map((r) => ({ id: r.id, name: r.name, company: r.subcontractor_company_id ? coName[r.subcontractor_company_id] || 'Subcontractor' : 'Ours' }));
      return {
        onSite, onSiteTotal: inNow.length,
        toInduct, inducted: [...crew].filter((u) => doneSet.has(u)).length,
        permits: rowsOf<{ id: string; permit_type: string | null; location: string | null; work_date: string | null }>(permits).map((p) => ({ id: p.id, type: p.permit_type || 'Permit', location: p.location || '', workDate: p.work_date })),
        rams: ramsList,
        briefing: br[0] ? { at: new Date(br[0].submitted_at || br[0].created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) } : null,
        arriving: [
          ...rowsOf<{ description: string | null; time_slot: string | null; status: string | null }>(deliveries).filter((d) => d.status !== 'cancelled').map((d) => ({ what: d.description || 'Delivery', when: d.time_slot || 'Today' })),
          ...rowsOf<{ title: string }>(events).map((e) => ({ what: e.title, when: 'Today' })),
        ],
        variations: subVars.map((v) => ({ id: v.id, title: v.title, value: Number(v.value || 0), coId: v.subcontractor_company_id, company: coName[v.subcontractor_company_id] || 'Subcontractor' })),
        companies: rowsOf<{ id: string; name: string }>(cos).map((c) => {
          const ppl = Object.keys(coOf).filter((u) => coOf[u] === c.id);
          return { id: c.id, name: c.name, people: ppl.length, toInduct: ppl.filter((u) => !doneSet.has(u)).length, ramsPending: ramsList.filter((r) => r.company === c.name).length, onSite: ppl.filter((u) => latest[u] === 'in').length };
        }),
      };
    },
  });
}

/** The Main Contractor page's counts; for an operative, whether they're inducted and how many permits wait for them. */
export function useMcHome(site: Site | undefined, me: Profile | null) {
  return useQuery({
    queryKey: ['mcTiles', site?.id, me?.id],
    enabled: !!site && !!me?.org_id,
    queryFn: async () => {
      const s = site as Site, uid = (me as Profile).id;
      const [docs, cos, assigned, done, permits, tpls, layout, people, plan, mine] = await Promise.all([
        db.from('mc_documents').select('category').eq('site_id', s.id).neq('category', 'site_inductions'),
        db.from('subcontractor_companies').select('id').eq('site_id', s.id),
        db.from('site_assignments').select('user_id').eq('site_id', s.id),
        db.from('site_induction_completions').select('operative_id').eq('site_id', s.id),
        db.from('permits').select('id,assigned_user_ids').eq('site_id', s.id).eq('status', 'open'),
        db.from('report_templates').select('id').eq('org_id', (me as Profile).org_id as string).eq('is_mc_inspection', true).eq('archived', false),
        db.from('site_layout_docs').select('id').eq('site_id', s.id),
        db.from('profiles').select('id,role'),
        db.from('cpp_plans').select('status,version').eq('site_id', s.id).order('updated_at', { ascending: false }).limit(1),
        db.from('permit_signoffs').select('permit_id').eq('user_id', uid),
      ]);
      const count: Record<string, number> = {};
      rowsOf<{ category: string }>(docs).forEach((d) => { count[d.category] = (count[d.category] || 0) + 1; });
      const roles = Object.fromEntries(rowsOf<{ id: string; role: string }>(people).map((p) => [p.id, p.role]));
      const roster = new Set(rowsOf<{ user_id: string }>(assigned).map((a) => a.user_id).filter((u) => !roles[u] || roles[u] === 'operative'));
      const doneIds = new Set(rowsOf<{ operative_id: string }>(done).map((c) => c.operative_id));
      const tplIds = rowsOf<{ id: string }>(tpls).map((t) => t.id);
      const insp = tplIds.length ? await db.from('report_submissions').select('id').eq('site_id', s.id).in('template_id', tplIds) : { data: [] };
      const signed = new Set(rowsOf<{ permit_id: string }>(mine).map((x) => x.permit_id));
      const open = rowsOf<{ id: string; assigned_user_ids: string[] | null }>(permits);
      return {
        docs: count,
        cpp: rowsOf<{ status: string; version: number }>(plan)[0] ?? null,
        companies: rowsOf(cos).length,
        rosterSize: roster.size, inducted: [...doneIds].filter((x) => roster.has(x)).length, completions: doneIds.size,
        openPermits: open.length, templates: tplIds.length, inspections: rowsOf(insp).length, layout: rowsOf(layout).length,
        meInducted: doneIds.has(uid),
        toSign: open.filter((p) => (p.assigned_user_ids ?? []).includes(uid) && !signed.has(p.id)).length,
      };
    },
  });
}

/** Everyone on a Main Contractor job, ours and the subcontractors' operatives, each with Inducted and Signed Site Rules. */
export type McPerson = { id: string; company: string | null; inducted: boolean; rules: boolean };
export function useMcPeople(siteId: string | undefined, on: boolean) {
  return useQuery({
    queryKey: ['mcTiles', siteId, 'people'],
    enabled: !!siteId && on,
    queryFn: async () => {
      const [assigned, subOps, cos, done, docs, people] = await Promise.all([
        db.from('site_assignments').select('user_id').eq('site_id', siteId as string),
        db.from('subcontractor_operatives').select('user_id,subcontractor_company_id').eq('site_id', siteId as string),
        db.from('subcontractor_companies').select('id,name').eq('site_id', siteId as string),
        db.from('site_induction_completions').select('operative_id').eq('site_id', siteId as string),
        db.from('site_layout_docs').select('id').eq('site_id', siteId as string),
        db.from('profiles').select('id,role'),
      ]);
      const roles = Object.fromEntries(rowsOf<{ id: string; role: string }>(people).map((p) => [p.id, p.role]));
      const coName = Object.fromEntries(rowsOf<{ id: string; name: string }>(cos).map((c) => [c.id, c.name]));
      const companyOf: Record<string, string> = {};
      rowsOf<{ user_id: string | null; subcontractor_company_id: string }>(subOps).forEach((o) => { if (o.user_id) companyOf[o.user_id] = coName[o.subcontractor_company_id] || ''; });
      const ids = [...new Set([...rowsOf<{ user_id: string }>(assigned).map((a) => a.user_id).filter((u) => !roles[u] || roles[u] === 'operative'), ...Object.keys(companyOf)])];
      const doneIds = new Set(rowsOf<{ operative_id: string }>(done).map((c) => c.operative_id));
      const ruleIds = rowsOf<{ id: string }>(docs).map((d) => d.id);
      const sigs = ruleIds.length && ids.length ? rowsOf<{ layout_id: string; user_id: string }>(await db.from('site_layout_signatures').select('layout_id,user_id').in('layout_id', ruleIds)) : [];
      const signedBy: Record<string, Set<string>> = {};
      sigs.forEach((x) => { (signedBy[x.user_id] ??= new Set()).add(x.layout_id); });
      const out: McPerson[] = ids.map((id) => ({ id, company: companyOf[id] || null, inducted: doneIds.has(id), rules: !!ruleIds.length && ruleIds.every((r) => signedBy[id]?.has(r)) }));
      return { people: out, hasRules: ruleIds.length > 0 };
    },
  });
}

/* ---------- document folders (CPP / Asbestos / F10) ---------- */
export type McDoc = { id: string; name: string; storage_path: string; uploaded_by: string | null; uploaded_at: string };
export function useMcDocs(siteId: string | undefined, category: string) {
  return useQuery({
    queryKey: ['mcDocs', siteId, category],
    enabled: !!siteId,
    queryFn: () => cachedQuery(`mcDocs:${siteId}:${category}`, async () => orThrow(await db.from('mc_documents').select('*').eq('site_id', siteId as string).eq('category', category).order('uploaded_at', { ascending: false })) as McDoc[]),
  });
}
export async function uploadMcDoc(me: Profile, siteId: string, category: string, name: string, file: { uri: string; name: string }): Promise<boolean> {
  const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  try {
    const up = await supabase.storage.from('mc-documents').upload(`${siteId}/${category}/${rid}-${file.name.replace(/[^a-z0-9.\-]+/gi, '_')}`, await (await fetch(file.uri)).arrayBuffer(), { contentType: 'application/pdf' });
    if (up.error) return false;
    return !(await db.from('mc_documents').insert({ org_id: me.org_id, site_id: siteId, category, name, storage_path: up.data.path, uploaded_by: me.id } as never)).error;
  } catch { return false; }
}
export const renameMcDoc = async (id: string, name: string) => !!(await db.from('mc_documents').update({ name } as never).eq('id', id).select('id')).data?.length;
export async function deleteMcDoc(d: McDoc) {
  const r = mustHit(await db.from('mc_documents').delete().eq('id', d.id).select('id'));
  if (!r.error) void supabase.storage.from('mc-documents').remove([d.storage_path]).catch(() => undefined);
  return !r.error;
}

/* ---------- Permits To Work ---------- */
export type Permit = {
  id: string; site_id: string; subcontractor_company_id: string | null; permit_type: string; description: string | null; location: string | null; work_date: string | null;
  assigned_user_ids: string[] | null; issued_by: string | null; issued_at: string; issuer_signature_path: string | null; status: string;
  closed_by: string | null; closed_at: string | null; closed_notes: string | null; closer_signature_path: string | null; closedown_photo_path_1: string | null; closedown_photo_path_2: string | null;
};
export type Signoff = { id: string; permit_id: string; user_id: string; signature_image_path: string | null; signed_at: string };

export function usePermits(siteId: string | undefined, status: 'open' | 'closed', companyId: string | null = null) {
  return useQuery({
    queryKey: ['permits', siteId, status, companyId],
    enabled: !!siteId,
    queryFn: async () => {
      const [p, c] = await Promise.all([
        (companyId ? db.from('permits').select('*').eq('site_id', siteId as string).eq('subcontractor_company_id', companyId) : db.from('permits').select('*').eq('site_id', siteId as string)).eq('status', status).order('created_at', { ascending: false }),
        db.from('subcontractor_companies').select('id,name').eq('site_id', siteId as string),
      ]);
      return { permits: orThrow(p) as Permit[], companies: (c.data as { id: string; name: string }[] | null) ?? [] };
    },
  });
}
export function usePermit(id: string | undefined) {
  return useQuery({
    queryKey: ['permit', id],
    enabled: !!id,
    queryFn: async () => {
      const [p, s] = await Promise.all([db.from('permits').select('*').eq('id', id as string).limit(1), db.from('permit_signoffs').select('*').eq('permit_id', id as string)]);
      const permit = ((orThrow(p) as Permit[]) ?? [])[0] ?? null;
      const co = permit?.subcontractor_company_id ? ((await db.from('subcontractor_companies').select('name').eq('id', permit.subcontractor_company_id).limit(1)).data as { name: string }[] | null)?.[0]?.name ?? null : null;
      return { permit, signoffs: orThrow(s) as Signoff[], company: co };
    },
  });
}
/** Who can be asked to sign: the chosen subcontractor's operatives, or the job's operatives. */
export async function permitRoster(siteId: string, companyId: string | null) {
  const p = ((await db.from('profiles').select('id,name,role').order('name')).data as { id: string; name: string; role: string }[] | null) ?? [];
  if (companyId) {
    const ids = new Set((((await db.from('subcontractor_operatives').select('user_id').eq('subcontractor_company_id', companyId)).data as { user_id: string }[] | null) ?? []).map((x) => x.user_id));
    return p.filter((x) => ids.has(x.id));
  }
  const ids = new Set((((await db.from('site_assignments').select('user_id').eq('site_id', siteId)).data as { user_id: string }[] | null) ?? []).map((x) => x.user_id));
  return p.filter((x) => ids.has(x.id) && x.role === 'operative');
}

const say = (me: Profile, siteId: string, kind: string, body: string, action: string, desc: string, details?: object | null) => {
  if (!me.org_id) return;
  void db.from('messages').insert({ org_id: me.org_id, site_id: siteId, sender_id: me.id, audience: 'managers', kind, body, ...(details ? { email_details: details } : {}) } as never).then(undefined, () => undefined);
  void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action, description: desc } as never).then(undefined, () => undefined);
};

export async function issuePermit(me: Me, site: Site, f: { type: string; companyId: string | null; assignees: string[]; description: string; date: string | null; location: string }): Promise<boolean> {
  const r = await db.from('permits').insert({
    org_id: site.org_id, site_id: site.id, subcontractor_company_id: f.companyId, permit_type: f.type, description: f.description, location: f.location,
    work_date: f.date, assigned_user_ids: f.assignees, issued_by: me.id, issuer_signature_path: me.signature_path,
  } as never).select('id').single();
  if (r.error) return false;
  const file = await permitAttachment((r.data as { id: string }).id, PERMIT_LABEL[f.type]);
  say(me, site.id, 'permit_issued', `${me.name} issued a ${PERMIT_LABEL[f.type]} permit`, 'permit_issued', `Issued a ${PERMIT_LABEL[f.type]} permit`, file ? { attachments: [file] } : null);
  return true;
}
export async function signPermit(me: Me, permitId: string) {
  return !(await db.from('permit_signoffs').insert({ permit_id: permitId, user_id: me.id, signature_image_path: me.signature_path } as never)).error;
}

async function upPhoto(siteId: string, permitId: string, n: number, p: Picked): Promise<string | null> {
  try {
    const uri = await compressOne(p);
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
    const up = await supabase.storage.from('site-photos').upload(`${siteId}/permits/${permitId}-ext${n}-${rid}.jpg`, await (await fetch(uri)).arrayBuffer(), { contentType: 'image/jpeg' });
    return up.error ? null : up.data.path;
  } catch { return null; }
}
/** overrideNote: set when a manager closes it with signatures still missing (recorded on the permit and in the history). */
export async function closePermit(me: Me, p: Permit, f: { photo1: Picked | null; photo2: Picked | null; notes: string; overrideNote: string }): Promise<string | null> {
  const hot = p.permit_type === 'hot_works';
  const ph1 = f.photo1 ? await upPhoto(p.site_id, p.id, 1, f.photo1) : null;
  const ph2 = f.photo2 ? await upPhoto(p.site_id, p.id, 2, f.photo2) : null;
  if (hot && (!ph1 || !ph2)) return 'One or both fire-extinguisher photos failed to upload — check your connection and try again before closing.';
  const r = mustHit(await db.from('permits').update({
    status: 'closed', closed_by: me.id, closed_at: new Date().toISOString(), closed_notes: [f.notes, f.overrideNote].filter(Boolean).join('\n') || null,
    closer_signature_path: me.signature_path, closedown_photo_path_1: ph1, closedown_photo_path_2: ph2,
  } as never).eq('id', p.id).select('id'));
  if (r.error) return 'Could not close — try again.';
  const file = await permitAttachment(p.id, PERMIT_LABEL[p.permit_type] || 'Permit');
  say(me, p.site_id, 'permit_closed', `${me.name} closed a permit`, 'permit_closed', `Closed a ${PERMIT_LABEL[p.permit_type] || ''} permit${f.overrideNote ? ` — ${f.overrideNote}` : ''}`, file ? { attachments: [file] } : null);
  if (file) packDoc(p.site_id, 'permit_closed', file.name, file.bucket, file.path);
  return null;
}

/* ---------- MC inspections (530): report templates flagged is_mc_inspection ---------- */
export function useMcInspections(siteId: string | undefined, orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['mcInspections', siteId],
    enabled: !!siteId && !!orgId,
    queryFn: async () => {
      const t = orThrow(await db.from('report_templates').select('*').eq('org_id', orgId as string).eq('is_mc_inspection', true).eq('archived', false).order('name')) as { id: string; name: string; description: string | null; sections: never }[];
      const subs = t.length ? orThrow(await db.from('report_submissions').select('id,template_name,status,submitted_by,submitted_at').eq('site_id', siteId as string).in('template_id', t.map((x) => x.id)).order('submitted_at', { ascending: false }).limit(100)) as { id: string; template_name: string; status: string; submitted_by: string | null; submitted_at: string | null }[] : [];
      return { templates: t, subs };
    },
  });
}

/** Subcontractors' own inspection files, grouped per company for the site's Inspections page (530). Managers only. */
export type SubInspFile = { id: string; file_name: string; storage_path: string; folder_id: string | null; uploaded_by: string | null; uploaded_at: string; subcontractor_company_id: string };
export function useSubInspectionsByCompany(siteId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['mcSubInsp', siteId],
    enabled: !!siteId && enabled,
    queryFn: async () => {
      const cos = ((await db.from('subcontractor_companies').select('id,name').eq('site_id', siteId as string).order('name')).data as { id: string; name: string }[] | null) ?? [];
      if (!cos.length) return [];
      const ids = cos.map((c) => c.id);
      const [files, folders] = await Promise.all([
        db.from('subcontractor_inspections').select('id,file_name,storage_path,folder_id,uploaded_by,uploaded_at,subcontractor_company_id').in('subcontractor_company_id', ids).order('uploaded_at', { ascending: false }),
        db.from('subcontractor_inspection_folders').select('id,name').in('subcontractor_company_id', ids),
      ]);
      const all = (files.data as SubInspFile[] | null) ?? [];
      const folderName: Record<string, string> = {};
      ((folders.data as { id: string; name: string }[] | null) ?? []).forEach((f) => { folderName[f.id] = f.name; });
      return cos.map((c) => ({ ...c, files: all.filter((f) => f.subcontractor_company_id === c.id), folderName })).filter((c) => c.files.length);
    },
  });
}
