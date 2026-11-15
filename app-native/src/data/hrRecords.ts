// HR › Employee Records: each person's folder (hr_records, hr_docs, hr_history, hr_goals, hr_feedback, hr_appraisals,
// hr_bonuses; files in the private hr-docs store as <org>/<person>/<file>). The database decides who sees what
// (15 Nov 2026, Andy: "I can't have everyone seeing everyone's contracts"): the HR team everything (until a company
// chooses one, its company admins); the person their own (not private notes or hidden documents); a line manager only
// the parts the HR team allows (performance and emergency contact unless changed; never contracts, pay, right to work,
// bonus or disciplinary). HR files can be copied to an OneDrive folder the HR team chooses (hr-onedrive-copy).
import { useQuery } from '@tanstack/react-query';

import { usePeople } from '@/data/hs';
import type { Appraisal, HrDoc, HrRecord } from '@/lib/rules/hrRecords';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { invokeAsUser } from '@/lib/userFunctions';

const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a?: object) => Promise<{ data: unknown; error: unknown }>;

/** What the signed-in person may do in HR. */
export type HrOneDrive = { id: string; name: string; driveId: string | null; on: boolean };
export type HrAccess = { team: boolean; team_set: boolean; lm_sections: string[]; appraisal_months: number; onedrive: HrOneDrive | null };
export function useHrAccess(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['hrAccess', orgId], enabled: !!orgId,
    queryFn: async (): Promise<HrAccess> => {
      const r = await rpc('hr_my_access');
      const d = (r.data && !Array.isArray(r.data) ? r.data : {}) as Partial<HrAccess>;
      return { team: !!d.team, team_set: !!d.team_set, lm_sections: d.lm_sections ?? ['performance', 'emergency'], appraisal_months: Number(d.appraisal_months) || 12, onedrive: d.onedrive ?? null };
    },
  });
}
/** The HR team (only they open everyone's folders). */
export function useHrTeam(orgId: string | null | undefined) {
  return useQuery({ queryKey: ['hrTeam', orgId], enabled: !!orgId, queryFn: async () => rows<{ user_id: string; added_at: string }>(await db.from('hr_team').select('user_id,added_at').eq('org_id', orgId as string)) });
}
export const addToHrTeam = async (me: Profile, userId: string) => !(await db.from('hr_team').insert({ org_id: me.org_id, user_id: userId, added_by: me.id } as never)).error;
export const removeFromHrTeam = async (me: Profile, userId: string) => !!((await db.from('hr_team').delete().eq('org_id', me.org_id as string).eq('user_id', userId).select('user_id')).data as unknown[] | null)?.length;
/** The HR team's settings; anything left out stays as it is. */
export async function saveHrSettings(s: { months?: number; lmSections?: string[]; onedrive?: HrOneDrive; clearOneDrive?: boolean }): Promise<boolean> {
  const r = await rpc('hr_save_settings', { p_months: s.months ?? null, p_lm_sections: s.lmSections ?? null, p_onedrive: s.onedrive ?? null, p_clear_onedrive: !!s.clearOneDrive });
  return !r.error;
}
/** The people the signed-in person line-manages. */
export function useMyReports(on: boolean) {
  return useQuery({ queryKey: ['hrMyReports'], enabled: on, queryFn: async () => { const r = await rpc('hr_my_reports'); return (Array.isArray(r.data) ? r.data : []) as { user_id: string; job_title: string | null }[]; } });
}
/** Copies HR documents to the HR team's OneDrive folder (if they've chosen one). all: everything not copied yet. */
export async function copyHrToOneDrive(body: { doc_ids?: string[]; all?: boolean }) {
  return invokeAsUser<{ ok?: boolean; copied?: number; skipped?: string }>('hr-onedrive-copy', body);
}

/** Who can open HR (Andy, 15 Nov 2026: "clear in the app who could have access to it pm / admin / otherwise which is
 * all set at the start by the admin and then there onwards"). hr_who_has_access: everyone in the company may see the
 * names; the change log only the HR team and company admins. */
export type HrWhoPerson = { id: string; name: string; role: string; why: ('named' | 'admin' | 'pm')[] };
export type HrWho = { set_up: boolean; team_admins: boolean; team_pms: boolean; named: string[]; people: HrWhoPerson[]; set_up_at: string | null; set_up_by: string | null; log: { at: string; by: string | null; what: string }[];
  /** Besides HR: who may see the signed-in person's folder (allowed by HR, or their line manager). */
  sees_mine: { id: string; name: string }[];
  /** For HR: every "viewer may see user's folder" HR has allowed (Andy, 15 Nov 2026: person by person, not by team). */
  grants: { viewer_id: string; user_id: string }[] };
const whoOf = (d: unknown): HrWho | null => {
  if (!d || Array.isArray(d) || typeof d !== 'object') return null;
  const w = d as Partial<HrWho>;
  return { set_up: !!w.set_up, team_admins: !!w.team_admins, team_pms: !!w.team_pms, named: w.named ?? [], people: w.people ?? [], set_up_at: w.set_up_at ?? null, set_up_by: w.set_up_by ?? null, log: w.log ?? [], sees_mine: w.sees_mine ?? [], grants: w.grants ?? [] };
};
export function useHrWho(orgId: string | null | undefined) {
  return useQuery({ queryKey: ['hrWho', orgId], enabled: !!orgId, queryFn: async () => whoOf((await rpc('hr_who_has_access')).data) });
}
/** Sets who can open HR: all company admins, all project managers, and named people. Null if it couldn't be saved. */
export async function saveHrTeam(t: { admins: boolean; pms: boolean; people: string[] }): Promise<HrWho | null> {
  const r = await rpc('hr_save_team', { p_admins: t.admins, p_pms: t.pms, p_people: t.people });
  return r.error ? null : whoOf(r.data);
}
/** Sets whose folders one person may see besides their own (replaces their list; HR only). */
export async function saveViewerAccess(viewerId: string, people: string[]): Promise<boolean> {
  return !(await rpc('hr_set_viewer_access', { p_viewer: viewerId, p_people: people })).error;
}
/** Links the HR folder in OneDrive. An error to show, or null when it's saved. */
export async function linkHrFolder(f: { id: string; name: string; driveId?: string | null }): Promise<string | null> {
  const r = await rpc('hr_save_settings', { p_onedrive: { id: f.id, name: f.name, driveId: f.driveId || null, on: true } });
  if (!r.error) return null;
  return /linked_elsewhere/.test(String((r.error as { message?: string }).message ?? r.error))
    ? 'That folder is already used in OpHUB (for a project, operative, repair job, quote or Quick Link), so people outside HR already have a way in. Choose another, ideally a new, empty folder.'
    : 'Could not link that folder — please try again.';
}
/** The HR folder as OneDrive sees it: its link, the company Microsoft sign-in, and who OneDrive shares it with. */
export type HrShare = { who: string; email?: string | null; how: string; kind: 'person' | 'group' | 'link'; warn: boolean; inherited: boolean };
export type HrFolderAccess = { folder: { name: string; webUrl?: string | null } | null; account?: string | null; shared?: HrShare[] | null; sharedError?: string | null; error?: string };
export function useHrFolderAccess(folderId: string | null | undefined) {
  return useQuery({
    queryKey: ['hrFolderAccess', folderId], enabled: !!folderId, staleTime: 60000,
    queryFn: async (): Promise<HrFolderAccess> => {
      const r = await invokeAsUser<HrFolderAccess>('hr-onedrive-copy', { action: 'access' });
      return r.data ?? { folder: null, error: r.error && r.error !== 'could not reach the server' ? r.error : 'Could not reach OneDrive.' };
    },
  });
}

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const rows = <T,>(r: { data: unknown }) => ((r.data as T[] | null) ?? []);
const rid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${Math.random().toString(16).slice(2)}`);

export type HrHistory = { id: string; user_id: string; on_date: string; kind: string; title: string; detail: string | null; created_by: string | null; created_at: string };
export type HrGoal = { id: string; user_id: string; title: string; detail: string | null; due_date: string | null; status: string; progress: number; set_by: string | null; created_at: string; updated_at: string };
export type HrFeedback = { id: string; user_id: string; from_id: string; kind: string; body: string; private: boolean; created_at: string };
export type HrBonus = { id: string; user_id: string; period: string; basis: string; target: string | null; amount: number | null; status: string; notes: string | null; paid_on: string | null; created_at: string };
export type HrFolderData = { rec: HrRecord | null; docs: HrDoc[]; history: HrHistory[]; goals: HrGoal[]; feedback: HrFeedback[]; appraisals: Appraisal[]; bonuses: HrBonus[] };

/** Everyone with a folder: the company's people, less clients and subcontractor company logins. */
export function useStaff() {
  const q = usePeople();
  return { ...q, data: (q.data ?? []).filter((p) => !['client', 'superadmin'].includes(p.role) && !p.role.startsWith('subcontractor')).sort((a, b) => (a.name || '').localeCompare(b.name || '')) };
}

/** One person's folder. */
export function useHrFolder(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['hrFolder', userId], enabled: !!userId,
    queryFn: async (): Promise<HrFolderData> => {
      const u = userId as string;
      const [rec, docs, history, goals, feedback, appraisals, bonuses] = await Promise.all([
        db.from('hr_records').select('*').eq('user_id', u).maybeSingle(),
        db.from('hr_docs').select('*').eq('user_id', u).order('created_at', { ascending: false }),
        db.from('hr_history').select('*').eq('user_id', u).order('on_date', { ascending: false }),
        db.from('hr_goals').select('*').eq('user_id', u).order('created_at', { ascending: false }),
        db.from('hr_feedback').select('*').eq('user_id', u).order('created_at', { ascending: false }),
        db.from('hr_appraisals').select('*').eq('user_id', u).order('due_date', { ascending: false }),
        db.from('hr_bonuses').select('*').eq('user_id', u).order('created_at', { ascending: false }),
      ]);
      // Not the HR team or the person: the basics only, from hr_basic (line managers can't read the record itself).
      let r0 = (rec.data as HrRecord | null) ?? null;
      if (!r0) { const b = await rpc('hr_basic', { p_user: u }); r0 = b.data && !Array.isArray(b.data) ? (b.data as HrRecord) : null; }
      return { rec: r0, docs: rows<HrDoc>(docs), history: rows<HrHistory>(history), goals: rows<HrGoal>(goals), feedback: rows<HrFeedback>(feedback), appraisals: rows<Appraisal>(appraisals), bonuses: rows<HrBonus>(bonuses) };
    },
  });
}

/** The company admin's overview: every record, document date and appraisal, to show who needs something. */
export function useHrOverview(orgId: string | null | undefined, on: boolean) {
  return useQuery({
    queryKey: ['hrOverview', orgId], enabled: !!orgId && on,
    queryFn: async () => {
      const [recs, docs, apps] = await Promise.all([
        db.from('hr_records').select('*').eq('org_id', orgId as string),
        db.from('hr_docs').select('id,user_id,folder,item_key,title,doc_date,expiry_date,created_at,hidden_from_employee,org_id,storage_path,file_name,uploaded_by').eq('org_id', orgId as string),
        db.from('hr_appraisals').select('id,user_id,status,due_date,completed_at,manager_id,self_answers,review,rating,summary,created_at').eq('org_id', orgId as string),
      ]);
      return { recs: rows<HrRecord>(recs), docs: rows<HrDoc>(docs), apps: rows<Appraisal>(apps) };
    },
  });
}


export async function saveRecord(me: Profile, userId: string, fields: Partial<HrRecord>): Promise<boolean> {
  const r = await db.from('hr_records').upsert({ ...fields, user_id: userId, org_id: me.org_id } as never, { onConflict: 'user_id' }).select('user_id');
  return !r.error && !!(r.data as unknown[] | null)?.length;
}

export type UpFile = { uri: string; name: string; mimeType?: string | null };
export async function uploadHrDoc(me: Profile, userId: string, f: { folder: string; item_key: string | null; title: string; doc_date: string | null; expiry_date: string | null; hidden: boolean }, file: UpFile): Promise<string | null> {
  try {
    const path = `${me.org_id}/${userId}/${rid()}-${file.name.replace(/[^a-z0-9.\-]+/gi, '_')}`;
    const up = await supabase.storage.from('hr-docs').upload(path, await (await fetch(file.uri)).arrayBuffer(), { contentType: file.mimeType || 'application/octet-stream' });
    if (up.error) return null;
    const r = await db.from('hr_docs').insert({ org_id: me.org_id, user_id: userId, folder: f.folder, item_key: f.item_key, title: f.title, file_name: file.name, storage_path: up.data.path, doc_date: f.doc_date, expiry_date: f.expiry_date, hidden_from_employee: f.hidden, uploaded_by: me.id } as never).select('id').single();
    const id = (r.data as { id: string } | null)?.id;
    if (r.error || !id) { void supabase.storage.from('hr-docs').remove([up.data.path]); return null; }
    // A copy goes to the HR folder in OneDrive, if HR has chosen one (the server checks; nothing happens otherwise).
    void copyHrToOneDrive({ doc_ids: [id] }).catch(() => undefined);
    return id;
  } catch { return null; }
}
export async function hrDocUrl(d: HrDoc): Promise<string | null> {
  return (await supabase.storage.from('hr-docs').createSignedUrl(d.storage_path, 600)).data?.signedUrl ?? null;
}
/** Deletes the document and its file (asked first, on screen). */
export async function deleteHrDoc(d: HrDoc): Promise<boolean> {
  const r = await db.from('hr_docs').delete().eq('id', d.id).select('id');
  if (r.error || !(r.data as unknown[] | null)?.length) return false;
  void supabase.storage.from('hr-docs').remove([d.storage_path]);
  return true;
}

const ok = (r: { error: unknown; data?: unknown }) => !r.error && (r.data === undefined || !!(r.data as unknown[] | null)?.length);
export const addHistory = async (me: Profile, userId: string, h: { on_date: string; kind: string; title: string; detail: string | null }) =>
  ok(await db.from('hr_history').insert({ ...h, org_id: me.org_id, user_id: userId, created_by: me.id } as never).select('id'));
export const deleteHistory = async (id: string) => ok(await db.from('hr_history').delete().eq('id', id).select('id'));
export const addGoal = async (me: Profile, userId: string, g: { title: string; detail: string | null; due_date: string | null }) =>
  ok(await db.from('hr_goals').insert({ ...g, status: 'not_started', progress: 0, org_id: me.org_id, user_id: userId, set_by: me.id } as never).select('id'));
export const updateGoal = async (id: string, g: Partial<HrGoal>) => ok(await db.from('hr_goals').update({ ...g, updated_at: new Date().toISOString() } as never).eq('id', id).select('id'));
export const deleteGoal = async (id: string) => ok(await db.from('hr_goals').delete().eq('id', id).select('id'));
export const addFeedback = async (me: Profile, userId: string, f: { kind: string; body: string; private: boolean }) =>
  ok(await db.from('hr_feedback').insert({ ...f, org_id: me.org_id, user_id: userId, from_id: me.id } as never).select('id'));
export const deleteFeedback = async (id: string) => ok(await db.from('hr_feedback').delete().eq('id', id).select('id'));
export const startAppraisal = async (me: Profile, userId: string, due: string, managerId: string | null) =>
  ok(await db.from('hr_appraisals').insert({ org_id: me.org_id, user_id: userId, due_date: due, manager_id: managerId ?? me.id, status: 'due', created_by: me.id } as never).select('id'));
export const saveAppraisalSelf = async (id: string, answers: Record<string, string>, sendOn: boolean) =>
  ok(await db.from('hr_appraisals').update({ self_answers: answers, ...(sendOn ? { status: 'self_done' } : {}) } as never).eq('id', id).select('id'));
export const saveAppraisalReview = async (me: Profile, id: string, review: Appraisal['review'], rating: number | null, summary: string, signOff: boolean) =>
  ok(await db.from('hr_appraisals').update({ review, rating, summary, manager_id: me.id, ...(signOff ? { status: 'done', completed_at: new Date().toISOString() } : {}) } as never).eq('id', id).select('id'));
export const addBonus = async (me: Profile, userId: string, b: { period: string; basis: string; target: string | null; amount: number | null; status: string; notes: string | null }) =>
  ok(await db.from('hr_bonuses').insert({ ...b, org_id: me.org_id, user_id: userId, created_by: me.id } as never).select('id'));
export const updateBonus = async (id: string, b: Partial<HrBonus>) => ok(await db.from('hr_bonuses').update(b as never).eq('id', id).select('id'));
