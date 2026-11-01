// Client Info (380 renderClientInfo): the client and contact on this job. Managers open it from the client card on the job's
// home page. It reads as plain details with an Edit button; the name is free type and suggests your clients as you go. A job
// whose client was set up in Finance is locked here (Andy, 1 Nov 2026): it's only changed from Finance.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { updateSite } from '@/data/siteAdmin';
import { useSite, useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { clientPortfolio } from '@/lib/rules/checkin';
import { isEmail } from '@/lib/rules/materials';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: space.m };
const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a: object) => Promise<{ data: unknown; error: unknown }>;
// 030 applyTitleCase: capitals only at the start or after a space (Andy's House, not Andy'S House).
const titleCase = (t: string) => t.replace(/(^|\s)([a-z])/g, (_m, a: string, c: string) => a + c.toUpperCase());
type Known = { name: string; contact?: string | null; phone?: string | null; email?: string | null };

export default function ClientInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: all = [] } = useSites();
  const [f, setF] = useState<{ name: string; contact: string; phone: string; email: string } | null>(null);
  const [typing, setTyping] = useState(false);
  const { data: locked } = useQuery({ queryKey: ['siteClientLocked', id], enabled: !!id, queryFn: async () => (await rpc('site_client_from_finance', { p_site: id })).data === true });
  const { data: directory = [] } = useQuery({ queryKey: ['clientSearch', me?.org_id], enabled: !!f, staleTime: 300000, queryFn: async () => (((await rpc('quote_client_search', { q: '' })).data as Known[] | null) ?? []) });
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const v = f ?? { name: site.client_name || '', contact: site.client_contact_name || '', phone: site.client_phone || '', email: site.client_email || '' };
  const row = (label: string, value: string) => (
    <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: base.cardLine }}>
      <Muted style={{ fontWeight: '700' }}>{label}</Muted>
      <Text style={{ flex: 1, textAlign: 'right', color: base.ink, fontWeight: '600' }}>{value || '—'}</Text>
    </View>
  );
  // Yours from Finance's Directory and from other jobs, as you type.
  const seen = new Set<string>();
  const known: Known[] = [...directory, ...clientPortfolio(all)].filter((c) => { const k = c.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  const hits = typing && v.name.trim() ? known.filter((c) => c.name.toLowerCase().includes(v.name.trim().toLowerCase()) && c.name !== v.name).slice(0, 6) : [];
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Client Info' }} />
      {!f ? (
        <Card>
          {row('Client', v.name)}{row('Contact', v.contact)}{row('Number', v.phone)}{row('Email', v.email)}
          {locked
            ? <Muted style={{ marginTop: space.m }}>This client was set up on the Finance job, so it’s only changeable from Finance.</Muted>
            : <View style={{ marginTop: space.m }}><Button kind="ghost" title="Edit" onPress={() => setF(v)} /></View>}
        </Card>
      ) : (
        <Card>
          <Muted style={{ fontWeight: '700' }}>Client Name</Muted>
          <TextInput accessibilityLabel="Client Name" value={v.name} onFocus={() => setTyping(true)} onChangeText={(t) => { setTyping(true); setF({ ...v, name: titleCase(t) }); }} placeholder="Type a name, or pick one of your clients" style={[box, hits.length ? { marginBottom: 4 } : null]} />
          {hits.length > 0 && (
            <View style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, marginBottom: space.m, overflow: 'hidden' }}>
              {hits.map((c, i) => (
                <Pressable key={c.name} accessibilityRole="button" onPress={() => { setTyping(false); setF({ name: c.name, contact: c.contact || v.contact, phone: c.phone || v.phone, email: c.email || v.email }); }} style={{ padding: 10, borderTopWidth: i ? 1 : 0, borderTopColor: base.cardLine, backgroundColor: base.card }}>
                  <Text style={{ color: base.ink, fontWeight: '600' }}>{c.name}</Text>
                  {!!(c.contact || c.email) && <Muted>{[c.contact, c.email].filter(Boolean).join(' · ')}</Muted>}
                </Pressable>
              ))}
            </View>
          )}
          <Muted style={{ fontWeight: '700' }}>Client Contact Name</Muted>
          <TextInput value={v.contact} onChangeText={(t) => setF({ ...v, contact: titleCase(t) })} placeholder="Optional" style={box} />
          <Muted style={{ fontWeight: '700' }}>Client Contact Number</Muted>
          <TextInput value={v.phone} onChangeText={(t) => setF({ ...v, phone: t })} keyboardType="phone-pad" placeholder="Optional" style={box} />
          <Muted style={{ fontWeight: '700' }}>Client Contact Email</Muted>
          <TextInput value={v.email} onChangeText={(t) => setF({ ...v, email: t })} keyboardType="email-address" autoCapitalize="none" placeholder="Optional" style={box} />
          <Muted style={{ marginBottom: space.m }}>When an email address is entered here, a &quot;CC client contact&quot; tick box appears on the app&apos;s email pickers so whoever&apos;s sending can loop the client in.</Muted>
          <View style={{ flexDirection: 'row', gap: space.m }}>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setF(null)} /></View>
            <View style={{ flex: 1 }}><Button title="Save" onPress={async () => {
              if (v.email.trim() && !isEmail(v.email)) { toast('Enter a valid email address.'); return; }
              if (await updateSite(qc, id, { client_name: v.name.trim() || null, client_contact_name: v.contact.trim() || null, client_phone: v.phone.trim() || null, client_email: v.email.trim() || null })) {
                toast('Client info updated'); setF(null);
              } else toast('Could not save — try again.');
            }} /></View>
          </View>
        </Card>
      )}
    </ScrollView>
  );
}
