// Monthly project report (920): one column per month — applied and
// certified (the change from the last application), invoiced, and actual
// costs — "in the month" or as a running total, with the forecast value,
// budget and final cost. Grouped: Total, then each plot / repair job, then
// Not allocated (tap a group to fold it). Excel and PDF downloads.
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FinChip } from '@/components/FinNav';
import { useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { fdb } from '@/data/finance';
import { useBook } from '@/data/finBook';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { billingType, forecast } from '@/lib/rules/finBook';
import { money, round2, today } from '@/lib/rules/finance';
import { itemPlots, monthlyReport, monthlyRows, type MonGroup } from '@/lib/rules/finMonthly';
import { exportTableExcel, exportTablePdf, type Table } from '@/lib/tableExport';
import { base, space } from '@/theme/theme';

type Row = Record<string, any>;
const label = (k: string) => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); };

export default function FinMonthly() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const { data } = useBook(me?.org_id, id);
  const { data: site } = useSite(id);
  const [view, setView] = useState<'month' | 'cum'>('month');
  const [open, setOpen] = useState<Record<string, boolean>>({ all: true });
  // Plots (multi-address jobs) or repair jobs, and each one's value (920 finSubJobsLoad / finSubValues).
  const { data: plots } = useQuery({ queryKey: ['finMonPlots', id, site?.repair_contract, site?.multi_site], enabled: !!site, queryFn: async () => {
    const s = site as Row;
    let subs: (MonGroup & { value?: number | null })[] = [];
    if (s.repair_contract) subs = (((await fdb.from('repair_jobs').select('id,job_number,address,variation_cost').eq('site_id', id).order('created_at')).data as Row[] | null) ?? []).map((r) => ({ id: r.id, name: [r.job_number, r.address].filter(Boolean).join(' — ') || 'Repair job', value: r.variation_cost != null ? Number(r.variation_cost) : null }));
    else if (s.multi_site) subs = (((await fdb.from('site_sub_addresses').select('id,name').eq('site_id', id).order('name')).data as Row[] | null) ?? []).map((a) => ({ id: a.id, name: a.name || 'Address' }));
    const vals = ((await fdb.from('fin_sub_values').select('sub_job_id,value').eq('site_id', id)).data as Row[] | null) ?? [];
    return { subs, vals };
  } });
  if (!data || !plots) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const fc = forecast(data.book, id, data.settings);
  const items = (data.book.items as Row[]).filter((i) => i.site_id === id).sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
  const apps = (data.book.apps as Row[]).filter((a) => a.site_id === id);
  const subValues: Record<string, number | null> = {};
  if (billingType(fc.jf, items.length, apps.length) === 'application' && items.some((i) => !i.kind || i.kind === 'item')) {
    const pl = itemPlots(items); items.filter((i) => !i.kind || i.kind === 'item').forEach((i) => { const k = pl[i.id] || ''; subValues[k] = round2((subValues[k] || 0) + Number(i.value || 0)); });
  } else {
    plots.subs.forEach((s) => { if (s.value != null) subValues[s.id] = s.value; });
    plots.vals.forEach((v) => { if (v.value != null) subValues[v.sub_job_id] = Number(v.value); });
  }
  const rep = monthlyReport({ apps, invs: (data.book.invs as Row[]).filter((i) => i.site_id === id), lines: fc.lines, items, subs: plots.subs, forecast: { value: fc.ffa, budget: fc.budgetTotal ?? null, final: fc.forecastCost }, subValues, today: today() });
  const grouped = monthlyRows(rep, view === 'cum');
  const cur = today().slice(0, 7);
  const title = `Monthly report — ${site?.job_number ? `${site.job_number} ` : ''}${site?.name || ''}`;
  const table = (): Table => ({
    title, sub: view === 'cum' ? 'Running totals' : 'In the month',
    cols: [{ l: 'Group', w: 90 }, { l: 'Row', w: 100 }, ...rep.months.map((m) => ({ l: label(m), money: true, w: 70 })), { l: 'Total', money: true, w: 80 }],
    rows: grouped.flatMap(({ g, rows }) => rows.map((r) => [g.name, r.label, ...rep.months.map((_, i) => (r.vals ? r.vals[i] : null)), r.total])),
  });
  const cell = (v: number | null | undefined) => (v == null ? '' : v ? money(v, 0) : '—');
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 1200, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Monthly report' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        <FinChip on={view === 'month'} label="In the month" onPress={() => setView('month')} /><FinChip on={view === 'cum'} label="Running total" onPress={() => setView('cum')} />
        <View style={{ flex: 1 }} />
        <Button kind="ghost" title="📊 Excel" onPress={async () => { if (!(await exportTableExcel(table(), org).catch(() => false))) toast('Could not make the file — try again.'); }} />
        <Button kind="ghost" title="📄 PDF" onPress={async () => { if (!(await exportTablePdf(table(), org).catch(() => false))) toast('Could not make the PDF — try again.'); }} />
      </View>
      <ScrollView horizontal>
        <View>
          <View style={{ flexDirection: 'row', borderBottomWidth: 2, borderColor: base.ink, paddingBottom: 4 }}>
            <Text style={{ width: 150, fontWeight: '800', color: base.ink }}>Cost report</Text>
            {rep.months.map((m) => <Text key={m} style={{ width: 96, textAlign: 'right', fontWeight: '800', color: m === cur ? base.blue : base.ink, fontSize: 12 }}>{label(m)}</Text>)}
            <Text style={{ width: 110, textAlign: 'right', fontWeight: '800', color: base.ink, fontSize: 12 }}>Total</Text>
          </View>
          {grouped.map(({ g, rows }) => (
            <View key={g.id}>
              <Pressable onPress={() => setOpen({ ...open, [g.id]: !open[g.id] })} style={{ paddingVertical: 6, backgroundColor: '#EEF0F4', paddingHorizontal: 4 }}>
                <Text style={{ fontWeight: '800', color: base.ink }}>{open[g.id] ? '▼' : '▶'} {g.name}</Text>
              </Pressable>
              {open[g.id] && rows.map((r) => (
                <View key={r.label} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: base.line, paddingVertical: 5 }}>
                  <Text style={{ width: 150, fontWeight: '700', color: base.ink }}>{r.label}</Text>
                  {rep.months.map((m, i) => <Text key={m} style={{ width: 96, textAlign: 'right', color: base.ink, fontSize: 12.5 }}>{r.vals ? cell(r.vals[i]) : ''}</Text>)}
                  <Text style={{ width: 110, textAlign: 'right', fontWeight: '800', color: base.ink }}>{r.total == null ? '—' : money(r.total, 0)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      <Muted style={{ marginTop: 10 }}>Excl. VAT. Applied and certified = the change from the last application. Actual costs are by invoice / work date. Forecast value, budget and final cost are in the total column.{rep.groups.length > 1 ? ' Plot figures use the plot on each schedule line and each cost.' : ''}</Muted>
    </ScrollView>
  );
}
