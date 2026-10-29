// Admin Centre › Invites (260 invites, 320 generateInvite / createPermanentInvite):
// the one permanent link for the whole team, one-time links (operative, driver
// or client) that can be emailed, and pending invites to revoke.
import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';

import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { createInvite, createPermanentInvite, emailInvite, joinLink, revokeInvite, useInvites } from '@/data/admin';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const ROLES = [{ key: 'operative', label: 'Operative' }, { key: 'driver', label: 'Delivery Driver' }, { key: 'client', label: 'Client (view-only)' }];

export default function Invites() {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useInvites(me?.org_id);
  const [role, setRole] = useState('operative');
  const [newId, setNewId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['invites'] }); };
  const share = async (link: string) => {
    const text = `${org?.name || 'Company'} x OpHUB Invite Link\n${link}`;
    try {
      if (Platform.OS === 'web' && globalThis.navigator?.clipboard) { await globalThis.navigator.clipboard.writeText(text); toast('Link copied'); }
      else await Share.share({ message: text });
    } catch { toast('Could not copy — select and copy the link manually.'); }
  };
  const linkBox = (link: string) => <TextInput value={link} editable={false} selectTextOnFocus style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 8, fontSize: 11.5, color: base.ink, marginBottom: 8 }} />;
  const perm = data?.permanent;
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Invites' }} />
      <Card>
        {perm ? (
          <>
            <Muted style={{ marginBottom: 8 }}>Share this one link with as many operatives as you like — it never expires and can be used more than once. Used {perm.use_count || 0} time{perm.use_count === 1 ? '' : 's'} so far.</Muted>
            {linkBox(joinLink(perm.id))}
            <Button kind="ghost" title={Platform.OS === 'web' ? 'Copy Link' : 'Share Link'} onPress={() => void share(joinLink(perm.id))} />
            <Button kind="ghost" title="Revoke & Create New Link" onPress={async () => {
              if (!(await confirmAsk("This stops the current link from working — anyone who already joined stays on your team, but the link itself won't sign anyone new up any more. You can create a fresh one straight after. Continue?", 'Revoke'))) return;
              toast((await revokeInvite(perm.id)) ? 'Old link revoked' : 'Could not revoke — try again.'); refresh();
            }} />
          </>
        ) : (
          <>
            <Muted style={{ marginBottom: 8 }}>Create one link you can share with your whole team at once — in a group chat, on a noticeboard, or as a QR code — instead of sending a separate link to each operative.</Muted>
            <Button busy={busy === 'perm'} title="Create Permanent Invite Link" onPress={async () => { setBusy('perm'); const ok = await createPermanentInvite(me); setBusy(null); toast(ok ? 'Permanent invite link created' : 'Could not create — try again.'); refresh(); }} />
          </>
        )}
        <SectionTitle>One-time invite</SectionTitle>
        {newId ? (
          <>
            <Muted style={{ marginBottom: 8 }}>Share this link — it works once, for the next 14 days:</Muted>
            {linkBox(joinLink(newId))}
            <Button kind="ghost" title={Platform.OS === 'web' ? 'Copy Link' : 'Share Link'} onPress={() => void share(joinLink(newId))} />
            <Muted style={{ marginTop: 10, marginBottom: 6 }}>Or email it to them — a branded invite email with a button that takes them straight to sign-up.</Muted>
            <TextInput value={email} onChangeText={setEmail} placeholder="operative@example.com" autoCapitalize="none" keyboardType="email-address" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8 }} />
            <Button busy={busy === 'email'} title="Send Invite Email" onPress={async () => {
              const e = email.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast('Enter a valid email address.'); return; }
              setBusy('email'); toast(await emailInvite(newId, e)); setBusy(null);
            }} />
            <Pressable onPress={() => { setNewId(null); setEmail(''); }}><Text style={{ color: base.blue, marginTop: 8 }}>Make another link</Text></Pressable>
          </>
        ) : (
          <>
            <Muted style={{ marginBottom: 8 }}>Prefer a single-use link for one person instead of the permanent link above?</Muted>
            <Pressable onPress={async () => { const k = await chooseAction('Invite as', ROLES); if (k) setRole(k); }} style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 12, marginBottom: 8 }}>
              <Text style={{ color: base.ink }}>▼ Invite as: {ROLES.find((r) => r.key === role)?.label}</Text>
            </Pressable>
            <Button kind="ghost" busy={busy === 'one'} title="Generate One-Time Invite Link" onPress={async () => { setBusy('one'); const id = await createInvite(me, role); setBusy(null); if (id) { setNewId(id); toast('Invite link created'); refresh(); } else toast('Could not create — try again.'); }} />
            <Muted style={{ marginTop: 8 }}>A Client invite gives read-only access once a PM assigns them to a site — they can view and export, but never sign or edit anything.</Muted>
          </>
        )}
        {!!data?.pending.length && (
          <>
            <SectionTitle>Pending invites</SectionTitle>
            {data.pending.map((i) => (
              <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: base.line }}>
                <View style={{ flex: 1 }}>
                  {!!i.email && <Text style={{ fontWeight: '700', color: base.ink }}>{i.email}</Text>}
                  <Muted>{ROLES.find((r) => r.key === i.role)?.label || i.role} · created {new Date(i.created_at).toLocaleDateString('en-GB')} · expires {new Date(i.expires_at).toLocaleDateString('en-GB')}</Muted>
                </View>
                <Pressable onPress={async () => { if (!(await confirmAsk('Revoke this invite link?', 'Revoke'))) return; toast((await revokeInvite(i.id)) ? 'Invite revoked' : 'Could not revoke — try again.'); if (newId === i.id) setNewId(null); refresh(); }}><Text style={{ color: base.warn, fontWeight: '700' }}>Revoke</Text></Pressable>
              </View>
            ))}
          </>
        )}
      </Card>
    </ScrollView>
  );
}
