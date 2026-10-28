import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { HsDocList } from '@/components/HsDocList';
import { HsDocUpload } from '@/components/HsDocUpload';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { Muted } from '@/components/ui';
import { useSite } from '@/data/sites';
import { space } from '@/theme/theme';

export default function Coshh() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: site } = useSite(id);
  const { me } = useAuth();
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'COSHH' }} />
      {site && me && isManager(me) && <HsDocUpload kind="coshh" site={site} />}
      {site ? <HsDocList kind="coshh" site={site} /> : <Muted>Loading…</Muted>}
    </ScrollView>
  );
}
