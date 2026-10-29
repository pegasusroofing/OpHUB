// Check In / Out for a job. A multi-site job shows its addresses to pick from instead.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { CheckinPanel } from '@/components/CheckinPanel';
import { useToast } from '@/components/toast';
import { Button, Card, Empty, Field, Muted, Row, SectionTitle, Toggle } from '@/components/ui';
import { HowTo } from '@/components/HowTo';
import { addAddress } from '@/data/checkinManager';
import { useSite, useSubAddresses } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { isManager } from '@/lib/roles';
import type { SubAddress } from '@/lib/types';
import { base, page, space } from '@/theme/theme';

export default function Checkin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: site } = useSite(id);
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Check In / Out' }} />
      <HowTo k="checkin" />
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
      {isManager(me) && <AddAddress siteId={siteId} />}
    </>
  );
}

// Managers: add an address to a multi-site job (370). Its geofence is set from the address's own page.
function AddAddress({ siteId }: { siteId: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [postcode, setPostcode] = useState('');
  if (!me) return null;
  if (!open) return <Button kind="ghost" title="+ Add Address" onPress={() => setOpen(true)} />;
  return (
    <Card style={{ backgroundColor: base.paper }}>
      <SectionTitle>Add Address</SectionTitle>
      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. 12 High Street" />
      <Field label="Address (optional)" value={address} onChangeText={setAddress} autoCapitalize="words" />
      <Field label="Postcode (optional)" value={postcode} onChangeText={(v) => setPostcode(v.toUpperCase())} autoCapitalize="characters" />
      <Muted style={{ marginBottom: 10 }}>The geofence for this address can be set from its own page afterwards.</Muted>
      <Button title="Add Address" onPress={async () => {
        if (!name.trim()) { toast('Enter a name for this address.'); return; }
        if (await addAddress(me, siteId, name.trim(), address.trim(), postcode.trim())) {
          toast('Address added'); setOpen(false); setName(''); setAddress(''); setPostcode('');
          void qc.invalidateQueries({ queryKey: ['subAddresses', siteId] });
        } else toast('Could not save — try again.');
      }} />
      <Button kind="ghost" title="Cancel" onPress={() => setOpen(false)} />
    </Card>
  );
}
