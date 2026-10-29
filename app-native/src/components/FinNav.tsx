// Finance section bar and sub-tabs (914 finSectionNav / finSubTabs), the page
// wrapper with the access check, and small shared bits (stat tile, row, chip).
import { router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FinMode, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { heading } from '@/lib/fonts';
import { isFinanceUser } from '@/lib/roles';
import { base, page, radius, useTheme } from '@/theme/theme';

export const FIN_SECTIONS = [
  { k: 'overview', l: 'Overview', go: '/fin' }, { k: 'jobs', l: 'Projects', go: '/fin/jobs' }, { k: 'sales', l: 'Sales', go: '/fin/sales' },
  { k: 'purchases', l: 'Purchases', go: '/fin/purchases' }, { k: 'subs', l: 'Subcontractors & Labour', go: '/fin/subs' }, { k: 'reports', l: 'Reports', go: '/fin/reports' }, { k: 'directory', l: 'Directory', go: '/fin/directory' }, { k: 'settings', l: 'Settings', go: '/fin/settings' },
];
export const FIN_SUBS: Record<string, [string, string][]> = {
  jobs: [['list', 'Projects'], ['clients', 'Clients']],
  sales: [['apps', 'Applications & Certificates'], ['invoices', 'Invoices'], ['retention', 'Retention']],
  purchases: [['orders', 'Purchase orders'], ['invoices', 'Purchase invoices'], ['statements', 'Statements'], ['plant', 'Plant hire'], ['suppliers', 'Suppliers'], ['pricebook', 'Price book'], ['pricelists', 'Price lists'], ['yard', 'Yard stock']],
  subs: [['opinv', 'Operative invoices'], ['payrun', 'Pay run'], ['orders', 'Subcontractor POs'], ['apps', 'Applications & Certificates'], ['cis', 'CIS'], ['rates', 'People & rates']],
  settings: [['general', 'Settings'], ['codes', 'Cost Codes'], ['team', 'Team']],
  directory: [['client', 'Clients'], ['supplier', 'Suppliers'], ['labour', 'Labour (CIS)'], ['codes', 'Cost codes']],
};
const Chip = ({ on, label, onPress, n }: { on: boolean; label: string; onPress: () => void; n?: number }) => (
  <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card }}>
    <Text style={{ fontWeight: '700', fontSize: 12.5, color: on ? '#fff' : base.ink }}>{label}{n ? ` (${n})` : ''}</Text>
  </Pressable>
);
export { Chip as FinChip };
/** The grey filter bar with counts (finsubtabs): the chosen one white. */
export function FinSeg({ items, value, onChange }: { items: [string, string, number?][]; value: string; onChange: (k: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'flex-start', gap: 2, backgroundColor: '#EEF0F2', borderRadius: 10, padding: 3 }}>
      {items.map(([k, l, n], i) => {
        const on = k === value;
        return (
          <Pressable key={k} onPress={() => onChange(k)} style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 }, on && { backgroundColor: '#fff', shadowColor: '#14161C', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }]}>
            <Text style={{ fontSize: 12, fontWeight: on ? '700' : '600', color: on ? '#111827' : '#6b7280' }}>{l}</Text>
            {n != null && n > 0 && <Text style={{ fontSize: 10.5, fontWeight: '800', color: i === 0 ? '#fff' : '#6b7280', backgroundColor: i === 0 ? '#E3262B' : '#E1E4E8', borderRadius: 9, minWidth: 18, textAlign: 'center', paddingHorizontal: 5, overflow: 'hidden' }}>{n}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

export function FinPage({ title, section, sub, onSub, badges, children, wide, top }: { title: string; section: string; sub?: string; onSub?: (k: string) => void; badges?: Record<string, number>; children: ReactNode; wide?: boolean; top?: ReactNode }) {
  const { me, org } = useAuth();
  const t = useTheme();
  const subs = FIN_SUBS[section] || [];
  return (
    <ScrollView contentContainerStyle={[page(wide ? 1200 : 900), { paddingTop: 0 }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title }} />
      {!me ? null : !isFinanceUser(me, org) ? <Muted>OpHUB Finance isn&apos;t switched on for your account.</Muted> : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginBottom: 14, flexGrow: 0 }} contentContainerStyle={{ gap: 2 }}>
            {FIN_SECTIONS.map((s) => (
              <Pressable key={s.k} onPress={() => router.replace(s.go as never)} style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: s.k === section ? t.brand1 : 'transparent' }}>
                <Text style={{ fontSize: 13, fontWeight: s.k === section ? '700' : '600', color: s.k === section ? '#111827' : '#6b7280' }}>{s.l}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {section === 'overview' && <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 14 }}><Text style={{ color: '#111827', fontSize: 12 }}>🔒 Finance trial — nothing is sent from Finance (no emails, no Xero, no pushes to PMs) while it&apos;s being tested.</Text></View>}
          {!!top && <FinMode.Provider value>{top}</FinMode.Provider>}
          {subs.length > 1 && onSub && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
              {subs.map(([k, l]) => <Pressable key={k} onPress={() => onSub(k)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 2, borderColor: k === sub ? base.ink : 'transparent' }}><Text style={{ fontWeight: k === sub ? '800' : '600', color: k === sub ? base.ink : base.slate }}>{l}{badges?.[k] ? ` · ${badges[k]}` : ''}</Text></Pressable>)}
            </ScrollView>
          )}
          <FinMode.Provider value>{children}</FinMode.Provider>
        </>
      )}
    </ScrollView>
  );
}
const STAT_TONE = { blue: ['#f3f7ff', '#dbe6ff', '#1d4ed8'], green: ['#f1fbf5', '#d3f0de', '#15803d'], red: ['#fff5f4', '#fbdcd9', '#c81e1e'], amber: ['#fffaf0', '#f8e7c2', '#b45309'] } as const;
export function FinStat({ v, label, hot, onPress, tone }: { v: string; label: string; hot?: boolean; onPress?: () => void; tone?: keyof typeof STAT_TONE }) {
  const c = tone ? STAT_TONE[tone] : null;
  return (
    <Pressable onPress={onPress} style={{ flexGrow: 1, flexBasis: 160, backgroundColor: c ? c[0] : base.card, borderRadius: 10, borderWidth: 1, borderColor: c ? c[1] : '#e5e7eb', paddingVertical: 16, paddingHorizontal: 18, gap: 4 }}>
      <Text style={[heading(700), { fontSize: 22, color: c ? c[2] : hot ? '#C0392B' : base.ink }]}>{v}</Text>
      <Text style={{ fontSize: 12.5, color: '#6b7280', fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}
export function FinRow({ left, title, sub, right, onPress, tone, children }: { left?: string; title: string; sub?: string; right?: string; onPress?: () => void; tone?: string; children?: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6 }}>
      {left ? <Text style={{ fontWeight: '800', color: base.slate, minWidth: 54 }}>{left}</Text> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '700', color: base.ink }}>{title}</Text>
        {sub ? <Text style={{ fontSize: 12, color: base.slate }}>{sub}</Text> : null}
        {children}
      </View>
      {right ? <Text style={{ fontWeight: '800', color: tone || base.ink }}>{right}</Text> : null}
      {onPress ? <Text style={{ color: base.slate }}>›</Text> : null}
    </Pressable>
  );
}
export const TONE: Record<string, string> = { warn: '#D98A00', bad: '#C0392B', blue: '#2F6FB3', grey: '#7A7F87' };
