import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { Button, Card, Muted, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getDeviceId } from '@/lib/deviceId';
import { deviceLockApplies, roleLabel } from '@/lib/roles';
import { onQueueChange, pendingUploads } from '@/lib/uploadQueue';
import { base } from '@/theme/theme';

export default function Account() {
  const { me, org, signOut } = useAuth();
  const [deviceId, setDeviceId] = useState('');
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getDeviceId().then(setDeviceId);
    pendingUploads().then((j) => setQueued(j.length));
    return onQueueChange((j) => setQueued(j.length));
  }, []);
  return (
    <Screen>
      <Title>Account</Title>
      <Card>
        <Text style={{ fontSize: 16, fontWeight: '700', color: base.ink }}>{me?.name}</Text>
        <Muted>{me?.email}</Muted>
        <Muted style={{ marginTop: 6 }}>{roleLabel(me)} · {org?.name || 'No company'}</Muted>
      </Card>
      <Card>
        <Muted>This device: {deviceId || '…'}</Muted>
        <Muted>{deviceLockApplies(me) ? 'One-phone rule applies to you.' : 'One-phone rule does not apply to you.'}</Muted>
        {queued > 0 && <Muted style={{ marginTop: 6 }}>{queued} photo{queued === 1 ? '' : 's'} waiting for signal to upload.</Muted>}
      </Card>
      <Button kind="ghost" title="Sign out" busy={busy} onPress={async () => { setBusy(true); await signOut(); }} />
    </Screen>
  );
}
