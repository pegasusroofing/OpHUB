// Activity History (385): everything recorded against a job, newest first — the
// activity log (edits, closures, deletions) and the job's notices. Filter by type
// or person; "Show more" goes further back. Managers only.
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { useActivity } from '@/data/siteAdmin';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, space } from '@/theme/theme';

export default function Activity() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const [limit, setLimit] = useState(150);
  const [filter, setFilter] = useState<'all' | 'changes' | 'notices'>('all');
  const [person, setPerson] = useState('');
  const [pickPerson, setPickPerson] = useState(false);
  const { data, isLoading } = useActivity(id, limit);
  const { data: people } = usePeople();
  if (!me || !isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const items = data?.items ?? [];
  const ids = [...new Set(items.map((i) => i.by).filter(Boolean) as string[])].sort((a, b) => nameOf(people, a).localeCompare(nameOf(people, b)));
  const shown = items.filter((i) => (filter === 'all' || i.type === filter) && (!person || i.by === person));
  let lastDay = '';

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Activity History' }} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        {(['all', 'changes', 'notices'] as const).map((k) => (
          <Pressable key={k} onPress={() => setFilter(k)} style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: filter === k ? base.ink : base.line, backgroundColor: filter === k ? base.ink : base.card }}>
            <Text style={{ fontWeight: '700', color: filter === k ? '#fff' : base.ink }}>{k === 'all' ? 'All' : k === 'changes' ? 'Changes' : 'Notices'}</Text>
          </Pressable>
        ))}
      </View>
      {(ids.length > 1 || person) && (
        <View style={{ marginBottom: 8 }}>
          <Pressable onPress={() => setPickPerson(!pickPerson)}><Text style={{ color: base.ink, fontWeight: '700' }}>{pickPerson ? '▼' : '▶'} Person: {person ? nameOf(people, person) : 'Everyone'}</Text></Pressable>
          {pickPerson && [''].concat(ids).map((u) => (
            <Pressable key={u || 'all'} onPress={() => { setPerson(u); setPickPerson(false); }}><Text style={{ paddingVertical: 5, color: base.ink }}>{person === u ? '◉' : '○'} {u ? nameOf(people, u) : 'Everyone'}</Text></Pressable>
          ))}
        </View>
      )}
      <Muted style={{ marginBottom: 8 }}>Changes are edits, closures and deletions. Notices are things raised on the job, such as material requests, snags and variations.</Muted>
      {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((i, n) => {
        const d = new Date(i.at);
        const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
        const hdr = day !== lastDay ? <SectionTitle>{day}</SectionTitle> : null;
        lastDay = day;
        return (
          <View key={n}>
            {hdr}
            <Card style={{ paddingVertical: 9 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: i.type === 'changes' ? base.warn : base.blue }}>{i.head}</Text>
                <Text style={{ fontSize: 11, color: base.slate }}>{d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
              <Text style={{ color: base.ink, marginTop: 2 }}>{i.text}</Text>
              <Text style={{ fontSize: 11, color: base.slate, marginTop: 3 }}>{i.by ? nameOf(people, i.by) : 'System'}</Text>
            </Card>
          </View>
        );
      }) : <Empty>Nothing recorded{filter !== 'all' || person ? ' for that filter' : ' on this job yet'}.</Empty>}
      {data?.more && <Button kind="ghost" title="Show more" onPress={() => setLimit(limit + 150)} />}
    </ScrollView>
  );
}
