// Platform admin (170): every company with its package, modules and people;
// invite a new company; open a company as its admin (support mode) and exit;
// change a person's role, reset a password, delete a user or a company. The
// platform owner only — the server functions check that too.
import { rolePatch } from '@/lib/rules/users';
import { useQuery } from '@tanstack/react-query';
import { clearOfflineCache } from '@/lib/offlineCache';

import { supabase } from '@/lib/supabase';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a: object) => Promise<{ data: unknown; error: { message?: string } | null }>;
type Row = Record<string, any>;

export function usePlatform(enabled: boolean) {
  return useQuery({
    queryKey: ['platform'], enabled,
    queryFn: async () => {
      const [orgs, subs, people, invs] = await Promise.all([
        db.from('organizations').select('*').order('created_at', { ascending: false }),
        db.from('subscriptions').select('*'),
        db.from('profiles').select('*').order('name', { ascending: true }),
        // Each company's founding-admin invite still waiting to be used, so it can be emailed (Andy, 19 Nov 2026).
        db.from('invites').select('id, org_id, email, role, expires_at, created_at').eq('role', 'admin').is('used_at', null).order('created_at', { ascending: false }),
      ]);
      const subByOrg: Record<string, Row> = {}; ((subs.data as Row[] | null) ?? []).forEach((s) => { subByOrg[s.org_id] = s; });
      const byOrg: Record<string, Row[]> = {}; ((people.data as Row[] | null) ?? []).forEach((p) => { if (p.org_id) (byOrg[p.org_id] ||= []).push(p); });
      const now = Date.now(), invitesByOrg: Record<string, Row[]> = {};
      ((invs.data as Row[] | null) ?? []).filter((i) => !i.expires_at || new Date(i.expires_at).getTime() > now).forEach((i) => { (invitesByOrg[i.org_id] ||= []).push(i); });
      return { orgs: (orgs.data as Row[] | null) ?? [], subByOrg, byOrg, invitesByOrg };
    },
  });
}

async function fn<T>(name: string, body: object): Promise<{ data: T | null; error: string | null }> {
  try {
    const r = await supabase.functions.invoke(name, { body });
    const d = (r.data ?? null) as (T & { error?: string }) | null;
    if (r.error || d?.error) return { data: null, error: d?.error || 'Could not reach the server.' };
    return { data: d, error: null };
  } catch { return { data: null, error: 'Could not reach the server.' }; }
}

/** Project management off = Finance only (Finance switched on, and their admins given Finance). */
export async function setOrgModules(orgId: string, key: 'has_pm' | 'has_finance', on: boolean): Promise<boolean> {
  const patch: Row = { [key]: on };
  if (key === 'has_pm' && !on) patch.has_finance = true;
  if (!(await db.from('organizations').update(patch as never).eq('id', orgId).select('id')).data?.length) return false;
  if (patch.has_finance) { try { await db.from('profiles').update({ finance_enabled: true } as never).eq('org_id', orgId).eq('role', 'admin'); } catch { /* best effort */ } }
  return true;
}
/** Which systems a company has, set by the platform's super admin (Andy, 14 Nov 2026): OpHUB Projects, OpHUB Finance or
 *  both. Turning Finance on gives the company's admins Finance access; nothing is deleted when a system goes off. */
export type OrgSystems = 'projects' | 'finance' | 'both';
export const orgSystems = (o: { has_pm?: boolean | null; has_finance?: boolean | null }): OrgSystems => (o.has_pm === false ? 'finance' : o.has_finance ? 'both' : 'projects');
export async function setOrgSystems(orgId: string, sys: OrgSystems): Promise<boolean> {
  const patch: Row = { has_pm: sys !== 'finance', has_finance: sys !== 'projects' };
  if (!(await db.from('organizations').update(patch as never).eq('id', orgId).select('id')).data?.length) return false;
  if (patch.has_finance) { try { await db.from('profiles').update({ finance_enabled: true } as never).eq('org_id', orgId).eq('role', 'admin'); } catch { /* best effort */ } }
  return true;
}
export const setOrgPlan = async (orgId: string, tier: string) => !!(await db.from('organizations').update({ plan_tier: tier } as never).eq('id', orgId).select('id')).data?.length;
/** "estimator" is a PM with the no-notifications flag. */
export async function setUserRole(userId: string, role: string): Promise<boolean> {
  return !!(await db.from('profiles').update(rolePatch(role) as never).eq('id', userId).select('id')).data?.length;
}
export const createCompany = (company_name: string, email: string | null) => fn<{ invite_id: string }>('admin-create-company', { company_name, email: email || undefined });
export const resetPassword = (target_email: string, new_password: string | null) => fn<{ email: string; new_password: string }>('admin-reset-password', { target_email, new_password: new_password || undefined });
export const deleteUser = (user_id: string) => fn<{ deleted?: string }>('admin-delete-user', { user_id });
export const deleteCompany = (org_id: string) => fn<{ deleted?: string }>('admin-delete-company', { org_id });
/** Support mode: open a company as its admin (orgId), or come back out (null). */
export async function viewAsOrg(orgId: string | null): Promise<string | null> {
  const r = await rpc('superadmin_view_org', { p_org_id: orgId });
  const d = r.data as { ok?: boolean; error?: string } | null;
  if (r.error || !d?.ok) return d?.error || r.error?.message || 'Could not switch.';
  await clearOfflineCache();
  return null;
}
