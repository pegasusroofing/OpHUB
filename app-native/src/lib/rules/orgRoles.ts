// A company's own list of roles (Andy, 16 Nov 2026: "I think we need to create a selection of roles? Admin, Contracts
// administrator, Finance controller, Project manager, Quantity surveyor, Document controller, Contracts manager,
// Operative (as we have now) ... I want that to be a set list that the admin can see, but also add and remove").
// Each role "uses the app as" one of OpHUB's levels (access), which is what the database's rules go by. The table is
// org_roles; a person's role is profiles.org_role_id, or the default role for their level when not chosen yet. Pure.
import { shownRole } from './users.ts';

export type Access = 'admin' | 'pm' | 'estimator' | 'finance_controller' | 'site_manager' | 'operative' | 'driver' | 'client';
/** perms: what the role can do (lib/rules/rolePerms); null, everything its level allows. */
export type OrgRole = { id: string; name: string; access: string; is_default: boolean; position: number; perms?: string[] | null };
export type RolePerson = { id: string; role: string; is_estimator?: boolean | null; finance_only?: boolean | null; org_role_id?: string | null };

/** What each level means, in the words the Roles screen uses. */
export const ACCESS_LABEL: Record<Access, string> = {
  admin: 'Company Admin (Everything)',
  pm: 'Project Manager',
  estimator: 'Estimator (No Notifications)',
  finance_controller: 'Finance Only',
  site_manager: 'Site Manager',
  operative: 'Operative',
  driver: 'Delivery Driver',
  client: 'Client (View Only)',
};
export const ACCESS_ORDER: Access[] = ['admin', 'pm', 'estimator', 'finance_controller', 'site_manager', 'operative', 'driver', 'client'];

/** The starting list, the same as the database's org_roles_seed. */
export const DEFAULT_ROLES: [string, Access, boolean][] = [
  ['Admin', 'admin', true], ['Contracts Administrator', 'pm', false], ['Finance Controller', 'finance_controller', true],
  ['Project Manager', 'pm', true], ['Quantity Surveyor', 'pm', false], ['Document Controller', 'pm', false],
  ['Contracts Manager', 'pm', false], ['Estimator', 'estimator', true], ['Site Manager', 'site_manager', true],
  ['Operative', 'operative', true], ['Delivery Driver', 'driver', true], ['Client', 'client', true],
];
/** Rows not saved yet (a company from before 16 Nov with none) have ids starting "default:". */
export const isUnsaved = (r: OrgRole) => r.id.startsWith('default:');
export function withDefaults(rows: OrgRole[]): OrgRole[] {
  if (rows.length) return rows.slice().sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  return DEFAULT_ROLES.map(([name, access, d], i) => ({ id: `default:${i}`, name, access, is_default: d, position: i + 1 }));
}

export const accessOf = (p: RolePerson): string => shownRole(p);
/** The person's role: the one chosen for them (if it still matches their level), else the default for their level. */
export function roleOf(p: RolePerson, roles: OrgRole[]): OrgRole | null {
  const a = accessOf(p);
  return roles.find((r) => r.id === p.org_role_id && r.access === a) ?? roles.find((r) => r.is_default && r.access === a) ?? null;
}
export const roleName = (p: RolePerson, roles: OrgRole[]) => roleOf(p, roles)?.name ?? ACCESS_LABEL[accessOf(p) as Access] ?? p.role;
export const holders = <P extends RolePerson>(r: OrgRole, people: P[], roles: OrgRole[]) => people.filter((p) => roleOf(p, roles)?.id === r.id);

/** Groups people under the company's roles, in the list's order; roles nobody has are left out. */
export function groupByRole<P extends RolePerson>(people: P[], roles: OrgRole[]): { role: OrgRole | null; title: string; people: P[] }[] {
  const out = roles.map((r) => ({ role: r as OrgRole | null, title: r.name, people: holders(r, people, roles) })).filter((g) => g.people.length);
  const rest = people.filter((p) => !roleOf(p, roles));
  if (rest.length) out.push({ role: null, title: 'Other', people: rest });
  return out;
}

/** The roles someone may be moved to, given the levels they're allowed to set (roleActionsFor's options). A company
 *  admin chooses any role of those levels; anyone else only the default role of each other level (the database picks
 *  the role, so moving within a level would change nothing). */
export function roleChoices(allowed: string[], roles: OrgRole[], iAmAdmin: boolean, currentAccess?: string): OrgRole[] {
  return roles.filter((r) => allowed.includes(r.access) && (iAmAdmin || (r.is_default && r.access !== currentAccess)));
}
