// Main Contractor area (510 / 520 / 530): the MC home tiles with their counts
// (and the per-job "hide from operatives" list), the document folders (CPP,
// Asbestos Register, F10), and Permits To Work — issue → sign-off → close down
// (hot works needs two fire-extinguisher photos to close).
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

export function useMcTiles(site: Site | undefined, orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['mcTiles', site?.id],
    enabled: !!site && !!orgId,
    queryFn: async () => {
      const s = site as Site;
      const [docs, prog, cos, assigned, done, permits, tpls, layout, people] = await Promise.all([
        db.from('mc_documents').select('category').eq('site_id', s.id).neq('category', 'site_inductions'),
        db.from('drawing_folders').select('id').eq('site_id', s.id).is('parent_id', null).eq('name', 'Main Contractor Programme'),
        db.from('subcontractor_companies').select('id').eq('site_id', s.id),
        db.from('site_assignments').select('user_id').eq('site_id', s.id),
        db.from('site_induction_completions').select('operative_id').eq('site_id', s.id),
        db.from('permits').select('id').eq('site_id', s.id).eq('status', 'open'),
        db.from('report_templates').select('id').eq('org_id', orgId as string).eq('is_mc_inspection', true).eq('archived', false),
        db.from('site_layout_docs').select('id').eq('site_id', s.id),
        db.from('profiles').select('id,role'),
      ]);
      const count: Record<string, number> = {};
      ((docs.data as { category: string }[] | null) ?? []).forEach((d) => { count[d.category] = (count[d.category] || 0) + 1; });
      const roles = Object.fromEntries(((people.data as { id: string; role: string }[] | null) ?? []).map((p) => [p.id, p.role]));
      const roster = new Set(((assigned.data as { user_id: string }[] | null) ?? []).map((a) => a.user_id).filter((u) => !roles[u] || roles[u] === 'operative'));
      const doneIds = new Set(((done.data as { operative_id: string }[] | null) ?? []).map((c) => c.operative_id));
      const tplIds = ((tpls.data as { id: string }[] | null) ?? []).map((t) => t.id);
      const progId = ((prog.data as { id: string }[] | null) ?? [])[0]?.id ?? null;
      const [insp, progFiles] = await Promise.all([
        tplIds.length ? db.from('report_submissions').select('id').eq('site_id', s.id).in('template_id', tplIds) : Promise.resolve({ data: [] }),
        progId ? db.from('drawing_files').select('id').eq('site_id', s.id).eq('folder_id', progId).eq('status', 'current') : Promise.resolve({ data: [] }),
      ]);
      const n = (k: string) => `${count[k] || 0} document${(count[k] || 0) === 1 ? '' : 's'}`;
      const open = ((permits.data as unknown[] | null) ?? []).length;
      const nInsp = ((insp.data as unknown[] | null) ?? []).length;
      const nProg = ((progFiles.data as unknown[] | null) ?? []).length;
      const nLayout = ((layout.data as unknown[] | null) ?? []).length;
      const nCos = ((cos.data as unknown[] | null) ?? []).length;
      return {
        progFolderId: progId,
        tiles: [
          { key: 'cpp', icon: '📘', title: MC_DOC_LABEL.cpp, sub: n('cpp') },
          { key: 'site_layout', icon: '🗺', title: 'Site Rules & Layout', sub: `${nLayout} document${nLayout === 1 ? '' : 's'}` },
          { key: 'site_inductions', icon: '🪪', title: 'Site Inductions', sub: roster.size ? `${[...doneIds].filter((x) => roster.has(x)).length} of ${roster.size} inducted` : `${doneIds.size} completed` },
          { key: 'subcontractors', icon: '👷', title: 'Subcontractors', sub: `${nCos} compan${nCos === 1 ? 'y' : 'ies'}` },
          { key: 'permits', icon: '🧾', title: 'Permits To Work', sub: open ? `${open} open` : 'None open' },
          { key: 'inspections', icon: '🔍', title: 'Inspections', sub: nInsp ? `${nInsp} logged` : tplIds.length ? 'None logged yet' : 'Set up templates' },
          { key: 'asbestos', icon: '☣️', title: MC_DOC_LABEL.asbestos, sub: n('asbestos') },
          { key: 'f10', icon: '📮', title: MC_DOC_LABEL.f10, sub: n('f10') },
          { key: 'programme', icon: '📅', title: 'Programme', sub: `${nProg} document${nProg === 1 ? '' : 's'}` },
        ],
      };
    },
  });
}

export async function setMcTileHidden(siteId: string, current: string[], key: string, hide: boolean) {
  const next = hide ? [...new Set([...current, key])] : current.filter((k) => k !== key);
  return !!(await db.from('sites').update({ mc_hidden_tiles: next } as never).eq('id', siteId).select('id')).data?.length;
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

const say = (me: Profile, siteId: string, kind: string, body: string, action: string, desc: string) => {
  if (!me.org_id) return;
  void db.from('messages').insert({ org_id: me.org_id, site_id: siteId, sender_id: me.id, audience: 'managers', kind, body } as never).then(undefined, () => undefined);
  void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action, description: desc } as never).then(undefined, () => undefined);
};

export async function issuePermit(me: Me, site: Site, f: { type: string; companyId: string | null; assignees: string[]; description: string; date: string | null; location: string }): Promise<boolean> {
  const r = await db.from('permits').insert({
    org_id: site.org_id, site_id: site.id, subcontractor_company_id: f.companyId, permit_type: f.type, description: f.description, location: f.location,
    work_date: f.date, assigned_user_ids: f.assignees, issued_by: me.id, issuer_signature_path: me.signature_path,
  } as never);
  if (r.error) return false;
  say(me, site.id, 'permit_issued', `${me.name} issued a ${PERMIT_LABEL[f.type]} permit`, 'permit_issued', `Issued a ${PERMIT_LABEL[f.type]} permit`);
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
  say(me, p.site_id, 'permit_closed', `${me.name} closed a permit`, 'permit_closed', `Closed a ${PERMIT_LABEL[p.permit_type] || ''} permit${f.overrideNote ? ` — ${f.overrideNote}` : ''}`);
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
