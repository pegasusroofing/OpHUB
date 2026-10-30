// Subcontractors on a Main Contractor job (550 / 560): each company has its own
// RAMS, COSHH, Toolbox Talks, Schedule of Works items, Permits, Inspections files,
// Daily Briefings and allocated operatives. A company links to an org-level
// "library" profile so its documents carry across jobs. Only operatives allocated
// to a company can open it; that company's admin operative can upload into it.
import { useQuery } from '@tanstack/react-query';

import { orThrow } from '@/lib/offlineCache';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';
import { mustHit } from '@/lib/mustHit';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
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
export async function addSubco(me: Profile, site: Site, name: string): Promise<boolean> {
  let masterId: string | null = null; let rowName = name;
  const ex = ((await db.from('subcontractor_company_profiles').select('id').eq('org_id', site.org_id as string).eq('name', name)).data as { id: string }[] | null) ?? [];
  if (ex.length) masterId = ex[0].id;
  else {
    const via = ((await db.from('subcontractor_companies').select('master_company_id').eq('org_id', site.org_id as string).eq('name', name).not('master_company_id', 'is', null).limit(1)).data as { master_company_id: string }[] | null) ?? [];
    if (via.length) {
      masterId = via[0].master_company_id;
      const p = ((await db.from('subcontractor_company_profiles').select('name').eq('id', masterId).limit(1)).data as { name: string }[] | null) ?? [];
      if (p[0]?.name) rowName = p[0].name;
    }
  }
  if (!masterId) masterId = ((await db.from('subcontractor_company_profiles').insert({ org_id: site.org_id, name, created_by: me.id } as never).select('id').single()).data as { id: string } | null)?.id ?? null;
  return !(await db.from('subcontractor_companies').insert({ org_id: site.org_id, site_id: site.id, name: rowName, created_by: me.id, master_company_id: masterId } as never)).error;
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
      const [rams, coshh, tbt, brief, ops, sched, permits, insp, admin] = await Promise.all([
        db.from('rams_docs').select('id').eq('subcontractor_company_id', c.id).eq('status', 'current'),
        db.from('coshh_docs').select('id').eq('subcontractor_company_id', c.id),
        db.from('toolbox_talks').select('id').eq('subcontractor_company_id', c.id).eq('status', 'live'),
        db.from('subcontractor_briefings').select('id').eq('subcontractor_company_id', c.id),
        db.from('subcontractor_operatives').select('user_id').eq('subcontractor_company_id', c.id),
        db.from('schedule_tasks').select('status').eq('site_id', c.site_id).eq('subcontractor_company_id', c.id),
        db.from('permits').select('id').eq('subcontractor_company_id', c.id).eq('status', 'open'),
        db.from('subcontractor_inspections').select('id').eq('subcontractor_company_id', c.id),
        db.from('subcontractor_operatives').select('id').eq('subcontractor_company_id', c.id).eq('user_id', (me as Profile).id).eq('is_admin', true).limit(1),
      ]);
      const n = (r: { data: unknown }) => ((r.data as unknown[] | null) ?? []).length;
      const tasks = (sched.data as { status: string }[] | null) ?? [];
      return {
        company: c, isAdmin: n(admin) > 0,
        counts: { rams: n(rams), coshh: n(coshh), tbt: n(tbt), briefings: n(brief), operatives: n(ops), tasks: tasks.length, done: tasks.filter((t) => t.status === 'done').length, permits: n(permits), inspections: n(insp) },
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
  return !!path && !(await db.from('toolbox_talks').insert({ site_id: siteId, subcontractor_company_id: companyId, title, storage_path: path, status: 'live', created_by: me.id } as never)).error;
}

/* Daily briefings: a title and optional PDF. */
export function useSubBriefings(companyId: string | undefined) {
  return useQuery({ queryKey: ['subBriefings', companyId], enabled: !!companyId, queryFn: async () => orThrow(await db.from('subcontractor_briefings').select('*').eq('subcontractor_company_id', companyId as string).order('submitted_at', { ascending: false })) as { id: string; title: string; storage_path: string | null; submitted_by: string | null; submitted_at: string }[] });
}
export async function addSubBriefing(me: Profile, siteId: string, companyId: string, title: string, f: Asset | null) {
  let path: string | null = null;
  if (f) { path = await put('rams-docs', `${siteId}/subcontractor-briefings/${companyId}/${rid()}-${clean(f.name)}`, f); if (!path) return false; }
  return !(await db.from('subcontractor_briefings').insert({ subcontractor_company_id: companyId, site_id: siteId, title, storage_path: path, submitted_by: me.id } as never)).error;
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
