// Finance section bar and sub-tabs (914 finSectionNav / finSubTabs), the page
// wrapper with the access check, and small shared bits (stat tile, row, chip).
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { chooseAction } from '@/components/toast';
import { FinMode, Muted } from '@/components/ui';
import { fdb } from '@/data/finance';
import { useAuth } from '@/lib/auth';
import { isFinanceUser } from '@/lib/roles';
import { base, page, radius, useTheme } from '@/theme/theme';

export const FIN_SECTIONS = [
  { k: 'overview', l: 'Overview', go: '/fin' }, { k: 'jobs', l: 'Projects', go: '/fin/jobs' }, { k: 'sales', l: 'Sales', go: '/fin/sales' },
  { k: 'purchases', l: 'Purchases', go: '/fin/purchases' }, { k: 'subs', l: 'Subcontractors & Labour', go: '/fin/subs' }, { k: 'reports', l: 'Reports', go: '/fin/reports' }, { k: 'directory', l: 'Directory', go: '/fin/directory' }, { k: 'settings', l: 'Settings', go: '/fin/settings' },
];
export const FIN_SUBS: Record<string, [string, string][]> = {
  sales: [['apps', 'Applications & Certificates'], ['invoices', 'Invoices'], ['retention', 'Retention']],
  purchases: [['orders', 'Purchase orders'], ['invoices', 'Purchase invoices'], ['statements', 'Statements'], ['plant', 'Plant hire'], ['suppliers', 'Suppliers'], ['pricebook', 'Price book'], ['pricelists', 'Price lists'], ['yard', 'Yard stock']],
  subs: [['opinv', 'Operative invoices'], ['wages', 'Wages to book'], ['payrun', 'Pay run'], ['orders', 'Subcontractor POs'], ['apps', 'Applications & Certificates'], ['cis', 'CIS'], ['rates', 'People & rates']],
  settings: [['general', 'Settings'], ['codes', 'Cost Codes'], ['team', 'Team']],
  directory: [['client', 'Clients'], ['supplier', 'Suppliers'], ['labour', 'Labour (CIS)']],
};
const Chip = ({ on, label, onPress, n }: { on: boolean; label: string; onPress: () => void; n?: number }) => {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', justifyContent: 'center', alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? t.brand1 : base.line, backgroundColor: on ? t.brand1 : base.card }}>
      <Text style={{ fontWeight: '500', fontSize: 12.5, color: on ? t.brand1Text : base.ink }}>{label}{n ? ` (${n})` : ''}</Text>
    </Pressable>
  );
};
export { Chip as FinChip };
/** A row of tabs that scrolls sideways, with a fade and arrow on the right while there are more to see. */
export function FinTabRow({ children, style }: { children: ReactNode; style?: object }) {
  const [box, setBox] = useState({ w: 0, c: 0, x: 0 });
  const update = (n: Partial<typeof box>) => setBox((b) => ({ ...b, ...n }));
  const more = box.c - box.w - box.x > 4;
  return (
    <View style={[{ borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginBottom: 10 }, style]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={32} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 2 }}
        onLayout={(e) => update({ w: e.nativeEvent.layout.width })} onContentSizeChange={(w) => update({ c: w })} onScroll={(e) => update({ x: e.nativeEvent.contentOffset.x })}>
        {children}
      </ScrollView>
      {more && <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 34, alignItems: 'flex-end', justifyContent: 'center', backgroundColor: 'rgba(238,240,242,0.92)' }}><Text style={{ fontSize: 18, fontWeight: '600', color: base.slate, paddingRight: 6 }}>›</Text></View>}
    </View>
  );
}
const useJobBilling = (id: string) => useQuery({ queryKey: ['finJobBilling', id], queryFn: async () => ((await fdb.from('job_finance').select('billing_type').eq('site_id', id).maybeSingle()).data as { billing_type: string | null } | null)?.billing_type ?? null });
/** Inside the Bill of Quantities tab: the Bill, its Variations and the Plots (Andy, 2 Nov 2026). An invoice job has no Bill, so those two only. */
export function BoqTabs({ id, on }: { id: string; on: 'boq' | 'variations' | 'plots' }) {
  const t = useTheme();
  const { data: billing } = useJobBilling(id);
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
      {([['boq', 'BoQ'], ['variations', 'Variations'], ['plots', 'Plots']] as const).filter(([k]) => k !== 'boq' || billing !== 'invoice').map(([k, l]) => (
        <Pressable key={k} accessibilityRole="button" onPress={() => { if (on !== k) router.replace(`/fin/job/${id}/${k}` as never); }} style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: on === k ? t.brand1 : 'transparent' }}>
          <Text style={{ fontSize: 14, fontWeight: on === k ? '700' : '600', color: on === k ? '#111827' : '#6b7280' }}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}
/** Variations and Day Works share the Variations tab. */
export function VarDayChips({ id, on }: { id: string; on: 'variations' | 'dayworks' }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
      <Chip on={on === 'variations'} label="Variations" onPress={() => { if (on !== 'variations') router.replace(`/fin/job/${id}/variations` as never); }} />
      <Chip on={on === 'dayworks'} label="Day Works" onPress={() => { if (on !== 'dayworks') router.replace(`/fin/job/${id}/dayworks` as never); }} />
    </View>
  );
}
/** The white row with the job and + New, then a project's tabs: on every page inside a project (Andy, 2 Nov 2026). */
export function FinJobTabs({ id, active, job, name, onOverview }: { id: string; active: string; job?: string | null; name?: string | null; onOverview: boolean }) {
  const t = useTheme();
  const { data: billing } = useJobBilling(id);
  const invoiceJob = billing === 'invoice';
  // Variations sit inside the Bill of Quantities tab, unless an invoice job has no Bill.
  const current = active === 'variations' && !invoiceJob ? 'boq' : active;
  const tabs: [string, string][] = [['overview', 'Overview'], ['sales', 'Sales'], ['purchases', 'Purchases'], ['subs', 'Subcontractors & Labour'], ...(invoiceJob ? [['variations', 'Variations'] as [string, string]] : [['boq', 'Bill of Quantities'] as [string, string]]), ['docs', 'Documents'], ['setup', 'Project Admin']];
  // Swaps the page rather than stacking another on top: a Bill left open underneath would keep saving over this one.
  const go = (k: string) => { if (k === 'boq' || k === 'variations') router.replace(`/fin/job/${id}/${k}` as never); else if (onOverview) router.setParams({ tab: k }); else router.replace(`/fin/job/${id}?tab=${k}` as never); };
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 8, marginTop: 6, marginBottom: 2 }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: base.ink }}><Text style={{ fontWeight: '600' }}>{job || ''}</Text>  {name || ''}</Text>
        <Pressable onPress={async () => {
          const opts = [['inv', 'Invoice', `/fin/job/${id}/invoice/new`], ...(invoiceJob ? [] : [['app', 'Application', `/fin/job/${id}/application/new`]]), ['po', 'Purchase order', `/fin/po/new?site=${id}`], ['pinv', 'Purchase invoice', `/fin/pinv/new?site=${id}`], ['plant', 'Plant hire', `/fin/plant/new?site=${id}`], ['sub', 'Subcontractor order', `/fin/sub/new?site=${id}`]];
          const k = await chooseAction('New', opts.map(([key, label]) => ({ key, label })));
          const o = opts.find((x) => x[0] === k); if (o) router.push(o[2] as never);
        }} style={{ backgroundColor: t.brand1, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14, flexDirection: 'row', gap: 18 }}>
          <Text style={{ color: t.brand1Text, fontSize: 12.5, fontWeight: '600' }}>+ New</Text><Text style={{ color: t.brand1Text, fontSize: 11 }}>▾</Text>
        </Pressable>
      </View>
      <FinTabRow style={{ marginTop: 6, marginBottom: 0 }}>
        {tabs.map(([k, l]) => (
          <Pressable key={k} onPress={() => go(k)} style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: current === k ? t.brand1 : 'transparent' }}>
            <Text style={{ fontSize: 13, fontWeight: current === k ? '700' : '600', color: current === k ? '#111827' : '#6b7280' }}>{l}</Text>
          </Pressable>
        ))}
      </FinTabRow>
    </View>
  );
}
/** The grey filter bar with counts (finsubtabs): the chosen one white. */
export function FinSeg({ items, value, onChange }: { items: [string, string, number?][]; value: string; onChange: (k: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'flex-start', gap: 2, backgroundColor: '#EEF0F2', borderRadius: 10, padding: 3 }}>
      {items.map(([k, l, n], i) => {
        const on = k === value;
        return (
          <Pressable key={k} onPress={() => onChange(k)} style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 }, on && { backgroundColor: '#fff', shadowColor: '#14161C', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }]}>
            <Text style={{ fontSize: 12, fontWeight: on ? '600' : '500', color: on ? '#111827' : '#6b7280' }}>{l}</Text>
            {n != null && n > 0 && <Text style={{ fontSize: 10.5, fontWeight: '600', color: i === 0 ? '#fff' : '#6b7280', backgroundColor: i === 0 ? '#E3262B' : '#E1E4E8', borderRadius: 9, minWidth: 18, textAlign: 'center', paddingHorizontal: 5, overflow: 'hidden' }}>{n}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

export function FinPage({ title, section, sub, onSub, badges, children, wide, top, foot }: { title: string; section: string; sub?: string; onSub?: (k: string) => void; badges?: Record<string, number>; children: ReactNode; wide?: boolean; top?: ReactNode; foot?: ReactNode }) {
  const { me, org } = useAuth();
  const t = useTheme();
  // Team only for Finance-only companies, which have no Admin Centre; everyone else switches Finance on in Admin › Users.
  const subs = (FIN_SUBS[section] || []).filter(([k]) => !(section === 'settings' && k === 'team' && org?.has_pm !== false));
  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[page(wide ? 1200 : 900), { paddingTop: 0 }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title }} />
      {!me ? null : !isFinanceUser(me, org) ? <Muted>OpHUB Finance isn&apos;t switched on for your account.</Muted> : (
        <>
          <FinTabRow style={{ marginTop: 10 }}>
            {FIN_SECTIONS.map((s) => (
              <Pressable key={s.k} onPress={() => router.replace(s.go as never)} style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: s.k === section ? t.brand1 : 'transparent' }}>
                <Text style={{ fontSize: 13, fontWeight: s.k === section ? '700' : '600', color: s.k === section ? '#111827' : '#6b7280' }}>{s.l}</Text>
              </Pressable>
            ))}
          </FinTabRow>
          {section === 'overview' && <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 10 }}><Text style={{ color: '#111827', fontSize: 12 }}>🔒 Finance trial — nothing is sent from Finance (no emails, no Xero, no pushes to PMs) while it&apos;s being tested.</Text></View>}
          {!!top && <FinMode.Provider value>{top}</FinMode.Provider>}
          {subs.length > 1 && onSub && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 10 }}>
              {subs.map(([k, l]) => <Pressable key={k} onPress={() => onSub(k)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 2, borderColor: k === sub ? base.ink : 'transparent' }}><Text style={{ fontWeight: k === sub ? '800' : '600', color: k === sub ? base.ink : base.slate }}>{l}{badges?.[k] ? ` · ${badges[k]}` : ''}</Text></Pressable>)}
            </ScrollView>
          )}
          <FinMode.Provider value>{children}</FinMode.Provider>
        </>
      )}
    </ScrollView>
    {foot}
    </View>
  );
}
const STAT_TONE = { blue: ['#f3f7ff', '#dbe6ff', '#1d4ed8'], green: ['#f1fbf5', '#d3f0de', '#15803d'], red: ['#fff5f4', '#fbdcd9', '#c81e1e'], amber: ['#fffaf0', '#f8e7c2', '#b45309'] } as const;
export function FinStat({ v, label, hot, onPress, tone, onMenu, basis = 160 }: { v: string; label: string; hot?: boolean; onPress?: () => void; tone?: keyof typeof STAT_TONE; onMenu?: () => void; basis?: number | `${number}%` }) {
  const c = tone ? STAT_TONE[tone] : null;
  return (
    <Pressable onPress={onPress} style={{ flexGrow: 1, flexBasis: basis, backgroundColor: c ? c[0] : base.card, borderRadius: 10, borderWidth: 1, borderColor: c ? c[1] : '#e5e7eb', paddingVertical: 16, paddingHorizontal: 18, gap: 4 }}>
      {onMenu ? <Pressable onPress={onMenu} hitSlop={8} accessibilityLabel={`Change dates: ${label}`} style={{ position: 'absolute', top: 6, right: 8, paddingHorizontal: 6, paddingVertical: 2, zIndex: 1 }}><Text style={{ fontSize: 16, fontWeight: '600', color: base.slate }}>⋯</Text></Pressable> : null}
      <Text style={[{ fontWeight: '600' as const }, { fontSize: 22, color: c ? c[2] : hot ? '#C0392B' : base.ink }]}>{v}</Text>
      <Text style={{ fontSize: 12.5, color: '#6b7280', fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}
export function FinRow({ left, title, sub, right, onPress, tone, children, onMenu, compact }: { left?: string; title: string; sub?: string; right?: string; onPress?: () => void; tone?: string; children?: ReactNode; onMenu?: () => void; compact?: boolean }) {
  if (compact) return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.input, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 4 }}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontWeight: '500', fontSize: 13.5, color: base.ink }}>{left ? `${left} · ` : ''}{title}</Text>
        {sub ? <Text numberOfLines={2} style={{ fontSize: 11.5, color: base.slate, marginTop: 1 }}>{sub}</Text> : null}
        {children}
      </View>
      {/* The figure sits level with the ⋯, half way down the row (Andy, 3 Nov 2026). */}
      {right ? <Text style={{ fontWeight: '600', fontSize: 13, color: tone || base.ink }}>{right}</Text> : null}
      {onMenu ? <Pressable onPress={onMenu} hitSlop={8} accessibilityLabel={`More: ${left || title}`} style={{ paddingHorizontal: 4 }}><Text style={{ fontSize: 16, fontWeight: '600', color: base.slate }}>⋯</Text></Pressable> : null}
    </Pressable>
  );
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 10 }}>
      {left ? <Text style={{ fontWeight: '600', color: base.slate, minWidth: 54 }}>{left}</Text> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '500', color: base.ink }}>{title}</Text>
        {sub ? <Text style={{ fontSize: 12, color: base.slate }}>{sub}</Text> : null}
        {children}
      </View>
      {right ? <Text style={{ fontWeight: '600', color: tone || base.ink }}>{right}</Text> : null}
      {onMenu ? <Pressable onPress={onMenu} hitSlop={8} accessibilityLabel={`More: ${left || title}`} style={{ paddingHorizontal: 6 }}><Text style={{ fontSize: 16, fontWeight: '600', color: base.slate }}>⋯</Text></Pressable> : null}
      {onPress ? <Text style={{ color: base.slate }}>›</Text> : null}
    </Pressable>
  );
}
export const TONE: Record<string, string> = { warn: '#D98A00', bad: '#C0392B', blue: '#2F6FB3', grey: '#7A7F87' };
