// Health & Safety folder for a job. Ported from renderHealthSafety (630).
// Tiles follow the job's per-role visibility (629); PMs / admins change it from each
// tile's ⋮ (a tile hidden from operatives is dimmed for them). Operatives: managers see the
// people on this job and their certificates; operatives see their own dashboard.
import { useQueryClient } from '@tanstack/react-query';
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
import { base, page, space } from '@/theme/theme';

export default function HealthSafety() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: sum } = useHsSummary(site);
  if (!site || !me) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const mgr = isManager(me);
  const plural = (n: number) => `${n} document${n === 1 ? '' : 's'}`;
  const tiles: { key: string; icon: string; tint: string; title: string; sub: string; badge?: number; go?: string }[] = [
    { key: 'hs_rams', icon: '📄', tint: '#E7E9EE', title: 'RAMS', sub: sum ? plural(sum.rams) : '…', badge: mgr ? 0 : sum?.ramsTodo, go: 'rams' },
    { key: 'hs_coshh', icon: '🧪', tint: '#E7E9EE', title: 'COSHH', sub: sum ? plural(sum.coshh) : '…', badge: mgr ? 0 : sum?.coshhTodo, go: 'coshh' },
    { key: 'hs_tbt', icon: '🗣', tint: base.blueBg, title: 'TBT', sub: sum ? (sum.liveTbts ? 'Live now' : 'None live') : '…', go: 'tbt' },
    { key: 'hs_briefings', icon: '📣', tint: '#FDECEA', title: 'Daily Briefings', sub: 'Read and sign', go: 'briefings' },
    { key: 'hs_havspuwer', icon: '🖐', tint: '#FFF3E0', title: 'Tools, HAVS & PUWER', sub: 'Tools, vibration & tool checks', go: 'havspuwer' },
    { key: 'hs_ppe', icon: '🦺', tint: '#FDECEA', title: 'PPE', sub: mgr ? 'Issue & track PPE' : sum?.ppeToSign ? `${sum.ppeToSign} to sign` : 'My PPE', badge: mgr ? 0 : sum?.ppeToSign, go: '../ppe' },
    { key: 'hs_incidents', icon: '⚠️', tint: '#FDECEA', title: 'Accident / Incident', sub: 'Report & view', go: 'incidents' },
    { key: 'hs_operatives', icon: '🪪', tint: '#E8F0FE', title: 'Operatives', sub: mgr ? 'Certificates & tools' : 'My certificates & tools', go: mgr || me.role === 'client' ? `/pm/operatives?site=${site.id}` : '/dashboard' },
  ];
  const visible = tiles.filter((t) => canSeeTile(site, t.key, me.role));
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
