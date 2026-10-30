// Show / hide a tile per job role on one job (629 setTileVisibility, 725
// setMatVisibility). PMs / admins see every tile; for them a tile hidden from
// operatives is dimmed, with a ⋮ menu to change who sees it. H&S tiles live in
// sites.tile_visibility, Plant / Expenses in sites.materials_visibility.
import { chooseAction } from '@/components/toast';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
export const VIS_ROLES = [{ role: 'site_manager', label: 'Site Managers' }, { role: 'operative', label: 'Operatives' }, { role: 'driver', label: 'Delivery Drivers' }];
export const TILE_VIS_DEFAULTS: Record<string, string[]> = { hs_havs: ['site_manager'], hs_loler: ['site_manager'] };
const ALL = ['site_manager', 'operative', 'driver'];
type S = Site & { tile_visibility?: Record<string, string[]> | null; materials_visibility?: Record<string, string[]> | null };

/** Who can see the tile now. kind 'mat' = Plant / Expenses (default site managers only). */
export function tileRoles(site: S, key: string, kind: 'hs' | 'mat' = 'hs'): string[] {
  const v = kind === 'mat' ? site.materials_visibility?.[key] : site.tile_visibility?.[key];
  return Array.isArray(v) ? v : kind === 'mat' ? ['site_manager'] : TILE_VIS_DEFAULTS[key] || ALL;
}

/** The ⋮ menu: Hide from / Show to each role. Returns a message, or null if nothing changed. */
export async function tileVisMenu(me: Profile, site: S, key: string, label: string, kind: 'hs' | 'mat' = 'hs'): Promise<string | null> {
  const cur = tileRoles(site, key, kind);
  const k = await chooseAction(label, VIS_ROLES.map((r) => ({ key: r.role, label: cur.includes(r.role) ? `🙈 Hide from ${r.label}` : `👁 Show to ${r.label}` })));
  if (!k) return null;
  const on = !cur.includes(k);
  const roles = on ? Array.from(new Set([...cur, k])) : cur.filter((x) => x !== k);
  const col = kind === 'mat' ? 'materials_visibility' : 'tile_visibility';
  const next = { ...((kind === 'mat' ? site.materials_visibility : site.tile_visibility) || {}), [key]: roles };
  if ((await db.from('sites').update({ [col]: next } as never).eq('id', site.id)).error) return 'Could not save — try again.';
  const who = VIS_ROLES.find((r) => r.role === k)?.label || k;
  if (me.org_id) void db.from('site_activity_log').insert({ site_id: site.id, org_id: me.org_id, actor_id: me.id, action: col, description: `${label} ${on ? 'shown to' : 'hidden from'} ${who}` } as never).then(undefined, () => undefined);
  return `${on ? 'Now shown to' : 'Hidden from'} ${who}`;
}
