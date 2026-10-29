// Monthly project report (920): one column per month — applied and
// certified (the change from the last application), invoiced, and actual
// costs — "in the month" or as a running total, with the forecast value,
// budget and final cost alongside. (Plot-by-plot groups and the Excel / PDF
// export are still in the current app.)
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { FinChip, FinRow } from '@/components/FinNav';
import { Card, Muted, SectionTitle } from '@/components/ui';
import { useBook } from '@/data/finBook';
import { useAuth } from '@/lib/auth';
import { forecast } from '@/lib/rules/finBook';
import { money, round2, today } from '@/lib/rules/finance';
import { base, space } from '@/theme/theme';

type Row = Record<string, any>;
const label = (k: string) => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); };

export default function FinMonthly() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { data } = useBook(me?.org_id, id);
  const [view, setView] = useState<'month' | 'cum'>('month');
  if (!data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const fc = forecast(data.book, id, data.settings);
  const rows: Record<string, Record<string, number>> = { applied: {}, certified: {}, invoiced: {}, cost: {} };
  const months = new Set<string>([today().slice(0, 7)]);
  const add = (r: string, m: string, v: number) => { if (!m || !v) return; months.add(m); rows[r][m] = round2((rows[r][m] || 0) + v); };
  let pg = 0, pc = 0;
  (data.book.apps as Row[]).filter((a) => a.site_id === id && !['void', 'draft'].includes(a.status)).sort((x, y) => x.number - y.number).forEach((a) => {
    const g = Number(a.gross || 0); add('applied', String(a.valuation_date || '').slice(0, 7), round2(g - pg)); pg = g;
    if (a.cert_gross != null) { add('certified', String(a.cert_date || a.valuation_date || '').slice(0, 7), round2(Number(a.cert_gross) - pc)); pc = Number(a.cert_gross); }
  });
  (data.book.invs as Row[]).filter((i) => i.site_id === id && !['void', 'draft'].includes(i.status)).forEach((i) => add('invoiced', String(i.issue_date || i.created_at || '').slice(0, 7), Number(i.net || 0)));
  fc.lines.filter((l) => l.cat !== 'committed').forEach((l) => add('cost', String(l.date || '').slice(0, 7), l.net));
  const ms = Array.from(months).filter(Boolean).sort();
  const all: string[] = [];
  if (ms.length) { let [y, mo] = ms[0].split('-').map(Number); const [ly, lm] = ms[ms.length - 1].split('-').map(Number); while (y < ly || (y === ly && mo <= lm)) { all.push(`${y}-${String(mo).padStart(2, '0')}`); mo++; if (mo > 12) { mo = 1; y++; } } }
  const ROWS: [string, string][] = [['applied', 'Applied'], ['certified', 'Certified'], ['invoiced', 'Invoiced'], ['cost', 'Actual costs']];
  const series = (r: string) => { let run = 0; return all.map((m) => { const v = rows[r][m] || 0; run = round2(run + v); return view === 'cum' ? run : v; }); };
  const total = (r: string) => round2(Object.values(rows[r]).reduce((t, v) => t + v, 0));
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 1200, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Monthly report' }} />
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}><FinChip on={view === 'month'} label="In the month" onPress={() => setView('month')} /><FinChip on={view === 'cum'} label="Running total" onPress={() => setView('cum')} /></View>
      <ScrollView horizontal>
        <View>
          <View style={{ flexDirection: 'row', borderBottomWidth: 2, borderColor: base.ink, paddingBottom: 4 }}>
            <Text style={{ width: 120, fontWeight: '800', color: base.ink }}> </Text>
            {all.map((m) => <Text key={m} style={{ width: 96, textAlign: 'right', fontWeight: '800', color: base.ink, fontSize: 12 }}>{label(m)}</Text>)}
            <Text style={{ width: 110, textAlign: 'right', fontWeight: '800', color: base.ink, fontSize: 12 }}>Total</Text>
          </View>
          {ROWS.map(([k, l]) => (
            <View key={k} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: base.line, paddingVertical: 5 }}>
              <Text style={{ width: 120, fontWeight: '700', color: base.ink }}>{l}</Text>
              {series(k).map((v, i) => <Text key={i} style={{ width: 96, textAlign: 'right', color: base.ink, fontSize: 12.5 }}>{v ? money(v, 0) : '—'}</Text>)}
              <Text style={{ width: 110, textAlign: 'right', fontWeight: '800', color: base.ink }}>{money(total(k), 0)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <SectionTitle>Forecast</SectionTitle>
      <Card><FinRow title="Forecast value" right={money(fc.ffa, 0)} /><FinRow title="Budget" right={fc.budgetTotal != null ? money(fc.budgetTotal, 0) : '—'} /><FinRow title="Forecast final cost" right={money(fc.forecastCost, 0)} /></Card>
      <Muted>Excl. VAT. Applied and certified = the change from the last application. Actual costs are by invoice / work date.</Muted>
    </ScrollView>
  );
}
