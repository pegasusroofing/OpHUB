// Projects › Yard & Plant (Andy, 4 Nov 2026): the PMs' company-wide view. Stock: what's in the yard (no rates; those
// stay in Finance), leftovers to allocate and the stock take. Plant: every item, where it is and who signed for it.
// Book In: the same form drivers use. Managers and Finance.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { PlantRegister } from '@/components/PlantRegister';
import { YardBookIn } from '@/components/YardBookIn';
import { YardLeftovers } from '@/components/YardLeftovers';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { useYard, yardCanEdit } from '@/data/materials';
import { useAuth } from '@/lib/auth';
import { isFinanceUser, isManager } from '@/lib/roles';
import { yardLow, yardQty } from '@/lib/rules/materials';
import { base, page, radius, space, useTheme } from '@/theme/theme';

const TABS = [['plant', 'Plant'], ['stock', 'Stock'], ['bookin', 'Book In']] as const;
type Tab = (typeof TABS)[number][0];

export default function PmYard() {
  const { tab: t0 } = useLocalSearchParams<{ tab?: string }>();
  const { me, org } = useAuth();
  const t = useTheme();
  const tab: Tab = t0 === 'stock' || t0 === 'bookin' ? t0 : 'plant';
  if (!me) return null;
  const fin = isFinanceUser(me, org);
  if (!isManager(me) && !fin) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  return (
    <ScrollView contentContainerStyle={page(900)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Yard & Plant' }} />
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
        {TABS.map(([k, l]) => (
          <Pressable key={k} accessibilityRole="button" onPress={() => { if (k !== tab) router.setParams({ tab: k }); }} style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: k === tab ? t.brand1 : 'transparent' }}>
            <Text style={{ fontSize: 14, fontWeight: k === tab ? '700' : '600', color: k === tab ? '#111827' : '#6b7280' }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'plant' ? <PlantRegister /> : tab === 'bookin' ? <YardBookIn canAddItems={yardCanEdit(me, fin)} /> : <StockList canEdit={yardCanEdit(me, fin)} />}
    </ScrollView>
  );
}

function StockList({ canEdit }: { canEdit: boolean }) {
  const { me } = useAuth();
  const { data: items = [], isLoading } = useYard(me?.org_id);
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const list = s ? items.filter((x) => [x.item, x.category, x.location].join(' ').toLowerCase().includes(s)) : items;
  return (
    <View>
      {canEdit && <YardLeftovers />}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <TextInput value={q} onChangeText={setQ} placeholder="Search the yard" style={{ flex: 1, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card }} />
        {canEdit && <Button small kind="ghost" title="Stock Take" onPress={() => router.push('/yardcount' as never)} />}
      </View>
      <Muted style={{ marginBottom: 6 }}>Issue stock to a job from that job&apos;s Materials › Yard Stock. Rates and values are in Finance.</Muted>
      {isLoading ? <Muted>Loading…</Muted> : list.length ? (
        <Card>
          {list.map((x, i) => (
            <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: base.line }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: '600', color: base.ink }} numberOfLines={1}>{x.item}</Text>
                {!!(x.category || x.location) && <Muted style={{ fontSize: 12 }}>{[x.category, x.location].filter(Boolean).join(' · ')}</Muted>}
              </View>
              <Text style={{ fontWeight: '600', color: yardLow(x) ? base.red : base.slate }}>{yardQty(x.qty)} {x.unit || ''}{yardLow(x) ? ' · low' : ''}</Text>
            </View>
          ))}
        </Card>
      ) : <Empty>Nothing in the yard list yet.</Empty>}
    </View>
  );
}
