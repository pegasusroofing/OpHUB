// Finance › Overview (914 renderFinanceHome): live contract value, owed,
// overdue, retention held, and what needs attention.
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { FinPage, FinStat, TONE } from '@/components/FinNav';
import { Card, Muted, SectionTitle } from '@/components/ui';
import { useFinOverview } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/rules/finance';
import { base } from '@/theme/theme';

export default function FinOverview() {
  const { me } = useAuth();
  const { data: sites } = useSites();
  const { data, isLoading } = useFinOverview(me, sites);
  return (
    <FinPage title="OpHUB Finance" section="overview">
      {isLoading || !data ? <Muted>Loading…</Muted> : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <FinStat v={money(data.liveValue, 0)} label={`Live contract value · ${data.liveCount} job${data.liveCount === 1 ? '' : 's'}`} onPress={() => router.push('/fin/jobs' as never)} />
            <FinStat v={money(data.owed, 0)} label="Owed to you" onPress={() => router.push('/fin/sales?tab=invoices' as never)} />
            <FinStat v={money(data.overdue, 0)} label="Overdue" hot={data.overdue > 0} onPress={() => router.push('/fin/sales?tab=invoices&f=overdue' as never)} />
            <FinStat v={money(data.retHeld, 0)} label="Retention held by clients" onPress={() => router.push('/fin/sales?tab=retention' as never)} />
          </View>
          {data.todo.length > 0 ? (
            <Card>
              <SectionTitle>Needs attention</SectionTitle>
              {data.todo.map((x) => (
                <Pressable key={x.t} onPress={() => router.push(x.go as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderColor: base.line }}>
                  <Text style={{ minWidth: 30, textAlign: 'center', fontWeight: '800', color: '#fff', backgroundColor: TONE[x.tone], borderRadius: 12, overflow: 'hidden', paddingVertical: 3 }}>{x.n}</Text>
                  <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: base.ink }}>{x.t}</Text><Text numberOfLines={2} style={{ fontSize: 12, color: base.slate }}>{x.s}</Text></View>
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
