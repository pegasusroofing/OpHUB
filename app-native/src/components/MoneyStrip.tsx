// The money strip on a job's home (921 finHomeStripHtml) — on project homes and repair contracts.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { chooseAction, useToast } from '@/components/toast';
import { useBook } from '@/data/finBook';
import { useAuth } from '@/lib/auth';
import { heading } from '@/lib/fonts';
import { plainGet, plainSet } from '@/lib/kv';
import { forecast, marginOn, pctTxt, type MarginBasis } from '@/lib/rules/finBook';
import { money } from '@/lib/rules/finance';
import type { Site } from '@/lib/types';
import { base, useDesk } from '@/theme/theme';

/** Finance users: costs to date, invoiced to date, profit margin (921 finHomeStripHtml). Tap for the project's Finance. */
export function MoneyStrip({ site, embedded }: { site: Site; embedded?: boolean }) {
  const { me } = useAuth();
  const desk = useDesk();
  const { data } = useBook(me?.org_id, site.id);
  const toast = useToast();
  const qc = useQueryClient();
  // Kept on this device, like the old ⋯ menu (921:47).
  const { data: basis = 'auto' } = useQuery({ queryKey: ['finMarginBasis'], queryFn: () => plainGet<MarginBasis>('ophub.finMarginBasis', 'auto') });
  const pickBasis = async () => {
    const opts: [MarginBasis, string][] = [['auto', 'Latest (certified, else applied)'], ['applied', 'Applied'], ['certified', 'Certified'], ['invoiced', 'Invoiced']];
    const k = await chooseAction('Measure margin against', opts.map(([key, label]) => ({ key, label: basis === key ? `✓ ${label}` : label }))) as MarginBasis | null;
    if (!k) return;
    await plainSet('ophub.finMarginBasis', k); qc.setQueryData(['finMarginBasis'], k);
    toast(`Margin measured against ${k === 'auto' ? 'the latest (certified, else applied)' : k}`);
  };
  const fc = data ? forecast(data.book, site.id, data.settings) : null;
  // No line under the figure (Andy, 3 Nov 2026): the three sit level.
  const cell = (label: string, v: ReactNode, _em: string, first?: boolean, menu?: ReactNode) => (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: desk ? 14 : 10, paddingHorizontal: desk ? 16 : 8, borderLeftWidth: first ? 0 : 1, borderLeftColor: '#EEF0F4' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: desk ? 12 : 10.5, fontWeight: '600', color: base.slate, textTransform: 'uppercase', letterSpacing: desk ? 0.5 : 0.2 }}>{label}</Text>
        {menu}
      </View>
      {fc ? v : <View style={{ backgroundColor: '#F0F2F5', borderRadius: 6, width: '70%', height: 24 }} />}
    </View>
  );
  const big = (s: string, colour: string = base.ink, small?: string) => (
    <Text numberOfLines={1} style={[heading(800), { fontSize: desk ? 22 : 16, color: colour }]}>{s}{small ? <Text style={{ fontSize: desk ? 13 : 11 }}> {small}</Text> : null}</Text>
  );
  let costs = <View />, inv = <View />, marg = <View />, e1 = '', e2 = '', e3 = '';
  if (fc) {
    const prog = fc.certified || fc.applied || 0;
    const on = marginOn(fc, basis), m = on.value - fc.costToDate, pct = on.value ? (m / on.value) * 100 : null;
    costs = big(money(fc.costToDate, 0));
    e1 = fc.committedTotal ? `+ ${money(fc.committedTotal, 0)} ordered` : fc.budgetTotal ? `${pctTxt((fc.costToDate / fc.budgetTotal) * 100)} of budget` : '';
    inv = big(money(fc.invoiced, 0));
    e2 = prog ? `${fc.certified ? 'Certified' : 'Applied'} ${money(prog, 0)}` : fc.ffa ? `of ${money(fc.ffa, 0)}` : '';
    marg = on.value ? big(money(m, 0), m < 0 ? base.red : base.ok, pctTxt(pct)) : big('—');
    e3 = on.value ? `on ${money(on.value, 0)} ${on.label}` : `Nothing ${on.basis === 'auto' ? 'applied or invoiced' : on.label} yet`;
  }
  return (
    <Pressable onPress={() => router.push(`/fin/job/${site.id}` as never)} accessibilityLabel="Open project finance"
      style={embedded ? { flexDirection: 'row', marginTop: 10, borderTopWidth: 1, borderTopColor: '#EEF0F2' } : { flexDirection: 'row', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, marginBottom: 14, overflow: 'hidden' }}>
      {cell('Costs to date', costs, e1, true)}
      {cell('Invoiced to date', inv, e2)}
      {cell('Profit margin', marg, e3, false, <Pressable onPress={() => void pickBasis()} hitSlop={8} accessibilityLabel="Measure margin against"><Text style={{ color: base.slate, fontWeight: '600', fontSize: desk ? 16 : 14, paddingHorizontal: 4 }}>⋮</Text></Pressable>)}
    </Pressable>
  );
}
