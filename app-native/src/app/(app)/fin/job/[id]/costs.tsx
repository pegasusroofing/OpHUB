// Costs ledger for one project (910): every cost line by type, with totals.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { FinChip, FinRow } from '@/components/FinNav';
import { Empty, Muted } from '@/components/ui';
import { useBook } from '@/data/finBook';
import { useAuth } from '@/lib/auth';
import { COST_CATS, forecast } from '@/lib/rules/finBook';
import { fdate, money } from '@/lib/rules/finance';
import { space } from '@/theme/theme';

export default function FinCosts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { data } = useBook(me?.org_id, id);
  const [cat, setCat] = useState('all');
  if (!data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const fc = forecast(data.book, id, data.settings);
  const list = fc.lines.filter((l) => cat === 'all' || l.cat === cat).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const tot = (k: string) => fc.lines.filter((l) => l.cat === k).reduce((t, l) => t + l.net, 0);
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 1000, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Costs ledger' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        <FinChip on={cat === 'all'} label={`All ${money(fc.costToDate + fc.committedTotal, 0)}`} onPress={() => setCat('all')} />
        {Object.entries(COST_CATS).map(([k, l]) => <FinChip key={k} on={cat === k} label={`${l} ${money(tot(k), 0)}`} onPress={() => setCat(k)} />)}
        <FinChip on={cat === 'committed'} label={`Ordered ${money(fc.committedTotal, 0)}`} onPress={() => setCat('committed')} />
      </View>
      {list.length ? list.map((l) => <FinRow key={l.key} title={l.desc} sub={[l.date ? fdate(l.date) : '', COST_CATS[l.cat] || (l.cat === 'committed' ? `Ordered (${COST_CATS[l.ccat || 'materials']})` : l.cat), l.who, l.ref, l.status].filter(Boolean).join(' · ')} right={money(l.net)} onPress={l.go ? () => router.push(l.go as never) : undefined} />) : <Empty>No costs yet.</Empty>}
      <Muted style={{ marginTop: 8 }}>All excl. VAT. Labour from sign-ins is only costed for PAYE staff with a day rate (People &amp; rates).</Muted>
    </ScrollView>
  );
}
