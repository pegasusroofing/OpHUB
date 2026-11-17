// What each role can do (Andy, 16-17 Nov 2026: the roles board, "everyone should start with the same as the project
// managers ... then I will build from there"; "I also want this board built into the app"). Each office role has a
// list of parts (org_roles.perms); null means every part, as before the list existed. Company admins (and the platform
// admin) are never limited. The database gives the signed-in person's list as my_role_perms(), kept on me.perms. Pure.

export type Part = 'every_job' | 'create_projects' | 'prices' | 'fin_view' | 'fin_edit' | 'quotes' | 'sow' | 'snags'
  | 'hs_signoff' | 'orders' | 'docs' | 'team' | 'people' | 'reports' | 'notify';

/** The parts in the board's order, with the names Andy chose. */
export const PARTS: [Part, string][] = [
  ['every_job', 'Every Job'], ['create_projects', 'Create Projects'], ['prices', 'See Prices'],
  ['fin_view', 'Finance – View'], ['fin_edit', 'Finance – Edit'], ['quotes', 'Quotes And Price Builder'],
  ['sow', 'Schedule Of Works'], ['snags', 'Snags And Variations'], ['hs_signoff', 'Sign Off H&S'],
  ['orders', 'Raise Orders'], ['docs', 'Drawings And Documents'], ['team', 'Team And Calendar'],
  ['people', 'Manage People'], ['reports', 'Reports'], ['notify', 'Notifications And Emails'],
];
export const ALL_PARTS: Part[] = PARTS.map(([k]) => k);
export const partLabel = (k: string) => PARTS.find(([p]) => p === k)?.[1] ?? k;

/** The levels whose roles are on the board: the office ones. Admin has everything; operatives, drivers and clients
 *  are kept to their own screens by their level. */
export const BOARD_LEVELS = ['pm', 'estimator', 'finance_controller', 'site_manager'];

/** A role's parts in the board's order (null: all of them). */
export const partsOf = (perms: readonly string[] | null | undefined): Part[] =>
  perms == null ? ALL_PARTS.slice() : ALL_PARTS.filter((k) => perms.includes(k));

/** Whether this person may use a part. Admins always; otherwise their role's list (none kept: yes, as before). */
export function can(me: { role: string; perms?: readonly string[] | null } | null | undefined, part: Part): boolean {
  if (!me) return false;
  if (me.role === 'admin' || me.role === 'superadmin') return true;
  return me.perms == null || me.perms.includes(part);
}

/** A role's list with one part added or taken out, in the board's order. */
export function withPart(perms: readonly string[] | null | undefined, part: Part, on: boolean): Part[] {
  const cur = partsOf(perms);
  return on ? partsOf([...cur, part]) : cur.filter((k) => k !== part);
}

/** A new office role starts the same as the company's Project Manager (Andy, 17 Nov 2026). */
export function startingParts(roles: { access: string; is_default: boolean; perms?: string[] | null }[]): Part[] | null {
  const pm = roles.find((r) => r.access === 'pm' && r.is_default);
  return pm?.perms == null ? null : partsOf(pm.perms);
}
