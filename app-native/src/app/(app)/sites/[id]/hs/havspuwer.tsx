// Tools, HAVS & PUWER folder. Ported from renderHavsPuwer (630).
// HAVS and LOLER are hidden from operatives unless switched on for this job
// (default: site managers only — TILE_VIS_DEFAULTS in 629); PMs / admins switch it
// from the tile's ⋮.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { useToast } from '@/components/toast';
import { Muted, Tile } from '@/components/ui';
import { useMyTools } from '@/data/myTools';
import { useSite } from '@/data/sites';
import { tileRoles, tileVisMenu } from '@/data/tileVis';
import { useAuth } from '@/lib/auth';
import { canSeeTile } from '@/lib/rules/hs';
import { isFullManager, isManager } from '@/lib/roles';
import { page, space } from '@/theme/theme';

export default function HavsPuwer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: tools } = useMyTools();
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const n = tools?.length ?? 0;
  const visProps = (key: string, label: string) => (isFullManager(me) ? { dim: !tileRoles(site, key).includes('operative'), onMenu: async () => { const m = await tileVisMenu(me, site, key, label); if (m) { toast(m); void qc.invalidateQueries({ queryKey: ['sites'] }); } } } : {});
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Tools, HAVS & PUWER' }} />
      {!isManager(me) && (
        <Tile icon="🔧" tint="#E8F0FE" title="My Tools" sub={n ? `${n} tool${n === 1 ? '' : 's'}` : 'Add your tools'} badge={n ? undefined : 1}
          onPress={() => router.push(`/sites/${site.id}/hs/mytools`)} />
      )}
      {canSeeTile(site, 'hs_havs', me.role, ['site_manager']) && (
        <Tile icon="🖐" tint="#FFF3E0" title="HAVS" sub="Vibration exposure" onPress={() => router.push(`/sites/${site.id}/hs/havs`)} {...visProps('hs_havs', 'HAVS')} />
      )}
      <Tile icon="🛠" tint="#E8F0FE" title="PUWER Tool Inspection" sub="Weekly tool checks" onPress={() => router.push(`/sites/${site.id}/hs/puwer`)} />
      {canSeeTile(site, 'hs_loler', me.role, ['site_manager']) && (
        <Tile icon="⛓" tint="#F3EAFB" title="LOLER Inspection" sub="Lifting equipment" onPress={() => router.push(`/sites/${site.id}/hs/loler` as never)} {...visProps('hs_loler', 'LOLER Inspection')} />
      )}
    </ScrollView>
  );
}
