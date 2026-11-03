import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { HsDocList } from '@/components/HsDocList';
import { HsDocUpload } from '@/components/HsDocUpload';
import { Muted } from '@/components/ui';
import { HowTo } from '@/components/HowTo';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { page } from '@/theme/theme';

export default function Coshh() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: site } = useSite(id);
  const { me } = useAuth();
  const manager = !!me && isManager(me);
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'COSHH' }} />
      <HowTo k="coshh" />
      {site ? <HsDocList kind="coshh" site={site} /> : <Muted>Loading…</Muted>}
      {site && manager && (
        <HsDocUpload kind="coshh" site={site} createLabel="Create COSHH" options={[
          { label: 'Add From Library', go: () => router.push(`/sites/${site.id}/hs/coshh/pick` as never) },
          { label: 'Create COSHH', go: () => router.push(`/sites/${site.id}/hs/coshh/new` as never) },
        ]} />
      )}
    </ScrollView>
  );
}
