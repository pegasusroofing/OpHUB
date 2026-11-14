// Who sees the money on Home (Andy, 14 Nov 2026: "make this customisable for the company admin in settings as they may
// not want pm's etc seeing finance tiles (this transfers to phone and laptop)"). Kept on the company
// (organizations.home_tiles); a missing answer means Yes, as before. Company admins always see them, and only people
// with Finance switched on ever do. The finance tiles are the Due In figure and the OpHUB Finance tile.
import { isFinanceUser } from '@/lib/roles';
import type { Organization, Profile } from '@/lib/types';

export type HomeTiles = { finance_pm?: boolean; finance_site_manager?: boolean; finance_other?: boolean };
export type HomeTileKey = keyof HomeTiles;

/** The questions on Admin › Company › Home Page, in order. */
export const HOME_TILE_ASKS: { k: HomeTileKey; q: string }[] = [
  { k: 'finance_pm', q: 'Project Managers See Finance On Home?' },
  { k: 'finance_site_manager', q: 'Site Managers See Finance On Home?' },
  { k: 'finance_other', q: 'Everyone Else With Finance Sees It On Home?' },
];

export const homeTileKey = (role: string | undefined): HomeTileKey =>
  role === 'pm' ? 'finance_pm' : role === 'site_manager' ? 'finance_site_manager' : 'finance_other';

/** Does this person see the finance tiles on Home? */
export function seesHomeFinance(me: Profile | null, org: Organization | null): boolean {
  if (!me || !isFinanceUser(me, org)) return false;
  if (me.role === 'admin' || me.role === 'superadmin') return true;
  return (org?.home_tiles ?? {})[homeTileKey(me.role)] !== false;
}
