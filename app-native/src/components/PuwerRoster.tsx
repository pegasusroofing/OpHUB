// The managers' weekly PUWER roster (680 renderPuwer, manager view): week arrows,
// every operative on the job with Done / Pending and their tool count, tap to
// inspect on their behalf; Mark This Week As Complete / Reopen.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { PuwerPdfButtons } from '@/components/PuwerPdfButtons';
import { useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { markPuwerWeek, reopenPuwerWeek, usePuwerRoster } from '@/data/puwer';
import { useAuth } from '@/lib/auth';
import { localISODate } from '@/lib/rules/driver';
import { weekDates, weekLabel } from '@/lib/rules/havs';
import { base, page, radius, space } from '@/theme/theme';

export function PuwerRoster({ siteId, offset, setOffset }: { siteId: string; offset: number; setOffset: (n: number) => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const days = weekDates(offset);
  const ws = localISODate(days[0]);
  const { data, isLoading } = usePuwerRoster(siteId, ws, true);
  const { data: people } = usePeople();
  const [sel, setSel] = useState<string[]>([]); // ticked for Export Selected (680)
  if (!me) return null;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['puwerRoster', siteId] });

  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'PUWER Tool Inspection' }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <Pressable onPress={() => setOffset(offset - 1)} style={nav}><Text style={{ fontSize: 20 }}>‹</Text></Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontWeight: '700', color: base.ink }}>{weekLabel(days)}</Text>
        <Pressable disabled={offset >= 0} onPress={() => setOffset(offset + 1)} style={[nav, offset >= 0 && { opacity: 0.35 }]}><Text style={{ fontSize: 20 }}>›</Text></Pressable>
      </View>
      {data?.completion && <Card style={{ backgroundColor: base.okBg }}><Text style={{ color: base.ok, fontWeight: '700' }}>✓ Week marked complete — {new Date(data.completion.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} by {nameOf(people, data.completion.completed_by)}</Text></Card>}
      {isLoading || !data ? <Muted>Loading…</Muted> : data.ops.length ? data.ops.map((op) => {
        const done = data.done.has(op.id);
        const n = data.toolCount[op.id] || 0;
        return (
          <Pressable key={op.id} onPress={() => router.push(`/sites/${siteId}/hs/puwer?user=${op.id}` as never)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
            <Pressable hitSlop={8} accessibilityLabel={`Tick ${op.name}`} onPress={() => setSel(sel.includes(op.id) ? sel.filter((x) => x !== op.id) : [...sel, op.id])}><Text style={{ fontSize: 18 }}>{sel.includes(op.id) ? '☑' : '☐'}</Text></Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: base.ink }}>{op.name}{op.id === me.id ? ' (you)' : ''}</Text>
              <Muted>{done ? 'Inspection recorded' : 'Not yet inspected'} · {n} tool{n === 1 ? '' : 's'}</Muted>
            </View>
            <Text style={{ fontWeight: '700', color: done ? base.ok : base.warn }}>{done ? 'Done' : 'Pending'}</Text>
          </Pressable>
        );
      }) : <Empty>No operatives assigned to this site.</Empty>}
      {data && !data.completion && (
        <Button title="Mark This Week As Complete" onPress={async () => {
          if (await markPuwerWeek(me, siteId, ws)) { toast('Week marked complete'); refresh(); setOffset(offset + 1); } else toast('Could not save — try again.');
        }} />
      )}
      {data?.completion && <Button kind="ghost" title="Reopen This Week" onPress={async () => { if (await reopenPuwerWeek(data.completion!.id)) { toast('Week reopened'); refresh(); } }} />}
      <PuwerPdfButtons siteId={siteId} weekStart={ws} picked={(data?.ops ?? []).filter((o) => sel.includes(o.id))} />
    </ScrollView>
  );
}

const nav = { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: base.line, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: base.card };
