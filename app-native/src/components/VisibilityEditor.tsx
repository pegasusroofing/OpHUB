// "Who can see this" (470 scheduleAssignFormHtml): a Schedule of Works section
// or task, or a Drawings folder, is either seen by All, or only by the ticked
// Project Managers and / or Operatives. The database enforces it (RLS), so an
// unticked operative can't load the row at all. Admins always see everything.
// PMs start fully ticked so narrowing to some operatives never locks PMs out.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Check, Muted, SectionTitle } from '@/components/ui';
import { FinChip } from '@/components/FinNav';
import { useTeam } from '@/data/admin';
import { supabase } from '@/lib/supabase';
import { base } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Row = Record<string, any>;
export type VisTable = 'schedule_sections' | 'schedule_tasks' | 'drawing_folders';

export function VisibilityEditor({ table, id, siteId, orgId, onClose }: { table: VisTable; id: string; siteId: string; orgId: string; onClose: (saved: boolean) => void }) {
  const toast = useToast();
  const { data: team } = useTeam(orgId);
  const { data } = useQuery({ queryKey: ['vis', table, id], queryFn: async () => {
    const [r, a] = await Promise.all([db.from(table).select('visibility_mode,assigned_pm_ids,assigned_operative_ids').eq('id', id).maybeSingle(), db.from('site_assignments').select('user_id').eq('site_id', siteId)]);
    return { row: (r.data as Row | null) ?? {}, assigned: [...new Set((((a.data as Row[] | null) ?? []).map((x) => x.user_id as string)))] };
  } });
  const [d, setD] = useState<{ all: boolean; pmOn: boolean; pm: string[]; opOn: boolean; op: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data || !team) return <Card><Muted>Loading…</Muted></Card>;
  const pms = team.filter((p) => p.role === 'pm');
  const ops = team.filter((p) => data.assigned.includes(p.id) && !['pm', 'admin'].includes(p.role));
  const r = data.row;
  const cur: { all: boolean; pmOn: boolean; pm: string[]; opOn: boolean; op: string[] } = d ?? { all: r.visibility_mode !== 'assigned', pmOn: true, pm: r.assigned_pm_ids?.length ? r.assigned_pm_ids : pms.map((p) => p.id), opOn: r.visibility_mode === 'assigned' ? !!r.assigned_operative_ids?.length : true, op: r.assigned_operative_ids?.length ? r.assigned_operative_ids : data.assigned };
  const set = (p: Partial<typeof cur>) => setD({ ...cur, ...p });
  const flip = (k: 'pm' | 'op', uid: string) => set({ [k]: cur[k].includes(uid) ? cur[k].filter((x: string) => x !== uid) : [...cur[k], uid] } as Partial<typeof cur>);
  const save = async () => {
    setBusy(true);
    const patch = cur.all ? { visibility_mode: 'all', assigned_pm_ids: [], assigned_operative_ids: [] } : { visibility_mode: 'assigned', assigned_pm_ids: cur.pmOn ? cur.pm : [], assigned_operative_ids: cur.opOn ? cur.op : [] };
    const e = (await db.from(table).update(patch as never).eq('id', id)).error;
    setBusy(false);
    if (e) { toast('Could not save — try again.'); return; }
    toast('Visibility updated'); onClose(true);
  };
  return (
    <Card style={{ backgroundColor: base.paper }}>
      <SectionTitle>Who can see this</SectionTitle>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}><FinChip on={cur.all} label="All" onPress={() => set({ all: true })} /><FinChip on={!cur.all} label="Only the people ticked" onPress={() => set({ all: false })} /></View>
      {!cur.all && <>
        <Check label="Project Managers" value={cur.pmOn} onChange={(x) => set({ pmOn: x })} />
        {cur.pmOn && <View style={{ paddingLeft: 18, marginBottom: 6 }}>{pms.length ? pms.map((p) => <Check key={p.id} label={p.name} value={cur.pm.includes(p.id)} onChange={() => flip('pm', p.id)} />) : <Muted>No project managers.</Muted>}</View>}
        <Check label="Operatives" value={cur.opOn} onChange={(x) => set({ opOn: x })} />
        {cur.opOn && <View style={{ paddingLeft: 18, marginBottom: 6 }}>{ops.length ? ops.map((p) => <Check key={p.id} label={p.name} value={cur.op.includes(p.id)} onChange={() => flip('op', p.id)} />) : <Muted>No operatives assigned to this job.</Muted>}</View>}
        {!cur.pmOn && !cur.opOn && <Muted style={{ color: base.warn }}>Nobody but admins will be able to see this until you tick Project Managers and / or Operatives.</Muted>}
      </>}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <View style={{ flex: 1 }}><Button busy={busy} title="Save" onPress={() => void save()} /></View>
        <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => onClose(false)} /></View>
      </View>
    </Card>
  );
}
