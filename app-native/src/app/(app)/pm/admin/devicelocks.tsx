// Admin Centre › Device Locks (260, 320 unlockDevice / approvePendingDevice):
// new phones waiting for approval, and each locked phone with Unlock.
import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { approveDevice, unlockDevice, useDeviceLocks } from '@/data/admin';
import { useAuth } from '@/lib/auth';
import { isFullManager } from '@/lib/roles';
import { base, space } from '@/theme/theme';

const d = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export default function DeviceLocks() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data = [], isLoading } = useDeviceLocks(me?.org_id);
  if (!me) return null;
  if (!isFullManager(me)) return <Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['deviceLocks'] }); };
  const unlock = async (id: string, deny = false) => {
    if (!(await confirmAsk('Unlock this device? Whoever next signs in on it will lock it to themselves.', 'Unlock'))) return;
    toast((await unlockDevice(id)) ? (deny ? 'Request denied' : 'Device unlocked') : 'Could not unlock — try again.'); refresh();
  };
  const pending = data.filter((x) => x.status === 'pending'), locked = data.filter((x) => x.status !== 'pending');
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Device Locks' }} />
      <Muted style={{ marginBottom: 10 }}>Everyone except Project Managers and admins is locked to one phone, and each phone to one person — whether they use the app or the web browser. A person&apos;s first phone locks to them automatically; a second phone waits here for approval.</Muted>
      {isLoading ? <Muted>Loading…</Muted> : (
        <>
          {pending.length > 0 && <Text style={{ fontWeight: '800', color: base.warn, marginBottom: 6 }}>Awaiting approval</Text>}
          {pending.map((x) => (
            <Card key={x.device_id} style={{ borderColor: base.warn, backgroundColor: base.warnBg }}>
              <Text style={{ fontWeight: '700', color: base.ink }}>{x.user_name || 'Unknown'}</Text>
              <Muted>Requested {d(x.requested_at || x.locked_at)} — new device</Muted>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <View style={{ flex: 1 }}><Button title="Approve" onPress={async () => { const err = await approveDevice(x.device_id); toast(err || 'Device approved'); refresh(); }} /></View>
                <View style={{ flex: 1 }}><Button kind="ghost" title="Deny" onPress={() => void unlock(x.device_id, true)} /></View>
              </View>
            </Card>
          ))}
          {pending.length > 0 && <Text style={{ fontWeight: '800', color: base.ink, marginVertical: 6 }}>Approved devices</Text>}
          {locked.length ? locked.map((x) => (
            <Card key={x.device_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: base.ink }}>{x.user_name || 'Unknown'}</Text>
                <Muted>Last used {d(x.last_seen_at)}</Muted>
              </View>
              <View style={{ width: 100 }}><Button kind="ghost" title="Unlock" onPress={() => void unlock(x.device_id)} /></View>
            </Card>
          )) : <Empty>No devices locked yet.</Empty>}
        </>
      )}
    </ScrollView>
  );
}
