import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { HsDocList } from '@/components/HsDocList';
import { PolicyCard } from '@/components/PolicyCard';
import { Muted } from '@/components/ui';
import { useSite } from '@/data/sites';
import { space } from '@/theme/theme';

export default function Rams() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: site } = useSite(id);
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'RAMS' }} />
      <PolicyCard />
      {site ? <HsDocList kind="rams" site={site} /> : <Muted>Loading…</Muted>}
    </ScrollView>
  );
}
