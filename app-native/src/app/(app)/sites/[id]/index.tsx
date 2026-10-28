// Site home. Phase 1 starts with Check In / Out; the other tiles arrive screen by screen.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { Muted, Tile } from '@/components/ui';
import { useSite } from '@/data/sites';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { base, space } from '@/theme/theme';

export default function SiteHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: site, isLoading } = useSite(id);
  if (!site) return <Muted style={{ padding: space.l }}>{isLoading ? 'Loading…' : 'Project not found.'}</Muted>;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: site.name }} />
      {!!fullSiteAddress(site) && <Muted style={{ marginBottom: space.m }}>{fullSiteAddress(site)}</Muted>}
      <Tile icon="📍" tint={base.okBg} title="Check In / Out"
        sub={site.multi_site ? 'Pick the address you are at' : 'GPS check-in for this job'}
        onPress={() => router.push(`/sites/${site.id}/checkin`)} />
      <Tile icon="📋" tint={base.blueBg} title="Schedule of Works" sub="Tasks, photos and progress"
        onPress={() => router.push(`/sites/${site.id}/schedule`)} />
      <Tile icon="🦺" tint="#FDECEA" title="Health & Safety" sub="RAMS, COSHH, toolbox talks"
        onPress={() => router.push(`/sites/${site.id}/hs`)} />
      <Muted style={{ marginTop: space.m }}>Snags, materials and the rest of this job's tiles are being added next.</Muted>
    </ScrollView>
  );
}
