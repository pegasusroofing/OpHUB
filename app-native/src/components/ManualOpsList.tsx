// Operatives page (9219zzg manualOpsListHtml, 4 Nov 2026): "+ Add Operative" for someone who hasn't signed up
// yet (name, number, email, trade), then "Not Signed Up Yet (n)" and a "Signed Up" heading over the usual list.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Field, Muted, SectionTitle } from '@/components/ui';
import { addManualOperative, EMAIL_OK, useManualOperatives } from '@/data/manualOps';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { base, radius } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const initials = (n: string) => (n || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function ManualOpsList({ q }: { q: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: rows = [] } = useManualOperatives(me?.org_id);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: '', phone: '', email: '', trade: '' });
  if (!me) return null;
  const list = rows.filter((m) => !q.trim() || String(m.name || '').toLowerCase().includes(q.trim().toLowerCase()));
  const add = async () => {
    const v = { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim().toLowerCase(), trade: f.trade.trim() };
    if (!v.name) { toast('Enter their name.'); return; }
    if (v.email && !EMAIL_OK.test(v.email)) { toast('Check the email address.'); return; }
    setBusy(true);
    if (v.email) {
      const p = (((await db.from('profiles').select('id,name').ilike('email', v.email)).data as { id: string; name: string }[] | null) ?? [])[0];
      if (p) { setBusy(false); toast(`${p.name} has already signed up with that email.`); router.push(`/pm/operatives/${p.id}` as never); return; }
    }
    const r = await addManualOperative(me, v);
    setBusy(false);
    if (!r.id) { toast(r.error || 'Could not save — try again.'); return; }
    setOpen(false); setF({ name: '', phone: '', email: '', trade: '' });
    void qc.invalidateQueries({ queryKey: ['manualOps'] }); void qc.invalidateQueries({ queryKey: ['trainingMatrix'] });
    router.push(`/pm/operatives/m-${r.id}` as never);
  };
  return (
    <View style={{ marginBottom: 6 }}>
      {open ? (
        <Card>
          <SectionTitle>Add An Operative</SectionTitle>
          <Muted style={{ marginBottom: 10 }}>For someone who hasn&apos;t signed up to OpHUB yet. When they sign up with this email, their certificates and OneDrive folder move onto their login automatically.</Muted>
          <Field label="Name" placeholder="Full name" value={f.name} onChangeText={(t) => setF({ ...f, name: t })} autoCapitalize="words" autoFocus />
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 200 }}><Field label="Contact Number" placeholder="e.g. 07123 456789" value={f.phone} onChangeText={(t) => setF({ ...f, phone: t })} keyboardType="phone-pad" /></View>
            <View style={{ flex: 1, minWidth: 200 }}><Field label="Email (To Link When They Sign Up)" placeholder="name@example.com" value={f.email} onChangeText={(t) => setF({ ...f, email: t })} keyboardType="email-address" autoCapitalize="none" autoComplete="off" /></View>
          </View>
          <Field label="Trade / Role (Optional)" placeholder="e.g. Roofer, Labourer" value={f.trade} onChangeText={(t) => setF({ ...f, trade: t })} autoCapitalize="words" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 2 }}><Button busy={busy} title="Add Operative" onPress={add} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setOpen(false)} /></View>
          </View>
        </Card>
      ) : <View style={{ marginBottom: 10 }}><Button title="+ Add Operative" onPress={() => setOpen(true)} /></View>}
      {list.length > 0 && <>
        <SectionTitle>Not Signed Up Yet ({list.length})</SectionTitle>
        {list.map((m) => (
          <Pressable key={m.id} onPress={() => router.push(`/pm/operatives/m-${m.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 10, backgroundColor: base.card }}>
            <View style={{ width: 38, height: 38, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: base.line, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontWeight: '800', color: base.slate }}>{initials(m.name)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: '700', color: base.ink }}>{m.name}</Text>
              <Muted>{[m.trade, m.phone].filter(Boolean).join(' · ') || 'No details yet'} · {m.certs} certificate{m.certs === 1 ? '' : 's'}{m.onedrive_folder_id ? ' · 📁 OneDrive' : ''}</Muted>
            </View>
            <View style={{ backgroundColor: '#FFF4E0', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: '#8A5300', fontSize: 11.5, fontWeight: '700' }}>Not Signed Up</Text></View>
          </Pressable>
        ))}
        <SectionTitle>Signed Up</SectionTitle>
      </>}
    </View>
  );
}
