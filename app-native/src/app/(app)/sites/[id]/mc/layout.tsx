// Site Rules & Layout (540): signed like COSHH — everyone assigned to the job
// signs to confirm they've read it; managers upload and delete.
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { HsDocList } from '@/components/HsDocList';
import { HsDocUpload } from '@/components/HsDocUpload';
import { Muted } from '@/components/ui';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { space } from '@/theme/theme';

export default function SiteLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: site } = useSite(id);
  const { me } = useAuth();
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Site Rules & Layout' }} />
      {site && me && isManager(me) && <HsDocUpload kind="layout" site={site} />}
      {site ? <HsDocList kind="layout" site={site} /> : <Muted>Loading…</Muted>}
    </ScrollView>
  );
}
