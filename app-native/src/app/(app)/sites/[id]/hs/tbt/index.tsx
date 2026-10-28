// Toolbox talks for a job. Operatives see every talk (live ones to sign).
// Ported from renderToolboxTalks (710); the PM bank/live/completed tabs, uploads,
// "due this month" warning and emails come with the PM screens.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { TbtStatusTag } from '@/components/TbtStatusTag';
import { Card, Empty, Muted } from '@/components/ui';
import { useTbts } from '@/data/hs';
import { useSite } from '@/data/sites';
import { base, space } from '@/theme/theme';

export default function Tbts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: site } = useSite(id);
  const { data: talks, isLoading } = useTbts(site);
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Toolbox Talks' }} />
      {isLoading || !site ? <Muted>Loading…</Muted> : talks?.length ? talks.map((t) => (
        <Pressable key={t.id} onPress={() => router.push(`/sites/${site.id}/hs/tbt/${t.id}`)}>
          <Card style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: base.ink }}>{t.title}</Text>
              <Muted>{new Date(t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Muted>
            </View>
            <TbtStatusTag status={t.status} />
          </Card>
        </Pressable>
      )) : <Empty>No toolbox talks yet.</Empty>}
    </ScrollView>
  );
}
