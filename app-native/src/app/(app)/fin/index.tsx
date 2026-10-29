// Finance › Overview (914 renderFinanceHome): live contract value, owed,
// overdue, retention held, and what needs attention.
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { FinPage, FinStat, TONE } from '@/components/FinNav';
import { Card, Muted } from '@/components/ui';
import { heading } from '@/lib/fonts';
import { useFinOverview } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/rules/finance';
import { base } from '@/theme/theme';

// Finance labels in Title Case, as the current app (9219x finTitleCase).
const KEEP = new Set(['PO', 'POs', 'VAT', 'CIS']);
const titleCase = (x: string) => x.replace(/[A-Za-z][A-Za-z'’.]*/g, (w) => (KEEP.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)));

export default function FinOverview() {
  const { me } = useAuth();
  const { data: sites } = useSites();
  const { data, isLoading } = useFinOverview(me, sites);
  return (
    <FinPage title="OpHUB Finance" section="overview">
      {isLoading || !data ? <Muted>Loading…</Muted> : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <FinStat v={money(data.liveValue, 0)} tone="blue" label={`Live Contract Value · ${data.liveCount} Job${data.liveCount === 1 ? '' : 's'}`} onPress={() => router.push('/fin/jobs' as never)} />
            <FinStat v={money(data.owed, 0)} tone="green" label="Owed To You" onPress={() => router.push('/fin/sales?tab=invoices' as never)} />
            <FinStat v={money(data.overdue, 0)} tone="red" label="Overdue" onPress={() => router.push('/fin/sales?tab=invoices&f=overdue' as never)} />
            <FinStat v={money(data.retHeld, 0)} tone="amber" label="Retention Held By Clients" onPress={() => router.push('/fin/sales?tab=retention' as never)} />
          </View>
          {data.todo.length > 0 ? (
            <Card>
              <Text style={[heading(700), { fontSize: 15, color: '#111827', marginBottom: 8 }]}>Needs Attention</Text>
              {data.todo.map((x) => (
                <Pressable key={x.t} onPress={() => router.push(x.go as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11, borderTopWidth: 1, borderColor: '#F0F1F4' }}>
                  <Text style={{ width: 26, height: 26, lineHeight: 26, textAlign: 'center', fontWeight: '800', fontSize: 13, color: TONE[x.tone], backgroundColor: `${TONE[x.tone]}1F`, borderRadius: 6, overflow: 'hidden' }}>{x.n}</Text>
                  <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: '#111827' }}>{titleCase(x.t)}</Text><Text numberOfLines={2} style={{ fontSize: 12, color: base.slate }}>{x.s}</Text></View>
                  <Text style={{ color: base.slate }}>›</Text>
                </Pressable>
              ))}
            </Card>
          ) : <Card><Muted>Nothing needs attention right now.</Muted></Card>}
        </>
      )}
    </FinPage>
  );
}
