// Check In / Out for one address of a multi-site job.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { CheckinPanel } from '@/components/CheckinPanel';
import { Link, Muted } from '@/components/ui';
import { useSite, useSubAddresses } from '@/data/sites';
import { page, space } from '@/theme/theme';

export default function CheckinAddress() {
  const { id, sub } = useLocalSearchParams<{ id: string; sub: string }>();
  const { data: site } = useSite(id);
  const { data: addresses, isLoading } = useSubAddresses(id);
  const addr = addresses?.find((a) => a.id === sub);
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Check In / Out' }} />
      {!site || isLoading ? <Muted>Loading…</Muted> : !addr ? (
        <>
          <Muted>Address not found.</Muted>
          <Link title="‹ All addresses" onPress={() => router.replace(`/sites/${id}/checkin`)} />
        </>
      ) : (
        <>
          <Muted style={{ marginBottom: space.m }}>{site.name} — {addr.name}</Muted>
          <CheckinPanel site={site} sub={addr} />
        </>
      )}
    </ScrollView>
  );
}
