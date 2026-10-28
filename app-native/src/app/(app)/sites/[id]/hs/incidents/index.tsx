// Accident / Incident / Near Miss reports for a job (690 renderIncidents).
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { deleteIncident, useIncidents } from '@/data/incidents';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

const chip = (t: string, bad?: boolean) => <Text key={t} style={{ fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden', backgroundColor: bad ? '#FDECEA' : base.paper, color: bad ? base.red : base.slate }}>{t}</Text>;

export default function Incidents() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useIncidents(id);
  if (!me) return null;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Accident / Incident' }} />
      <Button title="⚠️ Report Accident / Incident / Near Miss" onPress={() => router.push(`/sites/${id}/hs/incidents/new` as never)} />
      {isLoading ? <Muted>Loading…</Muted> : data?.length ? data.map((r) => (
        <Pressable key={r.id} onPress={() => router.push(`/sites/${id}/hs/incidents/${r.id}` as never)}
          style={{ flexDirection: 'row', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginTop: 8, backgroundColor: base.card }}>
          <Text style={{ fontSize: 20 }}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{r.location || 'Location not given'}</Text>
            <Muted>{new Date(r.incident_date ? `${r.incident_date}T00:00:00` : r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · Filed by {r.filed_by_name || ''}</Muted>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {r.riddor_reportable && chip('RIDDOR', true)}{r.injury_occurred && chip('Injury')}{r.damage_occurred && chip('Damage')}
              {!r.injury_occurred && !r.damage_occurred && !r.riddor_reportable && chip('Near miss')}
            </View>
          </View>
          {isManager(me) && <Pressable hitSlop={8} onPress={async () => {
            if (await confirmAsk('Delete this report? This cannot be undone.', 'Delete') && await deleteIncident(me, r)) { toast('Report deleted'); void qc.invalidateQueries({ queryKey: ['incidents', id] }); }
          }}><Text style={{ color: base.red }}>🗑</Text></Pressable>}
        </Pressable>
      )) : <Empty>No accidents, incidents or near misses reported for this project.</Empty>}
    </ScrollView>
  );
}
