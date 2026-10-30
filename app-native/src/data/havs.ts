// HAVS, operative side: log your own minutes per tool per day, edit/delete your
// entries until the week is closed. Ported from 660-havs. Managers: the whole job (log
// for each operative, tools on site, close / reopen the week, completed weeks).
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { localISODate } from '@/lib/rules/driver';
import { points, thresholdMessage } from '@/lib/rules/havs';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';
import { mustHit } from '@/lib/mustHit';

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
  return !!(await db.from('havs_entries').update({ minutes } as never).eq('id', id).select('id')).data?.length;
}

export async function deleteHavsEntry(me: Profile, site: Site, e: HavsEntry): Promise<boolean> {
  const r = mustHit(await db.from('havs_entries').delete().eq('id', e.id).select('id'));
  if (r.error) return false;
  if (me.org_id) void db.from('site_activity_log').insert({ site_id: site.id, org_id: me.org_id, actor_id: me.id, action: 'havs_entry_deleted', description: `Deleted HAVS entry for ${me.name} (${e.entry_date})` } as never).then(undefined, () => undefined);
  return true;
}

/* ---------- managers (660 renderHavs manager view) ---------- */
export type HavsOp = { id: string; name: string };
export function useHavsManagerWeek(site: Site | undefined, from: string, to: string, enabled: boolean) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['havs', site?.id, from, 'mgr'],
    enabled: !!site && !!me && enabled,
    queryFn: async () => {
      const p = me as Profile, s = site as Site;
      const [tools, siteTools, done, entries, assigned] = await Promise.all([
        db.from('havs_tools').select('id,name,vibration_magnitude').eq('org_id', p.org_id as string).eq('active', true).order('sort_order', { ascending: true }),
        db.from('site_havs_tools').select('tool_id').eq('site_id', s.id),
        db.from('havs_weekly_completions').select('id,completed_at').eq('site_id', s.id).eq('week_start', from),
        db.from('havs_entries').select('id,user_id,entry_date,tool_id,minutes').eq('site_id', s.id).gte('entry_date', from).lte('entry_date', to).order('entry_date', { ascending: true }),
        db.from('site_assignments').select('user_id').eq('site_id', s.id),
      ]);
      const ids = [...new Set(((assigned.data as { user_id: string }[] | null) ?? []).map((a) => a.user_id).concat(((entries.data as HavsEntry[] | null) ?? []).map((e) => e.user_id)))];
      const people = ids.length ? (((await db.from('profiles').select('id,name,role').in('id', ids)).data as { id: string; name: string; role: string }[] | null) ?? []) : [];
      const onSite = new Set(((siteTools.data as { tool_id: string }[] | null) ?? []).map((x) => x.tool_id));
      const all = (tools.data as HavsTool[] | null) ?? [];
      const completion = ((done.data as { id: string; completed_at: string }[] | null) ?? [])[0] ?? null;
      return {
        allTools: all, tools: all.filter((t) => onSite.has(t.id)), completion, locked: !!completion,
        entries: (entries.data as HavsEntry[] | null) ?? [],
        ops: people.filter((x) => x.role === 'operative').sort((a, b) => a.name.localeCompare(b.name)) as HavsOp[],
        nameById: Object.fromEntries(people.map((x) => [x.id, x.name])) as Record<string, string>,
      };
    },
  });
}
/** A manager logs minutes for an operative; the managers are told if it takes that person over a limit. */
export async function addHavsEntryFor(me: Profile, site: Site, op: HavsOp, date: Date, tool: HavsTool, minutes: number, tools: HavsTool[]): Promise<boolean> {
  const entry_date = localISODate(date);
  if ((await db.from('havs_entries').insert({ org_id: me.org_id, site_id: site.id, user_id: op.id, entry_date, tool_id: tool.id, minutes, created_by: me.id } as never)).error) return false;
  try {
    const mag: Record<string, number> = Object.fromEntries(tools.map((t) => [t.id, Number(t.vibration_magnitude) || 0]));
    const day = ((await db.from('havs_entries').select('tool_id,minutes').eq('site_id', site.id).eq('user_id', op.id).eq('entry_date', entry_date)).data as { tool_id: string; minutes: number }[] | null) ?? [];
    const total = day.reduce((sum, e) => sum + points(mag[e.tool_id] || 0, e.minutes), 0);
    const msg = thresholdMessage(total - points(mag[tool.id] || 0, minutes), total, `${site.name}: `, op.name, date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
    if (msg && me.org_id) await db.from('messages').insert({ org_id: me.org_id, site_id: site.id, sender_id: me.id, audience: 'managers', kind: msg.kind, body: msg.body } as never);
  } catch { /* best effort */ }
  return true;
}
export async function setSiteHavsTool(siteId: string, toolId: string, on: boolean): Promise<boolean> {
  return on ? !(await db.from('site_havs_tools').insert({ site_id: siteId, tool_id: toolId } as never)).error
    : !(await db.from('site_havs_tools').delete().eq('site_id', siteId).eq('tool_id', toolId)).error;
}
/** A new tool goes on the company HAVS register and onto this job. */
export async function addHavsTool(me: Profile, siteId: string, name: string, magnitude: number): Promise<boolean> {
  const r = await db.from('havs_tools').insert({ org_id: me.org_id, name, vibration_magnitude: magnitude, sort_order: 999 } as never).select('id').single();
  if (r.error) return false;
  return setSiteHavsTool(siteId, (r.data as { id: string }).id, true);
}
/** Save & Close for the Week locks the week's inputs; Reopen unlocks it. */
export async function closeHavsWeek(me: Profile, siteId: string, weekStart: string): Promise<boolean> {
  return !(await db.from('havs_weekly_completions').insert({ org_id: me.org_id, site_id: siteId, week_start: weekStart, completed_by: me.id } as never)).error;
}
export async function reopenHavsWeek(id: string): Promise<boolean> {
  return !!(await db.from('havs_weekly_completions').delete().eq('id', id).select('id')).data?.length;
}
export function useHavsCompleted(siteId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['havs', siteId, 'completed'], enabled: !!siteId && enabled,
    queryFn: async () => {
      const rows = ((await db.from('havs_weekly_completions').select('id,week_start,completed_at,completed_by').eq('site_id', siteId as string).order('week_start', { ascending: false })).data as { id: string; week_start: string; completed_at: string; completed_by: string | null }[] | null) ?? [];
      const ids = [...new Set(rows.map((r) => r.completed_by).filter(Boolean))] as string[];
      const names = ids.length ? Object.fromEntries((((await db.from('profiles').select('id,name').in('id', ids)).data as { id: string; name: string }[] | null) ?? []).map((p) => [p.id, p.name])) : {};
      return rows.map((r) => ({ ...r, by: r.completed_by ? names[r.completed_by] ?? null : null }));
    },
  });
}
