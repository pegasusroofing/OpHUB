// Check In / Out for a job. A multi-site job shows its addresses to pick from instead.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { CheckinPanel } from '@/components/CheckinPanel';
import { Empty, Muted, Row, SectionTitle, Toggle } from '@/components/ui';
import { useSite, useSubAddresses } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { isManager } from '@/lib/roles';
import type { SubAddress } from '@/lib/types';
import { base, space } from '@/theme/theme';

export default function Checkin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: site } = useSite(id);
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Check In / Out' }} />
      {!site ? <Muted>Loading…</Muted> : (
        <>
          <Muted style={{ marginBottom: space.m }}>{[site.name, fullSiteAddress(site)].filter(Boolean).join(' · ')}</Muted>
          {site.multi_site ? <AddressList siteId={site.id} /> : <CheckinPanel site={site} />}
        </>
      )}
    </ScrollView>
  );
}

function AddressList({ siteId }: { siteId: string }) {
  const { me } = useAuth();
  const { data = [], isLoading } = useSubAddresses(siteId);
  const [closedOpen, setClosedOpen] = useState(false);
  const open = data.filter((a) => !a.closed);
  const closed = data.filter((a) => a.closed);
  const row = (a: SubAddress) => (
    <Row key={a.id} dim={a.closed} title={a.closed ? `${a.name} (Closed)` : a.name}
      sub={[a.address, a.postcode].filter(Boolean).join(', ') || null}
      extra={<Text style={{ fontSize: 12, color: base.slate, marginTop: 4 }}>{a.geofence_lat != null ? `📍 Geofence set — ${a.geofence_radius_m || 100}m radius` : 'No geofence set yet'}</Text>}
      onPress={() => router.push(`/sites/${siteId}/checkin/${a.id}`)} />
  );
  if (isLoading) return <Muted>Loading addresses…</Muted>;
  return (
    <>
      <SectionTitle>Choose the address you're checking in to</SectionTitle>
      {open.length ? open.map(row) : (
        <Empty>{closed.length ? 'No open addresses — see Closed Addresses below.'
          : `No addresses have been added for this project yet.${isManager(me) ? '' : ' Ask your project manager to add one.'}`}</Empty>
      )}
      {!!closed.length && (
        <>
          <Toggle title={`Closed Addresses (${closed.length})`} open={closedOpen} onPress={() => setClosedOpen(!closedOpen)} />
          {closedOpen && closed.map(row)}
        </>
      )}
    </>
  );
}
