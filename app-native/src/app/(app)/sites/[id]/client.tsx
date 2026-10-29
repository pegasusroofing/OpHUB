// Client Info (380 renderClientInfo): the client and contact on this job. Managers
// edit it from the client card on the job's home page, and can fill it from a
// saved client (any client already used on a job).
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, TextInput } from 'react-native';

import { chooseAction, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { updateSite } from '@/data/siteAdmin';
import { useSite, useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { clientPortfolio } from '@/lib/rules/checkin';
import { isEmail } from '@/lib/rules/materials';
import { isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
const titleCase = (t: string) => t.replace(/\b([a-z])/g, (c) => c.toUpperCase());

export default function ClientInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: all = [] } = useSites();
  const [f, setF] = useState<{ name: string; contact: string; phone: string; email: string } | null>(null);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const v = f ?? { name: site.client_name || '', contact: site.client_contact_name || '', phone: site.client_phone || '', email: site.client_email || '' };
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Client Info' }} />
      <Card>
        {clientPortfolio(all).length > 0 && <Button kind="ghost" title={`📇 Choose a saved client (${clientPortfolio(all).length})`} onPress={async () => {
          const list = clientPortfolio(all);
          const k = await chooseAction('Saved clients', list.map((c) => ({ key: c.name, label: `${c.name}${c.contact ? ` — ${c.contact}` : ''}` })));
          const c = list.find((x) => x.name === k); if (!c) return;
          setF({ name: c.name, contact: c.contact || v.contact, phone: c.phone || v.phone, email: c.email || v.email }); toast('Client details filled in');
        }} />}
        <Muted style={{ fontWeight: '700' }}>Client Name</Muted>
        <TextInput value={v.name} onChangeText={(t) => setF({ ...v, name: titleCase(t) })} style={box} />
        <Muted style={{ fontWeight: '700' }}>Client Contact Name</Muted>
        <TextInput value={v.contact} onChangeText={(t) => setF({ ...v, contact: titleCase(t) })} placeholder="Optional" style={box} />
        <Muted style={{ fontWeight: '700' }}>Client Contact Number</Muted>
        <TextInput value={v.phone} onChangeText={(t) => setF({ ...v, phone: t })} keyboardType="phone-pad" placeholder="Optional" style={box} />
        <Muted style={{ fontWeight: '700' }}>Client Contact Email</Muted>
        <TextInput value={v.email} onChangeText={(t) => setF({ ...v, email: t })} keyboardType="email-address" autoCapitalize="none" placeholder="Optional" style={box} />
        <Muted>When an email address is entered here, a &quot;CC client contact&quot; tick box appears on the app&apos;s email pickers so whoever&apos;s sending can loop the client in.</Muted>
        <Button title="Save" onPress={async () => {
          if (v.email.trim() && !isEmail(v.email)) { toast('Enter a valid email address.'); return; }
          if (await updateSite(qc, id, { client_name: v.name.trim() || null, client_contact_name: v.contact.trim() || null, client_phone: v.phone.trim() || null, client_email: v.email.trim() || null })) {
            toast('Client info updated'); router.back();
          } else toast('Could not save — try again.');
        }} />
      </Card>
    </ScrollView>
  );
}
