// Who sees the money on Home (Andy, 14 Nov 2026: "make this customisable for the company admin in settings as they may
// not want pm's etc seeing finance tiles (this transfers to phone and laptop)"). Kept on the company
// (organizations.home_tiles); a missing answer means Yes, as before. Company admins always see them, and only people
// with Finance switched on ever do. The finance tiles are the Due In figure and the OpHUB Finance tile.
import { isFinanceUser } from '@/lib/roles';
import { can } from '@/lib/rules/rolePerms';
import type { Organization, Profile } from '@/lib/types';

export type HomeTiles = { finance_pm?: boolean; finance_site_manager?: boolean; finance_other?: boolean };
export type HomeTileKey = keyof HomeTiles;

/** The questions on Admin › Company › Home Page, in order. */
// Only project managers are asked: site managers open on Projects, not Home, and admins always see it (review, 15 Nov 2026).
export const HOME_TILE_ASKS: { k: HomeTileKey; q: string }[] = [
  { k: 'finance_pm', q: 'Project Managers See Finance On Home?' },
];

export const homeTileKey = (role: string | undefined): HomeTileKey =>
  role === 'pm' ? 'finance_pm' : role === 'site_manager' ? 'finance_site_manager' : 'finance_other';

/** What the old Home Page setting gave a level: Money On Home unless the company said No (Admin › Roles has it now). */
export const oldHomeMoney = (access: string, org: Organization | null) => (org?.home_tiles ?? {})[homeTileKey(access)] !== false;
/** A role's extra parts before they were set on the board (18 Nov 2026): Money On Home as the old setting; no material costs. */
export const legacyExtra = (access: string, org: Organization | null): string[] => (oldHomeMoney(access, org) ? ['home_money'] : []);

/** Does this person see the finance tiles on Home? Finance on, and their role's Money On Home (Admin › Roles; Andy, 18 Nov
 *  2026: "there is a who sees finance but we have recently set the roles up"); not set on the role yet, the old setting. */
export function seesHomeFinance(me: Profile | null, org: Organization | null): boolean {
  if (!me || !isFinanceUser(me, org)) return false;
  return can(me, 'home_money', oldHomeMoney(me.role, org));
}
