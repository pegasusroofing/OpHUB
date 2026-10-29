// A subcontractor's operatives (550 renderSubOperatives): managers allocate job
// operatives (one company per operative per job), make one the company admin
// (upload rights) and remove them.
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Check, Empty, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { allocateSubOp, removeSubOp, setSubOpAdmin, useSubco, useSubOperatives } from '@/data/subcontractors';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

export default function SubOperatives() {
  const { id, co } = useLocalSearchParams<{ id: string; co: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sub } = useSubco(co, me);
  const { data, isLoading } = useSubOperatives(id, co);
  const { data: people } = usePeople();
  const [pick, setPick] = useState<string | null>(null);
  const [asAdmin, setAsAdmin] = useState(false);
  if (!me || !sub) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const mgr = isManager(me);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['subOps', co] }); void qc.invalidateQueries({ queryKey: ['subco', co] }); void qc.invalidateQueries({ queryKey: ['siteTeam', id] }); };
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: `${sub.company.name} — Operatives` }} />
      <Muted style={{ marginBottom: 10 }}>RTB's PM/admin and the subcontractor admin can upload RAMS, COSHH, Toolbox Talks and Daily Briefings into this folder — everyone else allocated here just views and signs.</Muted>
      {isLoading ? <Muted>Loading…</Muted> : data?.allocated.length ? data.allocated.map((a) => (
        <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{nameOf(people, a.user_id)}</Text>
            {a.is_admin && <Muted>⭐ Subcontractor admin</Muted>}
          </View>
          {mgr && <Button kind="ghost" title={a.is_admin ? 'Remove admin' : 'Make admin'} onPress={async () => { if (await setSubOpAdmin(a.id, !a.is_admin)) { toast(a.is_admin ? 'Admin removed' : 'Now the subcontractor admin'); refresh(); } }} />}
          {mgr && <Button kind="ghost" title="Remove" onPress={async () => { if (await confirmAsk('Remove this operative from the subcontractor?', 'Remove') && await removeSubOp(a.id)) { toast('Removed'); refresh(); } }} />}
        </View>
      )) : <Empty>No operatives allocated yet.</Empty>}
      {mgr && (
        <Card>
          <SectionTitle>Allocate an operative</SectionTitle>
          <Muted style={{ marginBottom: 6 }}>Only operatives already assigned to this site, and not already with another subcontractor here, are listed.</Muted>
          {data?.pickable.length ? data.pickable.map((p) => (
            <Pressable key={p.id} onPress={() => setPick(p.id)}><Text style={{ paddingVertical: 5, color: base.ink }}>{pick === p.id ? '◉' : '○'} {p.name}</Text></Pressable>
          )) : <Muted>No one available to allocate.</Muted>}
          <Check label="Make this their subcontractor admin (upload rights)" value={asAdmin} onChange={setAsAdmin} />
          <Button title="Allocate" onPress={async () => {
            if (!pick) { toast('Choose an operative.'); return; }
            if (await allocateSubOp(me, id, co, pick, asAdmin)) { toast('Allocated'); setPick(null); setAsAdmin(false); refresh(); } else toast('Could not save — try again.');
          }} />
        </Card>
      )}
    </ScrollView>
  );
}
