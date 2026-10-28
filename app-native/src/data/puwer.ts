// PUWER weekly tool inspection, operative side (fill your own). Ported from 680.
// The manager roster, close-the-week, delete and PDFs come with the PM screens.
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { buildPuwerTools, type PuwerTool } from '@/lib/rules/puwer';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export function usePuwer(siteId: string | undefined, weekStart: string) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['puwer', siteId, weekStart, me?.id],
    enabled: !!siteId && !!me,
    queryFn: async () => {
      const p = me as Profile;
      const [insp, owned, done] = await Promise.all([
        db.from('puwer_inspections').select('*').eq('site_id', siteId as string).eq('user_id', p.id).eq('week_start', weekStart),
        db.from('operative_tools').select('id,name,serial_number,photo_path').eq('user_id', p.id).order('created_at', { ascending: true }),
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
export async function savePuwer(me: Profile, siteId: string, weekStart: string, inspectionId: string | null, tools: PuwerTool[], comments: string): Promise<{ id: string | null; failed: number; error?: string }> {
  let id = inspectionId;
  if (!id) {
    const r = await db.from('puwer_inspections').insert({ org_id: me.org_id, site_id: siteId, user_id: me.id, week_start: weekStart, inspected_by: me.id, comments: comments || null } as never).select('id');
    if (r.error) return { id: null, failed: 0, error: 'Inspection NOT saved — check your signal and try again.' };
    id = ((r.data as { id: string }[] | null) ?? [])[0]?.id ?? null;
  } else {
    const r = await db.from('puwer_inspections').update({ comments: comments || null, updated_at: new Date().toISOString() } as never).eq('id', id);
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
