// One subcontractor company's hub (550 renderSubcontractorHub).
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { Muted, Tile } from '@/components/ui';
import { useSubco } from '@/data/subcontractors';
import { useAuth } from '@/lib/auth';
import { space } from '@/theme/theme';

export default function SubcoHub() {
  const { id, co } = useLocalSearchParams<{ id: string; co: string }>();
  const { me } = useAuth();
  const { data, isLoading } = useSubco(co, me);
  if (isLoading || !data) return <Muted style={{ padding: space.l }}>{isLoading ? 'Loading…' : 'Subcontractor not found.'}</Muted>;
  const n = data.counts;
  const go = (p: string) => () => router.push(`/sites/${id}/mc/subcontractors/${co}/${p}` as never);
  const docs = (k: number) => `${k} document${k === 1 ? '' : 's'}`;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: data.company.name }} />
      <Tile icon="📄" tint="#E7E9EE" title="RAMS" sub={docs(n.rams)} onPress={go('docs?kind=rams')} />
      <Tile icon="🧪" tint="#E7E9EE" title="COSHH" sub={docs(n.coshh)} onPress={go('docs?kind=coshh')} />
      <Tile icon="📢" tint="#E7E9EE" title="TBT" sub={`${n.tbt} live`} onPress={go('tbt')} />
      <Tile icon="📋" tint="#E7E9EE" title="Schedule of Works" sub={`${n.done} of ${n.tasks} complete`} onPress={go('schedule')} />
      <Tile icon="🧾" tint="#E7E9EE" title="Permits To Work" sub={n.permits ? `${n.permits} open` : 'None open'} onPress={() => router.push(`/sites/${id}/mc/permits?co=${co}` as never)} />
      <Tile icon="🔍" tint="#E7E9EE" title="Inspections" sub={`${n.inspections} file${n.inspections === 1 ? '' : 's'}`} onPress={go('inspections')} />
      <Tile icon="📝" tint="#E7E9EE" title="Daily Briefings" sub={`${n.briefings} logged`} onPress={go('briefings')} />
      <Tile icon="👷" tint="#E7E9EE" title="Operatives" sub={`${n.operatives} allocated`} onPress={go('operatives')} />
    </ScrollView>
  );
}
