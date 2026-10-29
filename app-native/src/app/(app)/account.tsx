// Account / Settings (220 renderAccountSettings): Admin Centre for managers,
// your name and email, phone number (shown to delivery drivers when you're a
// site contact), signature, the Show Finance switch for finance users, the
// how-to tips, this device and photos waiting for signal, and Sign out.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Field, Muted, Screen, SectionTitle, Title } from '@/components/ui';
import { savePhone } from '@/data/onboarding';
import { resetHowTo } from '@/lib/howto';
import { useAuth } from '@/lib/auth';
import { getDeviceId } from '@/lib/deviceId';
import { deviceLockApplies, finHasAccess, isManager, roleLabel } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { onQueueChange, pendingUploads } from '@/lib/uploadQueue';
import { base } from '@/theme/theme';

export default function Account() {
  const { me, org, signOut, refresh } = useAuth();
  const toast = useToast();
  const [deviceId, setDeviceId] = useState('');
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState<'' | 'out' | 'phone'>('');
  const [phone, setPhone] = useState((me as { phone?: string | null } | null)?.phone || '');
  useEffect(() => {
    getDeviceId().then(setDeviceId);
    pendingUploads().then((j) => setQueued(j.length));
    return onQueueChange((j) => setQueued(j.length));
  }, []);
  if (!me) return null;
  const finShown = !me.finance_hidden;
  return (
    <Screen>
      <Title>Settings</Title>
      {isManager(me) && (
        <Card>
          <SectionTitle>Admin Centre</SectionTitle>
          <Muted style={{ marginBottom: 8 }}>Manage your team, branding, integrations and company-wide settings.</Muted>
          <Button title="Open Admin Centre" onPress={() => router.push('/pm/admin' as never)} />
        </Card>
      )}
      <Card>
        <SectionTitle>Your Account</SectionTitle>
        <Muted style={{ marginBottom: 8 }}>{me.name} · {me.email}</Muted>
        <Muted style={{ marginBottom: 6 }}>{roleLabel(me)} · {org?.name || 'No company'}</Muted>
        <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="e.g. 07123 456789" />
        <Muted style={{ marginBottom: 8 }}>Shown to delivery drivers when you&apos;re the site contact for a delivery.</Muted>
        <Button kind="ghost" busy={busy === 'phone'} title="Save Phone Number" onPress={async () => {
          setBusy('phone'); const err = await savePhone(me, phone.trim()); setBusy('');
          if (err) { toast(err); return; } toast('Phone number saved'); void refresh();
        }} />
        <Button kind="ghost" title={me.signature_path ? '✍ My signature' : '✍ Adopt my signature'} onPress={() => router.push('/signature')} />
        {finHasAccess(me, org) && (
          <Pressable onPress={async () => {
            const r = await supabase.from('profiles').update({ finance_hidden: finShown } as never).eq('id', me.id);
            if (r.error) { toast('Could not save — try again.'); return; }
            toast(finShown ? 'Finance hidden' : 'Finance shown'); void refresh();
          }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: base.line, borderRadius: 12, padding: 12, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: base.ink }}>Show Finance</Text>
              <Muted>Turn off to hide Finance and money figures from your projects. Nothing is deleted — switch it back on any time.</Muted>
            </View>
            <Text style={{ fontSize: 22, color: finShown ? base.ok : base.slate }}>{finShown ? '☑' : '☐'}</Text>
          </Pressable>
        )}
        <Button kind="ghost" title="💡 Show the how-to tips again" onPress={async () => { await resetHowTo(me); toast('The how-to tips will show again as you open each page'); void refresh(); }} />
      </Card>
      <Card>
        <Muted>This device: {deviceId || '…'}</Muted>
        <Muted>{deviceLockApplies(me) ? 'One-phone rule applies to you.' : 'One-phone rule does not apply to you.'}</Muted>
        {queued > 0 && <Muted style={{ marginTop: 6 }}>{queued} photo{queued === 1 ? '' : 's'} waiting for signal to upload.</Muted>}
      </Card>
      <Button kind="ghost" title="Sign out" busy={busy === 'out'} onPress={async () => { setBusy('out'); await signOut(); }} />
    </Screen>
  );
}
