// Admin Centre › Device Locks, on its own (old links). It's a drop-down at the bottom of Admin › People › Users now
// (Andy, 21 Nov 2026); the panel is components/DeviceLocksPanel.tsx.
import { Stack } from 'expo-router';
import { ScrollView } from 'react-native';

import { DeviceLocksPanel } from '@/components/DeviceLocksPanel';
import { Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isFullManager } from '@/lib/roles';
import { page, space } from '@/theme/theme';

export default function DeviceLocks() {
  const { me } = useAuth();
  if (!me) return null;
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Device Locks' }} />
      {isFullManager(me) ? <DeviceLocksPanel /> : <Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted>}
    </ScrollView>
  );
}
