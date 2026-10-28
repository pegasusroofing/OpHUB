// Tools, HAVS & PUWER folder. Ported from renderHavsPuwer (630).
// HAVS and LOLER are hidden from operatives unless switched on for this job
// (default: site managers only — TILE_VIS_DEFAULTS in 629).
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { useToast } from '@/components/toast';
import { Muted, Tile } from '@/components/ui';
import { useMyTools } from '@/data/myTools';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { canSeeTile } from '@/lib/rules/hs';
import { isManager } from '@/lib/roles';
import { space } from '@/theme/theme';

export default function HavsPuwer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const { data: site } = useSite(id);
  const { data: tools } = useMyTools();
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const n = tools?.length ?? 0;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Tools, HAVS & PUWER' }} />
      {!isManager(me) && (
        <Tile icon="🔧" tint="#E8F0FE" title="My Tools" sub={n ? `${n} tool${n === 1 ? '' : 's'}` : 'Add your tools'} badge={n ? undefined : 1}
          onPress={() => router.push(`/sites/${site.id}/hs/mytools`)} />
      )}
      {canSeeTile(site, 'hs_havs', me.role, ['site_manager']) && (
        <Tile icon="🖐" tint="#FFF3E0" title="HAVS" sub="Vibration exposure" onPress={() => router.push(`/sites/${site.id}/hs/havs`)} />
      )}
      <Tile icon="🛠" tint="#E8F0FE" title="PUWER Tool Inspection" sub="Weekly tool checks" onPress={() => router.push(`/sites/${site.id}/hs/puwer`)} />
      {canSeeTile(site, 'hs_loler', me.role, ['site_manager']) && (
        <Tile icon="⛓" tint="#F3EAFB" title="LOLER Inspection" sub="Lifting equipment — coming soon" onPress={() => toast('LOLER inspections are still being built in the new app.')} />
      )}
    </ScrollView>
  );
}
