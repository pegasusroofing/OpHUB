// Subcontractors on a Main Contractor job (550 / 560): each company has its own
// RAMS, COSHH, Toolbox Talks, Schedule of Works items, Permits, Inspections files,
// Daily Briefings and allocated operatives. A company links to an org-level
// "library" profile so its documents carry across jobs. Only operatives allocated
// to a company can open it; that company's admin operative can upload into it.
import { useQuery } from '@tanstack/react-query';

import { orThrow } from '@/lib/offlineCache';
import { supabase } from '@/lib/supabase';
import { insuranceStatus, libCategory, parseExpiry } from '@/lib/rules/subLibrary';
import type { Profile, Site } from '@/lib/types';
import { mustHit } from '@/lib/mustHit';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a: object) => Promise<{ data: unknown; error: unknown }>;
type Asset = { uri: string; name: string; mimeType?: string | null };

export type Subco = { id: string; site_id: string; org_id: string; name: string; master_company_id: string | null };

export function useSubcos(site: Site | undefined, me: Profile | null) {
  return useQuery({
    queryKey: ['subcos', site?.id],
    enabled: !!site && !!me,
    queryFn: async () => {
      const s = site as Site;
      const [c, mine, links] = await Promise.all([
        db.from('subcontractor_companies').select('*').eq('site_id', s.id).order('created_at'),
        db.from('subcontractor_operatives').select('subcontractor_company_id').eq('site_id', s.id).eq('user_id', (me as Profile).id).limit(1),
        db.from('subcontractor_companies').select('master_company_id').eq('org_id', s.org_id as string),
      ]);
      const usage: Record<string, number> = {};
      ((links.data as { master_company_id: string | null }[] | null) ?? []).forEach((l) => { if (l.master_company_id) usage[l.master_company_id] = (usage[l.master_company_id] || 0) + 1; });
      return { companies: orThrow(c) as Subco[], myCompany: ((mine.data as { subcontractor_company_id: string }[] | null) ?? [])[0]?.subcontractor_company_id ?? null, usage };
    },
  });
}

/** Finds or creates the org's library profile by name, so the company's library documents follow it to every job. */
export async function addSubco(me: Profile, site: Site, name: string, libraryId: string | null = null): Promise<string | null> {
  let masterId: string | null = libraryId; let rowName = name;
  const ex = masterId ? [] : ((await db.from('subcontractor_company_profiles').select('id').eq('org_id', site.org_id as string).eq('name', name)).data as { id: string }[] | null) ?? [];
  if (ex.length) masterId = ex[0].id;
  else if (masterId) { /* picked from the Company Library */ }
  else {
    const via = ((await db.from('subcontractor_companies').select('master_company_id').eq('org_id', site.org_id as string).eq('name', name).not('master_company_id', 'is', null).limit(1)).data as { master_company_id: string }[] | null) ?? [];
    if (via.length) {
      masterId = via[0].master_company_id;
      const p = ((await db.from('subcontractor_company_profiles').select('name').eq('id', masterId).limit(1)).data as { name: string }[] | null) ?? [];
      if (p[0]?.name) rowName = p[0].name;
    }
  }
  // The id is made here: asking for the new row back is refused, as nobody can read a profile until a job links to it.
  if (!masterId) { const id = globalThis.crypto.randomUUID(); if (!(await db.from('subcontractor_company_profiles').insert({ id, org_id: site.org_id, name, created_by: me.id } as never)).error) masterId = id; }
  const cid = globalThis.crypto.randomUUID();
  return (await db.from('subcontractor_companies').insert({ id: cid, org_id: site.org_id, site_id: site.id, name: rowName, created_by: me.id, master_company_id: masterId } as never)).error ? null : cid;
}
/** Only when its library profile isn't shared with another job (renaming would rename it everywhere). */
export async function renameSubco(c: Subco, name: string) {
  if (!(await db.from('subcontractor_companies').update({ name } as never).eq('id', c.id).select('id')).data?.length) return false;
  if (c.master_company_id) await db.from('subcontractor_company_profiles').update({ name } as never).eq('id', c.master_company_id);
  return true;
}
export const deleteSubco = async (id: string) => !!(await db.from('subcontractor_companies').delete().eq('id', id).select('id')).data?.length;

export function useSubco(companyId: string | undefined, me: Profile | null) {
  return useQuery({
    queryKey: ['subco', companyId],
    enabled: !!companyId && !!me,
    queryFn: async () => {
      const c = ((orThrow(await db.from('subcontractor_companies').select('*').eq('id', companyId as string).limit(1)) as Subco[]) ?? [])[0] ?? null;
      if (!c) return null;
      const [rams, coshh, tbt, brief, ops, sched, permits, insp, admin, om, snags, closeout] = await Promise.all([
        db.from('rams_docs').select('id').eq('subcontractor_company_id', c.id).eq('status', 'current'),
        db.from('coshh_docs').select('id').eq('subcontractor_company_id', c.id),
        db.from('toolbox_talks').select('id').eq('subcontractor_company_id', c.id).eq('status', 'live'),
        db.from('subcontractor_briefings').select('id').eq('subcontractor_company_id', c.id),
        db.from('subcontractor_operatives').select('user_id,is_admin').eq('subcontractor_company_id', c.id),
        db.from('schedule_tasks').select('status').eq('site_id', c.site_id).eq('subcontractor_company_id', c.id),
        db.from('permits').select('id').eq('subcontractor_company_id', c.id).eq('status', 'open'),
        db.from('subcontractor_inspections').select('id').eq('subcontractor_company_id', c.id),
        db.from('subcontractor_operatives').select('id').eq('subcontractor_company_id', c.id).eq('user_id', (me as Profile).id).eq('is_admin', true).limit(1),
        // Their O&M manuals (20 Nov 2026): the database shows them to managers and the company's admin only.
        db.from('handover_om_manuals').select('submitted_at').eq('subcontractor_company_id', c.id),
        // Snags given to them (20 Nov 2026).
        db.from('snags').select('id').eq('subcontractor_company_id', c.id).eq('status', 'open'),
        // Their close-out (21 Nov 2026): signed off or not.
        db.from('subcontractor_closeouts').select('signed_at').eq('subcontractor_company_id', c.id).limit(1),
      ]);
      const n = (r: { data: unknown }) => ((r.data as unknown[] | null) ?? []).length;
      const tasks = (sched.data as { status: string }[] | null) ?? [];
      return {
        company: c, isAdmin: n(admin) > 0, hasPm: ((ops.data as { is_admin: boolean | null }[] | null) ?? []).some((x) => x.is_admin),
        // Their Project Manager(s), by name on the People tab (21 Nov 2026).
        pmIds: ((ops.data as { user_id: string | null; is_admin: boolean | null }[] | null) ?? []).filter((x) => x.is_admin && x.user_id).map((x) => x.user_id as string),
        counts: { rams: n(rams), coshh: n(coshh), tbt: n(tbt), briefings: n(brief), operatives: n(ops), tasks: tasks.length, done: tasks.filter((t) => t.status === 'done').length, permits: n(permits), inspections: n(insp), snags: n(snags), closedOut: !!((closeout.data as { signed_at: string | null }[] | null) ?? [])[0]?.signed_at, om: n(om), omSubmitted: ((om.data as { submitted_at: string | null }[] | null) ?? []).filter((x) => x.submitted_at).length },
      };
    },
  });
}

async function put(bucket: string, path: string, a: Asset, type = 'application/pdf'): Promise<string | null> {
  try {
    const up = await supabase.storage.from(bucket).upload(path, await (await fetch(a.uri)).arrayBuffer(), { contentType: a.mimeType || type });
    return up.error ? null : up.data.path;
  } catch { return null; }
}
const rid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`);
const clean = (n: string) => n.replace(/[^a-z0-9.\-]+/gi, '_');

/* Toolbox talks: a subcontractor's go straight in live (small fixed crew). */
export function useSubTbts(companyId: string | undefined) {
  return useQuery({ queryKey: ['subTbts', companyId], enabled: !!companyId, queryFn: async () => orThrow(await db.from('toolbox_talks').select('*').eq('subcontractor_company_id', companyId as string).order('created_at', { ascending: false })) as { id: string; title: string; status: string; created_at: string }[] });
}
export async function addSubTbt(me: Profile, siteId: string, companyId: string, title: string, f: Asset) {
  const path = await put('rams-docs', `${siteId}/subcontractor-tbt/${companyId}/${rid()}-${clean(f.name)}`, f);
  // org_id is required (found 21 Nov 2026: without it a subcontractor's talk never saved, in either app).
  return !!path && !(await db.from('toolbox_talks').insert({ site_id: siteId, org_id: me.org_id, subcontractor_company_id: companyId, title, storage_path: path, status: 'live', created_by: me.id } as never)).error;
}

/* Daily briefings: a title and optional PDF. */
export function useSubBriefings(companyId: string | undefined) {
  return useQuery({ queryKey: ['subBriefings', companyId], enabled: !!companyId, queryFn: async () => {
    const list = orThrow(await db.from('subcontractor_briefings').select('*').eq('subcontractor_company_id', companyId as string).order('submitted_at', { ascending: false })) as { id: string; title: string; storage_path: string | null; submitted_by: string | null; submitted_at: string; signers?: string[] | null }[];
    // Who has signed each (20 Nov 2026).
    const sigs = list.length ? (((await db.from('subcontractor_briefing_signatures').select('briefing_id,user_id,signed_at').in('briefing_id', list.map((b) => b.id))).data as { briefing_id: string; user_id: string; signed_at: string }[] | null) ?? []) : [];
    return list.map((b) => ({ ...b, sigs: sigs.filter((x) => x.briefing_id === b.id) }));
  } });
}
/** Sign a briefing you were chosen to sign (Andy, 20 Nov 2026). */
export async function signSubBriefing(me: Profile & { signature_path?: string | null }, briefingId: string): Promise<boolean> {
  return !(await db.from('subcontractor_briefing_signatures').insert({ briefing_id: briefingId, user_id: me.id, signature_image_path: me.signature_path || null } as never)).error;
}
export async function addSubBriefing(me: Profile, siteId: string, companyId: string, title: string, f: Asset | null, signers: string[] = []) {
  let path: string | null = null;
  if (f) { path = await put('rams-docs', `${siteId}/subcontractor-briefings/${companyId}/${rid()}-${clean(f.name)}`, f); if (!path) return false; }
  return !(await db.from('subcontractor_briefings').insert({ subcontractor_company_id: companyId, site_id: siteId, title, storage_path: path, submitted_by: me.id, signers: signers.length ? signers : null } as never)).error;
}
export const deleteSubBriefing = async (id: string) => !!(await db.from('subcontractor_briefings').delete().eq('id', id).select('id')).data?.length;

/* Operatives: one subcontractor company per operative per job. */
export function useSubOperatives(siteId: string | undefined, companyId: string | undefined) {
  return useQuery({
    queryKey: ['subOps', companyId],
    enabled: !!siteId && !!companyId,
    queryFn: async () => {
      const [mine, a, all, p] = await Promise.all([
        db.from('subcontractor_operatives').select('*').eq('subcontractor_company_id', companyId as string),
        db.from('site_assignments').select('user_id').eq('site_id', siteId as string),
        db.from('subcontractor_operatives').select('user_id').eq('site_id', siteId as string),
        db.from('profiles').select('id,name,role').eq('role', 'operative').order('name'),
      ]);
      const on = new Set(((a.data as { user_id: string }[] | null) ?? []).map((x) => x.user_id));
      const taken = new Set(((all.data as { user_id: string }[] | null) ?? []).map((x) => x.user_id));
      return {
        allocated: orThrow(mine) as { id: string; user_id: string; is_admin: boolean }[],
        pickable: ((p.data as { id: string; name: string }[] | null) ?? []).filter((x) => on.has(x.id) && !taken.has(x.id)),
      };
    },
  });
}
export const allocateSubOp = async (me: Profile, siteId: string, companyId: string, userId: string, admin: boolean) =>
  !(await db.from('subcontractor_operatives').insert({ site_id: siteId, subcontractor_company_id: companyId, user_id: userId, assigned_by: me.id, is_admin: admin } as never)).error;
export const setSubOpAdmin = async (id: string, admin: boolean) => !!(await db.from('subcontractor_operatives').update({ is_admin: admin } as never).eq('id', id).select('id')).data?.length;
export const removeSubOp = async (id: string) => !!(await db.from('subcontractor_operatives').delete().eq('id', id).select('id')).data?.length;

/* Their project manager sets up their company (Andy, 20 Nov 2026: "the subcontractors need a project manager by default who
   sets up their company"). A join link for one person: whoever signs up with it goes onto this job in this company (the
   project manager kind, only from our managers, makes them its project manager). Database: SQL file 11. */
export async function createSubInvite(companyId: string, admin = false, email = ''): Promise<string | null> {
  const r = await rpc('sub_invite_create', { p_company: companyId, p_admin: admin, p_email: email.trim() || null });
  const d = r.data as { ok?: boolean; invite_id?: string } | null;
  return r.error || !d?.ok || !d.invite_id ? null : d.invite_id;
}
export type SubInvite = { id: string; email: string | null; subcontractor_admin: boolean; created_at: string; expires_at: string };
export function useSubInvites(companyId: string | undefined) {
  return useQuery({ queryKey: ['subInvites', companyId], enabled: !!companyId, queryFn: async () => ((await rpc('sub_invites_open', { p_company: companyId })).data as SubInvite[] | null) ?? [] });
}
export const cancelSubInvite = async (inviteId: string) => (await rpc('sub_invite_cancel', { p_invite_id: inviteId })).data === true;
/** Their project manager takes one of their operatives off the job (not another project manager). */
export const removeMySubOp = async (rowId: string) => (await rpc('sub_remove_operative', { p_row: rowId })).data === true;
/** After an existing login joins with a subcontractor link: into the company too. */
export const claimSubInvite = async (inviteId: string) => { await rpc('sub_invite_claim', { p_invite_id: inviteId }); };
export type SubInviteInfo = { company: string; site: string; admin: boolean };
export async function subInviteInfo(inviteId: string): Promise<SubInviteInfo | null> {
  const r = await rpc('sub_invite_info', { p_invite_id: inviteId });
  return r.error || !r.data ? null : (r.data as SubInviteInfo);
}

/* Inspections: files kept exactly as chosen (never compressed); the PM is emailed each upload. */
export function useSubInspections(companyId: string | undefined, folderId: string | null) {
  return useQuery({
    queryKey: ['subInsp', companyId, folderId],
    enabled: !!companyId,
    queryFn: async () => {
      const f = db.from('subcontractor_inspections').select('*').eq('subcontractor_company_id', companyId as string);
      const [folders, files] = await Promise.all([
        folderId ? Promise.resolve({ data: [] }) : db.from('subcontractor_inspection_folders').select('id,name').eq('subcontractor_company_id', companyId as string).order('name'),
        (folderId ? f.eq('folder_id', folderId) : f.is('folder_id', null)).order('uploaded_at', { ascending: false }),
      ]);
      return { folders: (folders.data as { id: string; name: string }[] | null) ?? [], files: orThrow(files) as { id: string; file_name: string; storage_path: string; uploaded_by: string | null; uploaded_at: string }[] };
    },
  });
}
export const addSubInspFolder = async (me: Profile, siteId: string, companyId: string, name: string) =>
  !(await db.from('subcontractor_inspection_folders').insert({ org_id: me.org_id, site_id: siteId, subcontractor_company_id: companyId, name, created_by: me.id } as never)).error;
export const renameSubInspFolder = async (id: string, name: string) => !!(await db.from('subcontractor_inspection_folders').update({ name } as never).eq('id', id).select('id')).data?.length;
export async function addSubInspection(me: Profile, siteId: string, company: Subco, folderId: string | null, f: Asset): Promise<boolean> {
  const path = await put('mc-documents', `${siteId}/subcontractor-inspections/${company.id}/${rid()}-${clean(f.name)}`, f, 'application/octet-stream');
  if (!path) return false;
  const r = await db.from('subcontractor_inspections').insert({ org_id: me.org_id, site_id: siteId, subcontractor_company_id: company.id, folder_id: folderId, uploaded_by: me.id, file_name: f.name, storage_path: path, content_type: f.mimeType || null } as never);
  if (r.error) return false;
  void supabase.functions.invoke('send-subcontractor-inspection-email', { body: { site_id: siteId, company_name: company.name, file_name: f.name, storage_bucket: 'mc-documents', storage_path: path } }).catch(() => undefined);
  return true;
}
export async function deleteSubInspection(id: string, path: string) {
  const r = mustHit(await db.from('subcontractor_inspections').delete().eq('id', id).select('id'));
  if (!r.error) void supabase.storage.from('mc-documents').remove([path]).catch(() => undefined);
  return !r.error;
}

/* Schedule of Works items assigned to the company (the same rows as the main schedule). */
export function useSubSchedule(siteId: string | undefined, companyId: string | undefined) {
  return useQuery({
    queryKey: ['subSchedule', companyId],
    enabled: !!siteId && !!companyId,
    queryFn: async () => orThrow(await db.from('schedule_tasks').select('id,name,status,percent_complete').eq('site_id', siteId as string).eq('subcontractor_company_id', companyId as string).order('position', { ascending: true, nullsFirst: false }).order('created_at')) as { id: string; name: string; status: string; percent_complete: number | null }[],
  });
}

/** Am I an admin of this subcontractor company (550 isSubcontractorAdmin)? They issue and close its permits. */
export function useIsSubAdmin(companyId: string | null | undefined, me: Profile | null) {
  return useQuery({
    queryKey: ['subAdmin', companyId, me?.id], enabled: !!companyId && !!me && me.role !== 'client',
    queryFn: async () => (((await db.from('subcontractor_operatives').select('id').eq('subcontractor_company_id', companyId as string).eq('user_id', (me as Profile).id).eq('is_admin', true).limit(1)).data as unknown[] | null) ?? []).length > 0,
  });
}

/* ---------- Company Library from sign-ups; insurance; subcontractor staff (Andy, 20 Nov 2026) ---------- */
export type LibCompany = { id: string; name: string; approvedAt: string | null; contactUserId: string | null; insurance: ReturnType<typeof insuranceStatus> };
/** The company's library: each subcontractor company, approved sign-ups first, with its insurance. Managers only. */
export function useLibrary(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['subLibrary', orgId], enabled: !!orgId,
    queryFn: async (): Promise<LibCompany[]> => {
      const [p, dd] = await Promise.all([
        db.from('subcontractor_company_profiles').select('id,name,approved_at,contact_user_id').eq('org_id', orgId as string).order('name'),
        db.from('subcontractor_company_documents').select('master_company_id,category,expiry_date').eq('org_id', orgId as string),
      ]);
      const docs = (dd.data as { master_company_id: string; category: string; expiry_date: string | null }[] | null) ?? [];
      const today = new Date().toISOString().slice(0, 10);
      return (((p.data as { id: string; name: string; approved_at: string | null; contact_user_id: string | null }[] | null) ?? []).map((x) => ({
        id: x.id, name: x.name, approvedAt: x.approved_at, contactUserId: x.contact_user_id, insurance: insuranceStatus(docs.filter((d) => d.master_company_id === x.id), today),
      }))).sort((a, b) => Number(!!b.approvedAt) - Number(!!a.approvedAt) || a.name.localeCompare(b.name));
    },
  });
}
type SignUp = { id: string; company_name: string; user_id?: string | null; data: Record<string, unknown> | null; files: { label?: string; name?: string; path: string; bucket?: string }[] | null };
/**
 * Approving a sign-up sets the company up (Andy, 20 Nov 2026): its Company Library entry (found by name, or new), marked
 * approved with the person who signed it up, and their documents copied in under the right heading, with the insurance
 * expiry dates from the form. Gives how many documents went in, and any that couldn't be copied.
 */
export async function approveIntoLibrary(me: Profile, r: SignUp): Promise<{ id: string | null; added: number; failed: string[] }> {
  const org = me.org_id as string, now = new Date().toISOString();
  const ex = ((await db.from('subcontractor_company_profiles').select('id,contact_user_id').eq('org_id', org).ilike('name', r.company_name.trim())).data as { id: string; contact_user_id: string | null }[] | null) ?? [];
  let id = ex[0]?.id ?? null;
  if (id) await db.from('subcontractor_company_profiles').update({ application_id: r.id, approved_at: now, contact_user_id: ex[0].contact_user_id || r.user_id || null } as never).eq('id', id);
  else {
    id = globalThis.crypto.randomUUID();
    if ((await db.from('subcontractor_company_profiles').insert({ id, org_id: org, name: r.company_name.trim(), created_by: me.id, application_id: r.id, approved_at: now, contact_user_id: r.user_id || null } as never)).error) return { id: null, added: 0, failed: [] };
  }
  const have = new Set((((await db.from('subcontractor_company_documents').select('name').eq('master_company_id', id)).data as { name: string }[] | null) ?? []).map((x) => x.name));
  const d = r.data || {};
  let added = 0; const failed: string[] = [];
  for (const f of r.files || []) {
    const name = f.name || f.label || 'Document';
    if (have.has(name)) continue;
    const cat = libCategory(`${f.label || ''} ${f.name || ''}`);
    const expiry = cat === 'public_liability_insurance' ? parseExpiry(d.pl_expiry) : cat === 'employers_liability_insurance' ? parseExpiry(d.el_expiry) : null;
    try {
      const dl = await supabase.storage.from(f.bucket === 'subcontractor-apps' ? 'subcontractor-apps' : 'mc-documents').download(f.path);
      if (dl.error || !dl.data) throw new Error('download');
      const up = await supabase.storage.from('mc-documents').upload(`company-library/${id}/${globalThis.crypto.randomUUID()}-${name.replace(/[^a-z0-9.-]+/gi, '_')}`, await dl.data.arrayBuffer(), { contentType: dl.data.type || 'application/pdf' });
      if (up.error) throw new Error('upload');
      if ((await db.from('subcontractor_company_documents').insert({ org_id: org, master_company_id: id, category: cat, uploaded_by: me.id, name, storage_path: up.data.path, content_type: dl.data.type || null, size: dl.data.size || null, expiry_date: expiry } as never)).error) throw new Error('insert');
      added++;
    } catch { failed.push(name); }
  }
  return { id, added, failed };
}
/** Their person (who signed the company up) as the company's admin on this job: on the job, and allocated as admin. */
export async function makeSubAdmin(me: Profile, siteId: string, companyId: string, userId: string): Promise<boolean> {
  const on = ((await db.from('site_assignments').select('id').eq('site_id', siteId).eq('user_id', userId).limit(1)).data as unknown[] | null) ?? [];
  if (!on.length && (await db.from('site_assignments').insert({ site_id: siteId, user_id: userId } as never)).error) return false;
  return !(await db.from('subcontractor_operatives').insert({ site_id: siteId, subcontractor_company_id: companyId, user_id: userId, assigned_by: me.id, is_admin: true } as never)).error;
}
/** A subcontractor's person (allocated to a subcontractor company on any job): a lighter login, without our employee
 *  items (Andy, 20 Nov 2026). admin: they run their company (they fill in the company's sign-up form). */
export function useSubStaff(me: Profile | null) {
  return useQuery({
    queryKey: ['subStaff', me?.id], enabled: !!me && me.role === 'operative', staleTime: 300000,
    queryFn: async () => {
      const r = ((await db.from('subcontractor_operatives').select('is_admin').eq('user_id', (me as Profile).id)).data as { is_admin: boolean | null }[] | null) ?? [];
      return { staff: r.length > 0, admin: r.some((x) => !!x.is_admin) };
    },
  });
}
