// What each role can do (Andy, 16-17 Nov 2026: the roles board, "everyone should start with the same as the project
// managers ... then I will build from there"; "I also want this board built into the app"). Each office role has a
// list of parts (org_roles.perms); null means every part, as before the list existed. Company admins (and the platform
// admin) are never limited. The database gives the signed-in person's list as my_role_perms(), kept on me.perms. Pure.

export type Part = 'every_job' | 'create_projects' | 'prices' | 'fin_view' | 'fin_edit' | 'quotes' | 'sow' | 'snags'
  | 'hs_signoff' | 'orders' | 'docs' | 'team' | 'people' | 'reports' | 'notify' | ExtraPart;
/** Two more parts (Andy, 18 Nov 2026: "there is a who sees finance but we have recently set the roles up"): Money On Home
 *  (it was Admin › Company › Home Page) and See Material Costs (it was a person-by-person list in Finance › Settings).
 *  Kept in their own list (org_roles.perms_extra; on me, perms_extra); not set yet (null) means the old behaviour. */
export type ExtraPart = 'home_money' | 'mat_costs';
export const EXTRA_PARTS: Part[] = ['home_money', 'mat_costs'];

/** The parts in the board's order, with the names Andy chose. Andy, 17 Nov 2026: quotes and the price builder are separate: 
 *  Quotes is the Quotes page (tender tracker); the price builder (the job's Price Sheets) has always come with See Prices. */
export const PARTS: [Part, string][] = [
  ['every_job', 'Every Job'], ['create_projects', 'Create Projects'], ['prices', 'See Prices And Price Builder'], ['mat_costs', 'See Material Costs'],
  ['fin_view', 'Finance – View'], ['fin_edit', 'Finance – Edit'], ['home_money', 'Money On Home'], ['quotes', 'Quotes'],
  ['sow', 'Schedule Of Works'], ['snags', 'Snags And Variations'], ['hs_signoff', 'Sign Off H&S'],
  ['orders', 'Raise Orders'], ['docs', 'Drawings And Documents'], ['team', 'Team And Calendar'],
  ['people', 'Manage People'], ['reports', 'Reports'], ['notify', 'Notifications And Emails'],
];
export const ALL_PARTS: Part[] = PARTS.map(([k]) => k);
/** The parts kept in org_roles.perms (the first fifteen). */
export const BASE_PARTS: Part[] = ALL_PARTS.filter((k) => !EXTRA_PARTS.includes(k));
export const partLabel = (k: string) => PARTS.find(([p]) => p === k)?.[1] ?? k;

/** The levels whose roles are on the board: the office ones. Admin has everything; operatives, drivers and clients
 *  are kept to their own screens by their level. */
export const BOARD_LEVELS = ['pm', 'estimator', 'finance_controller', 'site_manager'];

/** A role's parts in the board's order: its list (null: all fifteen) and its extra parts (null: not set yet, so
 *  legacyExtra: what the old settings gave). */
export const partsOf = (perms: readonly string[] | null | undefined, extra?: readonly string[] | null, legacyExtra: readonly string[] = []): Part[] => {
  const ex = extra == null ? legacyExtra : extra;
  return ALL_PARTS.filter((k) => (EXTRA_PARTS.includes(k) ? ex.includes(k) : perms == null || perms.includes(k)));
};
/** A board list split for saving: the first fifteen to perms, the extra parts to perms_extra. */
export const splitParts = (parts: readonly string[]) => ({ perms: BASE_PARTS.filter((k) => parts.includes(k)) as string[], extra: EXTRA_PARTS.filter((k) => parts.includes(k)) as string[] });

/** Whether this person may use a part. Admins always; otherwise their role's list (none kept: yes, as before). For an
 *  extra part not set on their role yet, legacy: what the old setting gave. */
export function can(me: { role: string; perms?: readonly string[] | null; perms_extra?: readonly string[] | null } | null | undefined, part: Part, legacy = false): boolean {
  if (!me) return false;
  if (me.role === 'admin' || me.role === 'superadmin') return true;
  if (EXTRA_PARTS.includes(part)) return me.perms_extra == null ? legacy : me.perms_extra.includes(part);
  return me.perms == null || me.perms.includes(part);
}

/** A role's list with one part added or taken out, in the board's order. */
export function withPart(parts: readonly string[], part: Part, on: boolean): Part[] {
  const cur = ALL_PARTS.filter((k) => parts.includes(k));
  return on ? ALL_PARTS.filter((k) => cur.includes(k) || k === part) : cur.filter((k) => k !== part);
}

/** A new office role starts the same as the company's Project Manager (Andy, 17 Nov 2026). */
export function startingParts(roles: { access: string; is_default: boolean; perms?: string[] | null; perms_extra?: string[] | null }[]): { perms: string[] | null; extra: string[] | null } {
  const pm = roles.find((r) => r.access === 'pm' && r.is_default);
  return { perms: pm?.perms == null ? null : splitParts(pm.perms).perms, extra: pm?.perms_extra ?? null };
}
