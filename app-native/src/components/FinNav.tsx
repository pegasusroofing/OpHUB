// Finance section bar and sub-tabs (914 finSectionNav / finSubTabs), the page
// wrapper with the access check, and small shared bits (stat tile, row, chip).
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { chooseAction } from '@/components/toast';
import { FinMode, Muted } from '@/components/ui';
import { fdb } from '@/data/finance';
import { useAuth } from '@/lib/auth';
import { isFinanceController, isFinanceOnlyOrg, isFinanceUser } from '@/lib/roles';
import { base, page, radius, useTheme } from '@/theme/theme';

export const FIN_SECTIONS = [
  { k: 'overview', l: 'Overview', go: '/fin' }, { k: 'jobs', l: 'Projects', go: '/fin/jobs' }, { k: 'sales', l: 'Sales', go: '/fin/sales' },
  { k: 'purchases', l: 'Purchases', go: '/fin/purchases' }, { k: 'subs', l: 'Subcontractors & Labour', go: '/fin/subs' }, { k: 'reports', l: 'Reports', go: '/fin/reports' }, { k: 'directory', l: 'Directory', go: '/fin/directory' }, { k: 'settings', l: 'Settings', go: '/fin/settings' },
];
export const FIN_SUBS: Record<string, [string, string][]> = {
  sales: [['apps', 'Applications & Certificates'], ['invoices', 'Invoices'], ['retention', 'Retention']],
  // The current app's order: invoices first, then orders, statements, yard, plant hire, prices (9219z, 9219l, 9219m; cmp-fin 5 Nov 2026).
  purchases: [['invoices', 'Purchase Invoices'], ['orders', 'Purchase Orders'], ['statements', 'Statements'], ['yard', 'Yard'], ['plant', 'Plant Hire'], ['prices', 'Price Lists']], // Suppliers live in the Directory (Andy, 5 Nov 2026)
  // Every word capitalised, as the current app (9219x) and Andy's rule (cmp-fin 5 Nov 2026).
  subs: [['opinv', 'Operative Invoices'], ['wages', 'Wages To Book'], ['payrun', 'Pay Run'], ['orders', 'Subcontractor POs'], ['apps', 'Applications & Certificates'], ['cis', 'CIS'], ['rates', 'People & Rates']],
  settings: [['general', 'Settings'], ['codes', 'Cost Codes'], ['templates', 'Templates'], ['team', 'Team']],
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
/** One underlined tab, as the top Finance row: bold with a line in the company colour when on, grey when not.
 *  A count sits beside the name: grey, or amber for things waiting (Andy, 5 Nov 2026). */
function TabItem({ on, label, n, amber, onPress }: { on: boolean; label: string; n?: number; amber?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: on ? t.brand1 : 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: on ? '700' : '600', color: on ? '#111827' : '#6b7280' }}>{label}</Text>
        {n ? <Text accessibilityLabel={amber ? `${n} waiting` : undefined} style={{ fontSize: 10.5, fontWeight: '700', color: amber ? '#B45309' : on ? '#111827' : '#6b7280', backgroundColor: amber ? '#FDF1E0' : '#EEF0F3', borderRadius: 9, minWidth: 18, textAlign: 'center', paddingHorizontal: 5, overflow: 'hidden' }}>{n}</Text> : null}
      </View>
    </Pressable>
  );
}
/** A row of underlined tabs for Finance (Andy, 5 Nov 2026: "change all the tabs through finance to that").
 *  items: [key, label, count?]. right: a button that sits at the end of the row. */
export function FinTabs({ items, value, onChange, right, amber, style }: { items: [string, string, number?][]; value: string; onChange: (k: string) => void; right?: ReactNode; amber?: boolean; style?: object }) {
  const row = (
    <FinTabRow style={right ? { flex: 1, minWidth: 0, marginBottom: 0 } : style}>
      {items.map(([k, l, n]) => <TabItem key={k} on={value === k} label={l} n={n} amber={amber} onPress={() => onChange(k)} />)}
    </FinTabRow>
  );
  if (!right) return row;
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }, style]}>{row}<View>{right}</View></View>;
}
const useJobBilling = (id: string) => useQuery({ queryKey: ['finJobBilling', id], queryFn: async () => ((await fdb.from('job_finance').select('billing_type').eq('site_id', id).maybeSingle()).data as { billing_type: string | null } | null)?.billing_type ?? null });
/** Inside the Bill of Quantities tab: the Bill, its Variations and the Plots (Andy, 2 Nov 2026). An invoice job has no Bill, so those two only. */
export function BoqTabs({ id, on }: { id: string; on: 'boq' | 'variations' | 'plots' }) {
  const { data: billing } = useJobBilling(id);
  return <FinTabs items={([['boq', 'BoQ'], ['variations', 'Variations'], ['plots', 'Plots']] as [string, string][]).filter(([k]) => k !== 'boq' || billing !== 'invoice')} value={on} onChange={(k) => { if (on !== k) router.replace(`/fin/job/${id}/${k}` as never); }} />;
}
/** Variations and Day Works share the Variations tab. */
export function VarDayChips({ id, on }: { id: string; on: 'variations' | 'dayworks' }) {
  return <FinTabs items={[['variations', 'Variations'], ['dayworks', 'Day Works']]} value={on} onChange={(k) => { if (on !== k) router.replace(`/fin/job/${id}/${k}` as never); }} />;
}
/** The white row with the job and + New, then a project's tabs: on every page inside a project (Andy, 2 Nov 2026). */
export function FinJobTabs({ id, active, job, name, onOverview }: { id: string; active: string; job?: string | null; name?: string | null; onOverview: boolean }) {
  const t = useTheme();
  const { me, org } = useAuth();
  // Go To Project (Andy, 5 Nov 2026): straight to this job's page in Projects, for people who use Projects.
  const toProject = !isFinanceOnlyOrg(org) && !isFinanceController(me);
  const { data: billing } = useJobBilling(id);
  const invoiceJob = billing === 'invoice';
  // Variations sit inside the Bill of Quantities tab, unless an invoice job has no Bill.
  const current = active === 'variations' && !invoiceJob ? 'boq' : active;
  const tabs: [string, string][] = [['overview', 'Overview'], ['sales', 'Sales'], ['purchases', 'Purchases'], ['subs', 'Subcontractors & Labour'], ...(invoiceJob ? [['variations', 'Variations'] as [string, string]] : [['boq', 'Bill Of Quantities'] as [string, string]]), ['docs', 'Documents'], ['setup', 'Project Admin']];
  // Swaps the page rather than stacking another on top: a Bill left open underneath would keep saving over this one.
  const go = (k: string) => { if (k === 'boq' || k === 'variations') router.replace(`/fin/job/${id}/${k}` as never); else if (onOverview) router.setParams({ tab: k }); else router.replace(`/fin/job/${id}?tab=${k}` as never); };
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 8, marginTop: 6, marginBottom: 2 }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: base.ink }}><Text style={{ fontWeight: '600' }}>{job || ''}</Text>  {name || ''}</Text>
        {toProject && (
          <Pressable onPress={() => router.push(`/sites/${id}` as never)} accessibilityRole="button" style={{ borderWidth: 1, borderColor: t.brand1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14 }}>
            <Text style={{ color: t.brand1, fontSize: 12.5, fontWeight: '600' }}>Go To Project</Text>
          </Pressable>
        )}
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

/** A sideways row of tabs that keeps the one you're on in view. Plant hire, Yard stock and the rest sat off the
 *  right of a phone, and the row jumped back to the start each time one opened (Andy, 4 Nov 2026). */
function KeepInView({ on, items, render }: { on?: string; items: [string, string][]; render: (k: string, l: string) => ReactNode }) {
  const sv = useRef<ComponentRef<typeof ScrollView>>(null);
  const xs = useRef<Record<string, { x: number; w: number }>>({});
  const [vw, setVw] = useState(0);
  const go = () => { const p = on ? xs.current[on] : undefined; if (p && vw) sv.current?.scrollTo({ x: Math.max(0, p.x + p.w / 2 - vw / 2), animated: false }); };
  useEffect(go);
  return (
    <ScrollView ref={sv} horizontal showsHorizontalScrollIndicator={false} onLayout={(e) => setVw(e.nativeEvent.layout.width)} contentContainerStyle={{ gap: 2 }}>
      {items.map(([k, l]) => <View key={k} onLayout={(e) => { xs.current[k] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width }; if (k === on) go(); }}>{render(k, l)}</View>)}
    </ScrollView>
  );
}

/** The Settings tabs: Settings, Cost Codes, Templates and Team live on different pages. */
export const finSettingsGo = (k: string) => router.replace(({ general: '/fin/settings', codes: '/fin/directory?kind=codes', templates: '/fin/templates', team: '/fin/team' } as Record<string, string>)[k] as never);

/** subRight: a button at the right-hand end of the second tab row (+ New PO, Andy 5 Nov 2026). */
export function FinPage({ title, section, sub, onSub, badges, children, wide, top, foot, subRight }: { title: string; section: string; sub?: string; onSub?: (k: string) => void; badges?: Record<string, number>; children: ReactNode; wide?: boolean; top?: ReactNode; foot?: ReactNode; subRight?: ReactNode }) {
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}><View style={{ flex: 1, minWidth: 0, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}><KeepInView on={sub} items={subs} render={(k, l) => <TabItem on={k === sub} label={l} n={badges?.[k]} amber onPress={() => onSub(k)} />} /></View>{subRight}</View>
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
