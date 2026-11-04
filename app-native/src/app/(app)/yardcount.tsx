// Yard stock take (Andy, 4 Nov 2026): every yard item with a box for what's really there. Only the items whose count
// changed are saved, each as a count adjustment, so the history shows what the stock take moved. Managers and Finance.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { useYard, yardCanEdit, yardCount } from '@/data/materials';
import { useAuth } from '@/lib/auth';
import { isFinanceUser } from '@/lib/roles';
import { yardNum, yardQty } from '@/lib/rules/materials';
import { base, page, radius, space } from '@/theme/theme';

export default function YardCount() {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useYard(me?.org_id);
  const [c, setC] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  if (!yardCanEdit(me, isFinanceUser(me, org))) return <Muted style={{ padding: space.l }}>Only managers and Finance can do a stock take.</Muted>;
  const t = q.trim().toLowerCase();
  const shown = t ? items.filter((s) => [s.item, s.category, s.location].join(' ').toLowerCase().includes(t)) : items;
  const changed = items.filter((s) => { const n = yardNum(c[s.id] ?? ''); return (c[s.id] ?? '').trim() !== '' && n != null && n >= 0 && n !== Number(s.qty || 0); });
  const save = async () => {
    if (!changed.length) { toast('No counts changed.'); return; }
    if (!(await confirmAsk(`Save the stock take? ${changed.length} item${changed.length === 1 ? '' : 's'} will be set to what you counted.`, 'Save Counts'))) return;
    setBusy(true);
    const err = await yardCount(me, changed.map((s) => ({ stock: s, counted: yardNum(c[s.id]) as number })));
    setBusy(false);
    if (err) { toast(err); return; }
    toast(`Stock take saved — ${changed.length} count${changed.length === 1 ? '' : 's'} updated`);
    void qc.invalidateQueries({ queryKey: ['yard'] });
    router.back();
  };
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Yard Stock Take' }} />
      <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
        <Muted style={{ marginBottom: 8 }}>Type what&apos;s really in the yard for each item. Leave a box empty to keep its count. Only changed items are saved.</Muted>
        <TextInput value={q} onChangeText={setQ} placeholder="Search item or location" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 }} />
        {isLoading ? <Muted>Loading…</Muted> : (
          <Card>
            {shown.map((s, i) => {
              const v = c[s.id] ?? '', n = yardNum(v), diff = v.trim() !== '' && n != null ? n - Number(s.qty || 0) : 0;
              return (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: base.line }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontWeight: '600', color: base.ink }} numberOfLines={1}>{s.item}</Text>
                    <Muted style={{ fontSize: 12 }}>{[`Shows ${yardQty(s.qty)} ${s.unit || ''}`.trim(), s.location].filter(Boolean).join(' · ')}</Muted>
                  </View>
                  {diff !== 0 && <Text style={{ fontSize: 12, fontWeight: '600', color: diff < 0 ? base.red : base.ok }}>{diff > 0 ? '+' : ''}{yardQty(diff)}</Text>}
                  <TextInput accessibilityLabel={`Count for ${s.item}`} value={v} onChangeText={(x) => setC({ ...c, [s.id]: x.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder={yardQty(s.qty)} style={{ width: 80, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 8, paddingVertical: 6, textAlign: 'center', color: base.ink, backgroundColor: base.card }} />
                </View>
              );
            })}
            {!shown.length && <Muted>No yard items.</Muted>}
          </Card>
        )}
      </ScrollView>
      <View style={{ borderTopWidth: 1, borderTopColor: base.line, backgroundColor: base.card, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ flex: 1, color: base.slate }}>{changed.length} changed</Text>
        <Button busy={busy} title="Save Stock Take" onPress={() => void save()} />
      </View>
    </View>
  );
}
