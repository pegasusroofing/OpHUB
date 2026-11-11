// Dashboard: choose which one first (Andy, 11 Nov 2026: "currently it just opens up the company dashboard"). Once in one,
// the tabs at the top swap between them. Deliveries (the delivery schedule, yard and plant) is here too, not a home tile
// (Andy, 11 Nov 2026), with how many are waiting to be scheduled.
import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { OphIcon } from '@/components/OphIcon';
import { Muted } from '@/components/ui';
import { useDeliveryRequests } from '@/data/deliveries';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page } from '@/theme/theme';

export default function Dashboards() {
  const { me, org } = useAuth();
  const { data: dlvReqs } = useDeliveryRequests(me?.org_id);
  if (!me) return null;
  const dlvN = dlvReqs?.length ?? 0;
  if (!isManager(me)) return <Muted style={{ padding: 16 }}>Managers only.</Muted>;
  const pm = org?.has_pm !== false, fin = !!org?.has_finance;
  const rows: [string, string, string, string][] = [
    ['chart', 'Company Dashboard', [pm ? 'Projects, H&S and schedule' : '', fin ? 'money in and out' : '', pm ? 'quotes' : ''].filter(Boolean).join(', '), '/pm/dashboard'],
    ...(pm ? [['admin', 'Operative Dashboard', 'Hours, check-ins, certificates and training', '/pm/operatives'] as [string, string, string, string]] : []),
    ...(pm ? [['truck', 'Deliveries', dlvN ? `${dlvN} deliver${dlvN === 1 ? 'y' : 'ies'} to schedule · delivery schedule, yard and plant` : 'Delivery schedule, yard and plant', '/pm/deliveries'] as [string, string, string, string]] : []),
  ];
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Dashboard' }} />
      <Text style={{ fontSize: 13, color: base.slate, marginBottom: 10 }}>Which dashboard?</Text>
      {rows.map(([ic, t, s, go]) => (
        <Pressable key={go} accessibilityRole="button" accessibilityLabel={t} onPress={() => router.push(go as never)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 14, marginBottom: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#F1F2F4', alignItems: 'center', justifyContent: 'center' }}><OphIcon name={ic} size={20} color={base.ink} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15.5, fontWeight: '700', color: base.ink }}>{t}</Text>
            <Text style={{ fontSize: 12.5, color: base.slate, marginTop: 2 }}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
          </View>
          <OphIcon name="chevron" size={18} color={base.slate} stroke={2.2} />
        </Pressable>
      ))}
    </ScrollView>
  );
}
