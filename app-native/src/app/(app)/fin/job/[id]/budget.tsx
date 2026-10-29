// Budget & forecast for one project (911 renderFinBudget): a budget and an
// optional "cost to complete" per heading; actual, ordered and forecast final cost.
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { fdb } from '@/data/finance';
import { useBook } from '@/data/finBook';
import { useAuth } from '@/lib/auth';
import { COST_CATS, forecast } from '@/lib/rules/finBook';
import { money, num, round2 } from '@/lib/rules/finance';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 7, color: base.ink, backgroundColor: base.card, width: 110 };

export default function FinBudget() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useBook(me?.org_id, id);
  const [v, setV] = useState<Record<string, { budget: string; tc: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data || !me) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const fc = forecast(data.book, id, data.settings);
  const vals = v || Object.fromEntries(fc.cats.map((k) => [k, { budget: fc.budget[k] != null ? String(fc.budget[k]) : '', tc: fc.tcSet[k] ? String(fc.toComplete[k]) : '' }]));
  const set = (k: string, f: 'budget' | 'tc', x: string) => setV({ ...vals, [k]: { ...vals[k], [f]: x } });
  return (
    <ScrollView contentContainerStyle={page(900)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Budget & forecast' }} />
      <Muted style={{ marginBottom: 10 }}>Budget per heading, and (optional) what&apos;s left to spend. Blank &quot;to complete&quot; = budget less spent and ordered. Expected final cost = spent + ordered + to complete.</Muted>
      {fc.cats.map((k) => {
        const b = num(vals[k].budget), tcTyped = num(vals[k].tc);
        const tc = tcTyped !== null && !isNaN(tcTyped) ? tcTyped : b !== null && !isNaN(b) ? Math.max(0, round2(b - fc.actual[k] - fc.committed[k])) : 0;
        return (
          <Card key={k}>
            <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 6 }}>{COST_CATS[k]}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <View><Muted>Budget £</Muted><TextInput value={vals[k].budget} onChangeText={(x) => set(k, 'budget', x)} keyboardType="decimal-pad" placeholder="£0.00" style={box} /></View>
              <View><Muted>To complete £</Muted><TextInput value={vals[k].tc} onChangeText={(x) => set(k, 'tc', x)} keyboardType="decimal-pad" placeholder={money(fc.toComplete[k] || 0)} style={box} /></View>
              <View style={{ flex: 1, minWidth: 200 }}><Muted>Spent {money(fc.actual[k], 0)} · ordered {money(fc.committed[k], 0)}</Muted><Text style={{ fontWeight: '800', color: base.ink }}>Expected final {money(fc.actual[k] + fc.committed[k] + tc, 0)}</Text></View>
            </View>
          </Card>
        );
      })}
      <Card><Text style={{ color: base.ink }}>Expected final value {money(fc.ffa, 0)} · expected final cost {money(fc.forecastCost, 0)} · <Text style={{ fontWeight: '800' }}>expected profit {money(fc.forecastMargin, 0)}</Text></Text>{fc.budgetSource === 'schedule' && <Muted>No heading budgets yet — the budget is taken from the schedule&apos;s cost prices.</Muted>}</Card>
      <Button busy={busy} title="Save budget & forecast" onPress={async () => {
        const rows = [];
        for (const k of fc.cats) {
          const b = num(vals[k].budget), t = num(vals[k].tc);
          if ((b !== null && isNaN(b)) || (t !== null && isNaN(t))) { toast(`Check the figures for ${COST_CATS[k]}.`); return; }
          rows.push({ org_id: me.org_id, site_id: id, category: k, budget: b, to_complete: t, updated_at: new Date().toISOString(), updated_by: me.id });
        }
        setBusy(true);
        try {
          const r = await fdb.from('fin_job_budgets').upsert(rows as never, { onConflict: 'site_id,category' });
          if (r.error) { toast(`Save failed — ${r.error.message}`); return; }
          // First budget becomes the original budget.
          const tot = round2(rows.reduce((t, x) => t + (Number(x.budget) || 0), 0));
          if (fc.jf.original_cost == null && tot) await fdb.from('job_finance').upsert({ site_id: id, org_id: me.org_id, original_cost: tot, original_value: fc.jf.original_value != null ? fc.jf.original_value : fc.jf.contract_value ?? null, original_at: new Date().toISOString() } as never, { onConflict: 'site_id' });
          toast('Budget & forecast saved'); setV(null); void qc.invalidateQueries({ queryKey: ['finBook'] });
        } finally { setBusy(false); }
      }} />
    </ScrollView>
  );
}
