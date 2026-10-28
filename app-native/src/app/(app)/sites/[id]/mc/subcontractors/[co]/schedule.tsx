// A subcontractor's Schedule of Works (550 renderSubSchedule): the main schedule's
// items assigned to this company — the same rows, so progress shows on both.
// Open the main Schedule of Works to update one.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Empty, Muted } from '@/components/ui';
import { useSubco, useSubSchedule } from '@/data/subcontractors';
import { useAuth } from '@/lib/auth';
import { base, radius, space } from '@/theme/theme';

const LABEL: Record<string, string> = { todo: 'To Do', progress: 'In Progress', done: 'Complete' };

export default function SubSchedule() {
  const { id, co } = useLocalSearchParams<{ id: string; co: string }>();
  const { me } = useAuth();
  const { data: sub } = useSubco(co, me);
  const { data: tasks, isLoading } = useSubSchedule(id, co);
  const [f, setF] = useState<'all' | 'todo' | 'progress'>('all');
  if (!sub) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const shown = (tasks ?? []).filter((t) => f === 'all' || (f === 'todo' ? t.status === 'todo' : t.status !== 'todo'));
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: `${sub.company.name} — Schedule of Works` }} />
      <Muted style={{ marginBottom: 10 }}>Only the work items assigned to {sub.company.name} — updates show straight away on the main Schedule of Works.</Muted>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {([['all', 'All'], ['todo', 'To Do'], ['progress', 'In Progress / Complete']] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => setF(k)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: f === k ? base.ink : base.line, backgroundColor: f === k ? base.ink : base.card }}>
            <Text style={{ fontWeight: '700', color: f === k ? '#fff' : base.ink }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((t) => (
        <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
          <Text style={{ flex: 1, color: base.ink, fontWeight: '600' }}>{t.name}</Text>
          <Text style={{ fontWeight: '700', color: t.status === 'done' ? base.ok : t.status === 'progress' ? base.blue : base.slate }}>{LABEL[t.status] || t.status}{t.status === 'progress' && t.percent_complete ? ` ${t.percent_complete}%` : ''}</Text>
        </View>
      )) : <Empty>No work items assigned to {sub.company.name} yet.</Empty>}
      <Button kind="ghost" title="Open the Schedule of Works" onPress={() => router.push(`/sites/${id}/schedule`)} />
    </ScrollView>
  );
}
