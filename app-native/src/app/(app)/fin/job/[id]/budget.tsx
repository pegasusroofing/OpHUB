// Budget & forecast for one project (911 renderFinBudget): a budget and an
// optional "cost to complete" per heading; actual, ordered and forecast final cost. "Set budgets from a
// target margin" (9219zm): the money left for costs after the margin and company overheads, split across the headings.
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

// The usual split of the cost budget (9219zm FIN_BUD_SPLIT_DEF).
const SPLIT: Record<string, number> = { materials: 45, labour: 30, plant: 5, subcontract: 10, overheads: 7, other: 3 };
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 7, color: base.ink, backgroundColor: base.card, width: 110 };

export default function FinBudget() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useBook(me?.org_id, id);
  const [v, setV] = useState<Record<string, { budget: string; tc: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [tgtOpen, setTgtOpen] = useState(false);
  const [tgt, setTgt] = useState('20');
  const [split, setSplit] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(SPLIT).map(([k, n]) => [k, String(n)])));
  if (!data || !me) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const fc = forecast(data.book, id, data.settings);
  const vals = v || Object.fromEntries(fc.cats.map((k) => [k, { budget: fc.budget[k] != null ? String(fc.budget[k]) : '', tc: fc.tcSet[k] ? String(fc.toComplete[k]) : '' }]));
  const set = (k: string, f: 'budget' | 'tc', x: string) => setV({ ...vals, [k]: { ...vals[k], [f]: x } });
  return (
    <ScrollView contentContainerStyle={page(900)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Budget & forecast' }} />
      <Muted style={{ marginBottom: 10 }}>Budget per heading, and (optional) what&apos;s left to spend. Blank &quot;to complete&quot; = budget less spent and ordered. Expected final cost = spent + ordered + to complete.</Muted>
      <Card>
        <Text onPress={() => setTgtOpen(!tgtOpen)} style={{ fontWeight: '800', color: base.ink }}>{tgtOpen ? '▼' : '▶'} Set budgets from a target margin</Text>
        <Muted>Type the margin you want; it works out what you can spend and splits it across the headings.</Muted>
        {tgtOpen && (() => {
          const t = num(tgt), avail = t !== null && !isNaN(t) && t >= 0 && t < 100 && fc.ffa ? round2(fc.ffa * (1 - t / 100) - (fc.ohpForecast || 0)) : null;
          const spTot = fc.cats.reduce((x, k) => x + Math.max(0, Number(split[k]) || 0), 0);
          return (
            <View style={{ marginTop: 8, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View><Muted>Target margin %</Muted><TextInput value={tgt} onChangeText={setTgt} keyboardType="decimal-pad" style={[box, { width: 80 }]} /></View>
                <View><Muted>Available for costs</Muted><Text style={{ fontWeight: '800', color: base.ink }}>{avail != null ? money(avail) : '—'}</Text>{!!fc.ohpForecast && <Muted style={{ fontSize: 11 }}>after {money(fc.ohpForecast, 0)} company overheads</Muted>}</View>
              </View>
              <Muted>Split (% of the cost budget){spTot !== 100 ? ` — adds up to ${spTot}%` : ''}</Muted>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {fc.cats.map((k) => (
                  <View key={k}><Muted>{COST_CATS[k]}</Muted><TextInput value={split[k] ?? '0'} onChangeText={(x) => setSplit({ ...split, [k]: x })} keyboardType="decimal-pad" style={[box, { width: 70 }]} /></View>
                ))}
              </View>
              <Button title="Fill the budgets below" onPress={() => {
                if (t === null || isNaN(t) || t < 0 || t >= 100) { toast('Type a target margin between 0 and 99%.'); return; }
                if (!fc.ffa) { toast('Set the contract value (or the Bill of Quantities) first.'); return; }
                if (!avail || avail <= 0) { toast('That margin leaves nothing to spend.'); return; }
                if (!spTot) { toast('Give the split some percentages first.'); return; }
                const keys = fc.cats.filter((k) => (Number(split[k]) || 0) > 0); let used = 0;
                const next = { ...vals };
                fc.cats.forEach((k) => { next[k] = { ...next[k], budget: '' }; });
                keys.forEach((k, i) => { const x = i === keys.length - 1 ? round2(avail - used) : round2((avail * (Number(split[k]) || 0)) / spTot); used = round2(used + x); next[k] = { ...next[k], budget: String(x) }; });
                setV(next); toast('Budgets filled in — check them, then Save budget & forecast');
              }} />
              <Muted>Nothing is saved until you press Save budget &amp; forecast.</Muted>
            </View>
          );
        })()}
      </Card>
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
