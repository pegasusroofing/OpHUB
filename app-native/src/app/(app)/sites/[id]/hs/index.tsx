// Health & Safety folder for a job. Ported from renderHealthSafety (630).
// Tiles follow the job's per-role visibility (629). Tools/HAVS/PUWER,
// Accident/Incident and Operatives are still to be built; their tiles say so.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { useToast } from '@/components/toast';
import { Muted, Tile } from '@/components/ui';
import { useHsSummary } from '@/data/hs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { canSeeTile } from '@/lib/rules/hs';
import { isManager } from '@/lib/roles';
import { base, space } from '@/theme/theme';

export default function HealthSafety() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
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
    { key: 'hs_havspuwer', icon: '🖐', tint: '#FFF3E0', title: 'Tools, HAVS & PUWER', sub: 'Coming soon' },
    { key: 'hs_ppe', icon: '🦺', tint: '#FDECEA', title: 'PPE', sub: mgr ? 'Issue & track PPE' : sum?.ppeToSign ? `${sum.ppeToSign} to sign` : 'My PPE', badge: mgr ? 0 : sum?.ppeToSign, go: '../ppe' },
    { key: 'hs_incidents', icon: '⚠️', tint: '#FDECEA', title: 'Accident / Incident', sub: 'Coming soon' },
    { key: 'hs_operatives', icon: '🪪', tint: '#E8F0FE', title: 'Operatives', sub: 'Coming soon' },
  ];
  const visible = tiles.filter((t) => canSeeTile(site, t.key, me.role));
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Health & Safety' }} />
      {visible.length ? visible.map((t) => (
        <Tile key={t.key} icon={t.icon} tint={t.tint} title={t.title} sub={t.sub} badge={t.badge || undefined}
          onPress={() => (t.go ? router.push(t.go.startsWith('../') ? `/sites/${site.id}/${t.go.slice(3)}` : `/sites/${site.id}/hs/${t.go}`) : toast('This part is still being built in the new app.'))} />
      )) : <Muted>Nothing here for you on this job.</Muted>}
    </ScrollView>
  );
}
