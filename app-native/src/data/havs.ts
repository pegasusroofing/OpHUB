// HAVS, operative side: log your own minutes per tool per day, edit/delete your
// entries until the week is closed. Ported from 660-havs. The manager grid (log
// for others, tools on site, close the week, exports) comes with the PM screens.
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { localISODate } from '@/lib/rules/driver';
import { points, thresholdMessage } from '@/lib/rules/havs';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type HavsTool = { id: string; name: string; vibration_magnitude: number };
export type HavsEntry = { id: string; user_id: string; entry_date: string; tool_id: string; minutes: number };

export function useHavsWeek(site: Site | undefined, from: string, to: string) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['havs', site?.id, from, me?.id],
    enabled: !!site && !!me,
    queryFn: () => cachedQuery(`havs:${site?.id}:${from}:${me?.id}`, async () => {
      const p = me as Profile, s = site as Site;
      const [tools, siteTools, done, entries, assigned] = await Promise.all([
        db.from('havs_tools').select('id,name,vibration_magnitude').eq('org_id', p.org_id as string).eq('active', true).order('sort_order', { ascending: true }),
        db.from('site_havs_tools').select('tool_id').eq('site_id', s.id),
        db.from('havs_weekly_completions').select('id,completed_at').eq('site_id', s.id).eq('week_start', from),
        db.from('havs_entries').select('id,user_id,entry_date,tool_id,minutes').eq('site_id', s.id).eq('user_id', p.id).gte('entry_date', from).lte('entry_date', to).order('entry_date', { ascending: true }),
        db.from('site_assignments').select('user_id').eq('site_id', s.id).eq('user_id', p.id),
      ]);
      const onSite = new Set(((orThrow(siteTools) as { tool_id: string }[]) ?? []).map((x) => x.tool_id));
      return {
        tools: (orThrow(tools) as HavsTool[]).filter((t) => onSite.has(t.id)),
        locked: ((orThrow(done) as unknown[]) ?? []).length > 0,
        entries: orThrow(entries) as HavsEntry[],
        assigned: ((orThrow(assigned) as unknown[]) ?? []).length > 0,
      };
    }),
  });
}

/** Saves my minutes for one tool on one day; tells the managers if it takes me over a limit. */
export async function addHavsEntry(me: Profile, site: Site, date: Date, tool: HavsTool, minutes: number, dayEntries: HavsEntry[], tools: HavsTool[]): Promise<boolean> {
  const entry_date = localISODate(date);
  const r = await db.from('havs_entries').insert({ org_id: me.org_id, site_id: site.id, user_id: me.id, entry_date, tool_id: tool.id, minutes, created_by: me.id } as never);
  if (r.error) return false;
  try {
    const mag: Record<string, number> = Object.fromEntries(tools.map((t) => [t.id, Number(t.vibration_magnitude) || 0]));
    // Fresh from the database (as today), so entries saved a moment ago count too.
    const day = await db.from('havs_entries').select('tool_id,minutes').eq('site_id', site.id).eq('user_id', me.id).eq('entry_date', entry_date);
    const total = (((day.data as { tool_id: string; minutes: number }[] | null) ?? dayEntries.filter((e) => e.entry_date === entry_date)))
      .reduce((sum, e) => sum + points(mag[e.tool_id] || 0, e.minutes), 0);
    const before = total - points(mag[tool.id] || 0, minutes);
    const msg = thresholdMessage(before, total, `${site.name}: `, me.name, date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
    if (msg && me.org_id) await db.from('messages').insert({ org_id: me.org_id, site_id: site.id, sender_id: me.id, audience: 'managers', kind: msg.kind, body: msg.body } as never);
  } catch { /* best effort — never blocks logging */ }
  return true;
}

export async function editHavsEntry(id: string, minutes: number): Promise<boolean> {
  return !(await db.from('havs_entries').update({ minutes } as never).eq('id', id)).error;
}

export async function deleteHavsEntry(me: Profile, site: Site, e: HavsEntry): Promise<boolean> {
  const r = await db.from('havs_entries').delete().eq('id', e.id);
  if (r.error) return false;
  if (me.org_id) void db.from('site_activity_log').insert({ site_id: site.id, org_id: me.org_id, actor_id: me.id, action: 'havs_entry_deleted', description: `Deleted HAVS entry for ${me.name} (${e.entry_date})` } as never);
  return true;
}
