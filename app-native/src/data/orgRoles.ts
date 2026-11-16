// The company's list of roles (org_roles) and choosing someone's role (profiles.org_role_id). Rules: lib/rules/orgRoles.
// The database lets only company admins change the list or choose someone's role; everyone else's level changes get
// the default role for that level.
import { useQuery } from '@tanstack/react-query';

import { DEFAULT_ROLES, isUnsaved, withDefaults, type OrgRole } from '@/lib/rules/orgRoles';
import { roleChangePatch } from '@/lib/rules/users';
import { supabase } from '@/lib/supabase';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export function useOrgRoles(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['orgRoles', orgId], enabled: !!orgId, staleTime: 300000,
    queryFn: async () => {
      const r = await db.from('org_roles').select('id,name,access,is_default,position').eq('org_id', orgId as string);
      if (r.error) throw r.error; // never show the starting list in place of a company's own
      return withDefaults((r.data as OrgRole[] | null) ?? []);
    },
  });
}

const errText = (e: unknown, name?: string) => {
  const m = String((e as { message?: string } | null)?.message ?? '');
  if (/people have this role/i.test(m)) return 'People have this role. Move them to another role first.';
  if (/main role/i.test(m) || /default_uq/i.test(m)) return 'This is the main role for its level. You can rename it.';
  if (/duplicate|unique/i.test(m)) return `There’s already a role called ${name || 'that'}.`;
  return 'Could not save — try again.';
};

/** A company from before the list existed has none saved yet: save the starting list first. */
async function ensureSaved(orgId: string, roles: OrgRole[]): Promise<OrgRole[] | null> {
  if (!roles.every(isUnsaved)) return roles;
  const r = await db.from('org_roles').insert(DEFAULT_ROLES.map(([name, access, d], i) => ({ org_id: orgId, name, access, is_default: d, position: i + 1 })) as never).select('id,name,access,is_default,position');
  return r.error ? null : withDefaults((r.data as OrgRole[] | null) ?? []);
}

export async function addOrgRole(orgId: string, roles: OrgRole[], name: string, access: string): Promise<string | null> {
  const saved = await ensureSaved(orgId, roles); if (!saved) return 'Could not save — try again.';
  const position = Math.max(0, ...saved.map((r) => r.position)) + 1;
  const r = await db.from('org_roles').insert({ org_id: orgId, name: name.trim(), access, position } as never).select('id');
  return r.error ? errText(r.error, name.trim()) : null;
}

/** Rename, or (when nobody has it) change what it uses the app as. */
export async function saveOrgRole(orgId: string, roles: OrgRole[], role: OrgRole, patch: { name: string; access: string }): Promise<string | null> {
  const saved = await ensureSaved(orgId, roles); if (!saved) return 'Could not save — try again.';
  const id = isUnsaved(role) ? saved.find((x) => x.name === role.name)?.id : role.id;
  if (!id) return 'Could not save — try again.';
  const r = await db.from('org_roles').update({ name: patch.name.trim(), access: patch.access } as never).eq('id', id).select('id');
  return r.error ? errText(r.error, patch.name.trim()) : r.data?.length ? null : 'Could not save — try again.';
}

export async function removeOrgRole(orgId: string, roles: OrgRole[], role: OrgRole): Promise<string | null> {
  const saved = await ensureSaved(orgId, roles); if (!saved) return 'Could not save — try again.';
  const id = isUnsaved(role) ? saved.find((x) => x.name === role.name)?.id : role.id;
  if (!id) return 'Could not save — try again.';
  const r = await db.from('org_roles').delete().eq('id', id).select('id');
  return r.error ? errText(r.error) : r.data?.length ? null : 'Could not save — try again.';
}

/** Gives someone a role: their level (as setRole) and, for a company admin, which of the company's roles it is. */
export async function setPersonRole(personId: string, role: OrgRole, iAmAdmin: boolean): Promise<boolean> {
  const patch = { ...roleChangePatch(role.access), ...(iAmAdmin && !isUnsaved(role) ? { org_role_id: role.id } : {}) };
  return !!(await db.from('profiles').update(patch as never).eq('id', personId).select('id')).data?.length;
}
