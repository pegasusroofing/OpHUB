// Health & Safety folder for a job. Ported from renderHealthSafety (630).
// Tiles follow the job's per-role visibility (629); PMs / admins change it from each
// tile's ⋮ (a tile hidden from operatives is dimmed for them). Operatives: managers see the
// people on this job and their certificates; operatives see their own dashboard.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { useToast } from '@/components/toast';
import { JobGrid, Muted, Tile } from '@/components/ui';
import { HowTo } from '@/components/HowTo';
import { useHsSummary } from '@/data/hs';
import { useSite } from '@/data/sites';
import { tileRoles, tileVisMenu } from '@/data/tileVis';
import { useAuth } from '@/lib/auth';
import { canSeeTile } from '@/lib/rules/hs';
import { isFullManager, isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, space } from '@/theme/theme';

export default function HealthSafety() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: sum } = useHsSummary(site);
  // 630: operatives see the briefing and incident counts on the tiles too (managers get theirs from the summary).
  const opCounts = useQuery({
    queryKey: ['hsOpCounts', site?.id, me?.org_id], enabled: !!site && !!me && !isManager(me),
    queryFn: async () => {
      const tpl = ((await supabase.from('report_templates').select('id').eq('org_id', me!.org_id as string).eq('is_daily_briefing', true).eq('archived', false)).data as { id: string }[] | null) ?? [];
      const [b, i] = await Promise.all([
        tpl.length ? supabase.from('report_submissions').select('id').eq('site_id', site!.id).in('template_id', tpl.map((t) => t.id)) : Promise.resolve({ data: [] }),
        supabase.from('incident_reports').select('id').eq('site_id', site!.id),
      ]);
      return { briefings: ((b.data as unknown[] | null) ?? []).length, incidents: ((i.data as unknown[] | null) ?? []).length };
    },
  }).data;
  if (!site || !me) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const mgr = isManager(me);
  const plural = (n: number) => `${n} document${n === 1 ? '' : 's'}`;
  const tiles: { key: string; icon: string; tint: string; title: string; sub: string; badge?: number | string; go?: string }[] = [
    { key: 'hs_rams', icon: '📄', tint: '#E7E9EE', title: 'RAMS', sub: sum ? plural(sum.rams) : '…', badge: mgr ? (sum?.mgr?.ramsGap ? '!' : 0) : sum?.ramsTodo, go: 'rams' },
    { key: 'hs_coshh', icon: '🧪', tint: '#E7E9EE', title: 'COSHH', sub: sum ? plural(sum.coshh) : '…', badge: mgr ? (sum?.mgr?.coshhGap ? '!' : 0) : sum?.coshhTodo, go: 'coshh' },
    { key: 'hs_tbt', icon: '🗣', tint: base.blueBg, title: 'TBT', sub: sum ? (sum.liveTbts ? 'Live now' : 'None live') : '…', go: 'tbt' },
    { key: 'hs_briefings', icon: '📣', tint: '#FDECEA', title: 'Daily Briefings', sub: mgr && sum?.mgr ? (sum.mgr.briefings ? `${sum.mgr.briefings} briefing${sum.mgr.briefings === 1 ? '' : 's'}` : 'None yet') : opCounts ? (opCounts.briefings ? `${opCounts.briefings} briefing${opCounts.briefings === 1 ? '' : 's'}` : 'None yet') : '…', go: 'briefings' },
    { key: 'hs_havspuwer', icon: '🖐', tint: '#FFF3E0', title: 'Tools, HAVS & PUWER', sub: 'Tools, vibration & tool checks', go: 'havspuwer' },
    { key: 'hs_ppe', icon: '🦺', tint: '#FDECEA', title: 'PPE', sub: mgr ? (sum?.mgr?.ppeRequests ? `${sum.mgr.ppeRequests} request${sum.mgr.ppeRequests === 1 ? '' : 's'}` : 'Issue & track PPE') : sum?.ppeToSign ? `${sum.ppeToSign} to sign` : 'My PPE', badge: mgr ? sum?.mgr?.ppeRequests : sum?.ppeToSign, go: '../ppe' },
    { key: 'hs_incidents', icon: '⚠️', tint: '#FDECEA', title: 'Accident / Incident', sub: mgr && sum?.mgr ? (sum.mgr.incidents ? `${sum.mgr.incidents} filed` : 'Report near miss') : opCounts ? (opCounts.incidents ? `${opCounts.incidents} filed` : 'Report near miss') : '…', go: 'incidents' },
    { key: 'hs_operatives', icon: '🪪', tint: '#E8F0FE', title: 'Operatives', sub: mgr ? 'Certificates & tools' : 'Dashboard & certifications', go: mgr || me.role === 'client' ? `/pm/operatives?site=${site.id}` : '/dashboard' },
  ];
  // 630 client branch: RAMS, COSHH, TBT, Completed Inspections (PUWER) and Operative Dashboard; view only, no badges.
  const clientTiles: typeof tiles = [
    { key: 'hs_rams', icon: '📄', tint: '#E7E9EE', title: 'RAMS', sub: sum ? plural(sum.rams) : '…', go: 'rams' },
    { key: 'hs_coshh', icon: '🧪', tint: '#E7E9EE', title: 'COSHH', sub: sum ? plural(sum.coshh) : '…', go: 'coshh' },
    { key: 'hs_tbt', icon: '📢', tint: '#E7E9EE', title: 'TBT', sub: sum ? `${sum.liveTbts} live` : '…', go: 'tbt' },
    { key: 'hs_puwer', icon: '🛠', tint: '#E7E9EE', title: 'Completed Inspections', sub: 'PUWER', go: 'puwer' },
    { key: 'hs_operatives', icon: '👷', tint: '#E7E9EE', title: 'Operative Dashboard', sub: 'Roster & certificates', go: `/pm/operatives?site=${site.id}` },
  ];
  const visible = me.role === 'client' ? clientTiles : tiles.filter((t) => canSeeTile(site, t.key, me.role));
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Health & Safety' }} />
      <HowTo k="hs" />
      {visible.length ? <JobGrid>{visible.map((t) => (
        <Tile key={t.key} icon={t.icon} tint={t.tint} title={t.title} sub={t.sub} badge={t.badge || undefined}
          dim={isFullManager(me) && !tileRoles(site, t.key).includes('operative')}
          onMenu={isFullManager(me) ? async () => { const m = await tileVisMenu(me, site, t.key, t.title); if (m) { toast(m); void qc.invalidateQueries({ queryKey: ['sites'] }); } } : undefined}
          onPress={() => (t.go ? router.push(t.go.startsWith('/') ? (t.go as never) : t.go.startsWith('../') ? `/sites/${site.id}/${t.go.slice(3)}` : `/sites/${site.id}/hs/${t.go}`) : toast('This part is still being built in the new app.'))} />
      ))}</JobGrid> : <Muted>Nothing here for you on this job.</Muted>}
    </ScrollView>
  );
}
