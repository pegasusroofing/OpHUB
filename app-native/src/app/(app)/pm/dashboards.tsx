// Dashboard: choose which one first (Andy, 11 Nov 2026: "currently it just opens up the company dashboard"). Once in one,
// the tabs at the top swap between them. Deliveries (the delivery schedule, yard and plant) is here too, not a home tile
// (Andy, 11 Nov 2026), with how many are waiting to be scheduled as a badge. The rows are all the same size, each with a
// one-line description (Andy, 11 Nov 2026).
import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { OphIcon } from '@/components/OphIcon';
import { Muted } from '@/components/ui';
import { useDeliveryRequests } from '@/data/deliveries';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page, useTheme } from '@/theme/theme';

type Row = { ic: string; title: string; sub: string; go: string; badge?: number };
/** "Projects, H&S, money and quotes": a list in words. */
const words = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export default function Dashboards() {
  const { me, org } = useAuth();
  const t = useTheme();
  const { data: dlvReqs } = useDeliveryRequests(me?.org_id);
  if (!me) return null;
  const dlvN = dlvReqs?.length ?? 0;
  if (!isManager(me)) return <Muted style={{ padding: 16 }}>Managers only.</Muted>;
  const pm = org?.has_pm !== false, fin = !!org?.has_finance;
  const company = words([...(pm ? ['projects', 'H&S'] : []), ...(fin ? ['money'] : []), ...(pm ? ['quotes'] : [])]);
  const rows: Row[] = [
    { ic: 'chart', title: 'Company Dashboard', sub: company.charAt(0).toUpperCase() + company.slice(1), go: '/pm/dashboard' },
    ...(pm ? [
      { ic: 'admin', title: 'Operative Dashboard', sub: 'Hours, check-ins, certificates and training', go: '/pm/operatives' },
      { ic: 'truck', title: 'Deliveries', sub: 'Delivery schedule, yard and plant', go: '/pm/deliveries', badge: dlvN },
    ] : []),
  ];
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Dashboards' }} />
      <Text style={{ fontSize: 13, color: base.slate, marginBottom: 10 }}>Which dashboard?</Text>
      {rows.map((r) => (
        <Pressable key={r.go} accessibilityRole="button" accessibilityLabel={r.badge ? `${r.title}, ${r.badge} to schedule` : r.title} onPress={() => router.push(r.go as never)}
          style={{ height: 76, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, paddingHorizontal: 14, marginBottom: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#F1F2F4', alignItems: 'center', justifyContent: 'center' }}><OphIcon name={r.ic} size={20} color={base.ink} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 15.5, fontWeight: '700', color: base.ink }}>{r.title}</Text>
            <Text numberOfLines={1} style={{ fontSize: 12.5, color: base.slate, marginTop: 2 }}>{r.sub}</Text>
          </View>
          {!!r.badge && (
            <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: t.brand1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: t.brand1Text }}>{r.badge}</Text>
            </View>
          )}
          <OphIcon name="chevron" size={18} color={base.slate} stroke={2.2} />
        </Pressable>
      ))}
    </ScrollView>
  );
}
