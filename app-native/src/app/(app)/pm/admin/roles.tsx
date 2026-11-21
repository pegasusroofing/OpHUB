// Admin Centre › People › Roles, on its own (old links). It sits under Invites now (Admin › People › Invites & Roles,
// Andy 21 Nov 2026); the panel is components/RolesPanel.tsx.
import { Stack } from 'expo-router';
import { ScrollView } from 'react-native';

import { RolesPanel } from '@/components/RolesPanel';
import { Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { page, space } from '@/theme/theme';

export default function Roles() {
  const { me } = useAuth();
  if (!me) return null;
  return (
    <ScrollView contentContainerStyle={page(1000)}>
      <Stack.Screen options={{ title: 'Roles' }} />
      {me.role === 'admin' ? <RolesPanel /> : <Muted style={{ padding: space.l }}>Company admins only.</Muted>}
    </ScrollView>
  );
}
