// Finance section bar and sub-tabs (914 finSectionNav / finSubTabs), the page
// wrapper with the access check, and small shared bits (stat tile, row, chip).
import { router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isFinanceUser } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

export const FIN_SECTIONS = [
  { k: 'overview', l: 'Overview', go: '/fin' }, { k: 'jobs', l: 'Projects', go: '/fin/jobs' }, { k: 'sales', l: 'Sales', go: '/fin/sales' },
  { k: 'purchases', l: 'Purchases', go: '/fin/purchases' }, { k: 'subs', l: 'Subcontractors & Labour', go: '/fin/subs' }, { k: 'reports', l: 'Reports', go: '/fin/reports' }, { k: 'settings', l: 'Settings', go: '/fin/settings' },
];
export const FIN_SUBS: Record<string, [string, string][]> = {
  jobs: [['list', 'Projects'], ['clients', 'Clients']],
  sales: [['apps', 'Applications & Certificates'], ['invoices', 'Invoices'], ['retention', 'Retention']],
  purchases: [['orders', 'Purchase orders'], ['invoices', 'Purchase invoices'], ['plant', 'Plant hire'], ['suppliers', 'Suppliers'], ['pricebook', 'Price book']],
  subs: [['opinv', 'Operative invoices'], ['payrun', 'Pay run'], ['orders', 'Subcontractor POs'], ['apps', 'Applications & Certificates'], ['cis', 'CIS'], ['rates', 'People & rates']],
  settings: [['general', 'General'], ['codes', 'Cost codes'], ['directory', 'Directory']],
};
const Chip = ({ on, label, onPress, n }: { on: boolean; label: string; onPress: () => void; n?: number }) => (
  <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card }}>
    <Text style={{ fontWeight: '700', fontSize: 12.5, color: on ? '#fff' : base.ink }}>{label}{n ? ` (${n})` : ''}</Text>
  </Pressable>
);
export { Chip as FinChip };

export function FinPage({ title, section, sub, onSub, badges, children, wide }: { title: string; section: string; sub?: string; onSub?: (k: string) => void; badges?: Record<string, number>; children: ReactNode; wide?: boolean }) {
  const { me, org } = useAuth();
  const subs = FIN_SUBS[section] || [];
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: wide ? 1200 : 900, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title }} />
      {!me ? null : !isFinanceUser(me, org) ? <Muted>OpHUB Finance isn&apos;t switched on for your account.</Muted> : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 8 }}>
            {FIN_SECTIONS.map((s) => <Chip key={s.k} on={s.k === section} label={s.l} onPress={() => router.replace(s.go as never)} />)}
          </ScrollView>
          {subs.length > 1 && onSub && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
              {subs.map(([k, l]) => <Pressable key={k} onPress={() => onSub(k)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 2, borderColor: k === sub ? base.ink : 'transparent' }}><Text style={{ fontWeight: k === sub ? '800' : '600', color: k === sub ? base.ink : base.slate }}>{l}{badges?.[k] ? ` · ${badges[k]}` : ''}</Text></Pressable>)}
            </ScrollView>
          )}
          <View style={{ backgroundColor: '#FFF6DB', borderRadius: radius.row, padding: 8, marginBottom: 10 }}><Text style={{ color: '#7A5A00', fontSize: 12.5 }}>🔒 Finance trial — nothing is sent from Finance (no emails, no Xero, no pushes to PMs) while it&apos;s being tested.</Text></View>
          {children}
        </>
      )}
    </ScrollView>
  );
}
export function FinStat({ v, label, hot, onPress }: { v: string; label: string; hot?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexGrow: 1, flexBasis: 160, backgroundColor: base.card, borderRadius: radius.row, borderWidth: 1, borderColor: base.cardLine, padding: 12 }}>
      <Text style={{ fontSize: 19, fontWeight: '800', color: hot ? '#C0392B' : base.ink }}>{v}</Text>
      <Text style={{ fontSize: 12, color: base.slate }}>{label}</Text>
    </Pressable>
  );
}
export function FinRow({ left, title, sub, right, onPress, tone }: { left?: string; title: string; sub?: string; right?: string; onPress?: () => void; tone?: string }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6 }}>
      {left ? <Text style={{ fontWeight: '800', color: base.slate, minWidth: 54 }}>{left}</Text> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '700', color: base.ink }}>{title}</Text>
        {sub ? <Text style={{ fontSize: 12, color: base.slate }}>{sub}</Text> : null}
      </View>
      {right ? <Text style={{ fontWeight: '800', color: tone || base.ink }}>{right}</Text> : null}
      {onPress ? <Text style={{ color: base.slate }}>›</Text> : null}
    </Pressable>
  );
}
export const TONE: Record<string, string> = { warn: '#D98A00', bad: '#C0392B', blue: '#2F6FB3', grey: '#7A7F87' };
