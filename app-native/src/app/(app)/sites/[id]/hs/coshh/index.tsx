import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { HsDocList } from '@/components/HsDocList';
import { HsDocUpload } from '@/components/HsDocUpload';
import { Button, Muted } from '@/components/ui';
import { HowTo } from '@/components/HowTo';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { page, space } from '@/theme/theme';

export default function Coshh() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: site } = useSite(id);
  const { me } = useAuth();
  const manager = !!me && isManager(me);
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'COSHH' }} />
      <HowTo k="coshh" />
      {site && manager && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <View style={{ flex: 1 }}><Button title="🧪 Create COSHH" onPress={() => router.push(`/sites/${site.id}/hs/coshh/new` as never)} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" title="📚 Add from COSHH Library" onPress={() => router.push(`/sites/${site.id}/hs/coshh/pick` as never)} /></View>
        </View>
      )}
      {site && manager && <HsDocUpload kind="coshh" site={site} />}
      {site ? <HsDocList kind="coshh" site={site} /> : <Muted>Loading…</Muted>}
    </ScrollView>
  );
}
