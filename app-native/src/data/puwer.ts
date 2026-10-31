// PUWER weekly tool inspection (680): fill your own, or a manager fills one for
// any operative on the job; the managers' weekly roster, mark week complete /
// reopen, and delete. PDFs are still to come.
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { buildPuwerTools, type PuwerTool } from '@/lib/rules/puwer';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { mustHit } from '@/lib/mustHit';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export function usePuwer(siteId: string | undefined, weekStart: string, userId?: string) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['puwer', siteId, weekStart, userId ?? me?.id],
    enabled: !!siteId && !!me,
    queryFn: async () => {
      const p = me as Profile;
      const who = userId ?? p.id;
      const [insp, owned, done] = await Promise.all([
        db.from('puwer_inspections').select('*').eq('site_id', siteId as string).eq('user_id', who).eq('week_start', weekStart),
        db.from('operative_tools').select('id,name,serial_number,photo_path').eq('user_id', who).order('created_at', { ascending: true }),
        db.from('puwer_weekly_completions').select('id,completed_at').eq('site_id', siteId as string).eq('week_start', weekStart),
      ]);
      if (insp.error || owned.error) throw insp.error || owned.error;
      const row = ((insp.data as { id: string; comments: string | null }[]) ?? [])[0] ?? null;
      const saved = row ? ((await db.from('puwer_inspection_tools').select('*').eq('inspection_id', row.id).order('sort_order', { ascending: true })).data ?? []) : [];
      return {
        inspectionId: row?.id ?? null,
        comments: row?.comments ?? '',
        tools: buildPuwerTools(saved as never, (owned.data ?? []) as never, isManager(p)),
        weekDone: ((done.data as unknown[] | null) ?? []).length > 0,
      };
    },
  });
}

/** Saves the inspection and each tool's answers. Returns how many tools failed to save. */
export async function savePuwer(me: Profile, siteId: string, weekStart: string, inspectionId: string | null, tools: PuwerTool[], comments: string, userId: string = me.id): Promise<{ id: string | null; failed: number; error?: string }> {
  let id = inspectionId;
  if (!id) {
    const r = await db.from('puwer_inspections').insert({ org_id: me.org_id, site_id: siteId, user_id: userId, week_start: weekStart, inspected_by: me.id, comments: comments || null } as never).select('id');
    if (r.error) return { id: null, failed: 0, error: 'Inspection NOT saved — check your signal and try again.' };
    id = ((r.data as { id: string }[] | null) ?? [])[0]?.id ?? null;
  } else {
    const r = mustHit(await db.from('puwer_inspections').update({ comments: comments || null, updated_at: new Date().toISOString() } as never).eq('id', id).select('id'));
    if (r.error) return { id, failed: 0, error: 'Inspection NOT saved — check your signal and try again.' };
  }
  let failed = 0;
  for (let i = 0; i < tools.length; i++) {
    const t = tools[i];
    const payload = { q_suitability: t.q_suitability, q_guarding: t.q_guarding, q_controls: t.q_controls, q_maintenance: t.q_maintenance, q_markings: t.q_markings, sort_order: i };
    const r = t.dbId
      ? await db.from('puwer_inspection_tools').update(payload as never).eq('id', t.dbId)
      : await db.from('puwer_inspection_tools').insert({ inspection_id: id, tool_id: t.toolId, name: t.name, serial_number: t.serial_number, photo_path: t.photo_path, ...payload } as never);
    if (r.error) failed++;
  }
  return { id, failed };
}

/** Managers: everyone on the job this week, done or not, their tool count, and whether the week is closed. */
export function usePuwerRoster(siteId: string | undefined, weekStart: string, enabled: boolean) {
  return useQuery({
    queryKey: ['puwerRoster', siteId, weekStart],
    enabled: !!siteId && enabled,
    queryFn: async () => {
      const [a, p, insp, done] = await Promise.all([
        db.from('site_assignments').select('user_id').eq('site_id', siteId as string),
        db.from('profiles').select('id,name').eq('role', 'operative').order('name'),
        db.from('puwer_inspections').select('id,user_id').eq('site_id', siteId as string).eq('week_start', weekStart),
        db.from('puwer_weekly_completions').select('id,completed_at,completed_by').eq('site_id', siteId as string).eq('week_start', weekStart),
      ]);
      const on = new Set(((a.data as { user_id: string }[] | null) ?? []).map((x) => x.user_id));
      const ops = ((p.data as { id: string; name: string }[] | null) ?? []).filter((x) => on.has(x.id));
      const tools = ops.length ? (((await db.from('operative_tools').select('user_id').in('user_id', ops.map((o) => o.id))).data as { user_id: string }[] | null) ?? []) : [];
      return {
        ops, done: new Set(((insp.data as { user_id: string }[] | null) ?? []).map((x) => x.user_id)),
        toolCount: tools.reduce<Record<string, number>>((m, t) => ({ ...m, [t.user_id]: (m[t.user_id] || 0) + 1 }), {}),
        completion: ((done.data as { id: string; completed_at: string; completed_by: string }[] | null) ?? [])[0] ?? null,
      };
    },
  });
}
export async function markPuwerWeek(me: Profile, siteId: string, weekStart: string) {
  return !(await db.from('puwer_weekly_completions').insert({ org_id: me.org_id, site_id: siteId, week_start: weekStart, completed_by: me.id } as never)).error;
}
export const reopenPuwerWeek = async (id: string) => !!(await db.from('puwer_weekly_completions').delete().eq('id', id).select('id')).data?.length;
export async function deletePuwer(me: Profile, siteId: string, inspectionId: string, name: string) {
  await db.from('puwer_inspection_tools').delete().eq('inspection_id', inspectionId);
  const r = mustHit(await db.from('puwer_inspections').delete().eq('id', inspectionId).select('id'));
  if (!r.error && me.org_id) void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action: 'puwer_inspection_deleted', description: `Deleted PUWER inspection for ${name}` } as never).then(undefined, () => undefined);
  return !r.error;
}
