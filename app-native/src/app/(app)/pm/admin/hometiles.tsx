// Admin Centre › Company › Home Page (14 Nov 2026: who sees the money on Home). Andy, 18 Nov 2026: "there is a who sees
// finance but we have recently set the roles up". Now each role's Money On Home part on Admin › Roles decides it; this
// page only points there (it's no longer listed in the Admin Centre). The answer saved here (organizations.home_tiles)
// still counts for a role whose Money On Home hasn't been set on the board yet.
import { router, Stack } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { Button, Card, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { base, page, space } from '@/theme/theme';

export default function HomeTilesSettings() {
  const { me } = useAuth();
  if (!me) return null;
  if (me.role !== 'admin') return <Muted style={{ padding: space.l }}>Company admins only.</Muted>;
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Home Page' }} />
      <Card>
        <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink, marginBottom: 4 }}>Money On Home Is In Roles Now</Text>
        <Muted style={{ marginBottom: 12 }}>Who sees the money on Home (Due In and the OpHUB Finance tile) is set for each role: Admin › Roles, the Money On Home part. Company admins always see it, and only people with Finance switched on ever do.</Muted>
        <View style={{ alignItems: 'center' }}><Button title="Open Roles" onPress={() => router.replace('/pm/admin/roles' as never)} /></View>
      </Card>
    </ScrollView>
  );
}
