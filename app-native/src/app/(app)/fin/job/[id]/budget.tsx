// Budget & forecast for one project (911 renderFinBudget): a budget and an
// optional "cost to complete" per heading; actual, ordered and forecast final cost. "Set budgets from a
// target margin" (9219zm): the money left for costs after the margin and company overheads, split across the headings.
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { fdb } from '@/data/finance';
import { useBook } from '@/data/finBook';
import { useAuth } from '@/lib/auth';
import { heading } from '@/lib/fonts';
import { COST_CATS, forecast, pctTxt } from '@/lib/rules/finBook';
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
  // Worked out from what's typed, so the summary moves as you go.
  const line = (k: string) => {
    const b = num(vals[k].budget), tcTyped = num(vals[k].tc);
    const budget = b !== null && !isNaN(b) ? b : null;
    const tc = tcTyped !== null && !isNaN(tcTyped) ? tcTyped : budget !== null ? Math.max(0, round2(budget - fc.actual[k] - fc.committed[k])) : fc.toComplete[k] || 0;
    return { budget, tc, final: round2(fc.actual[k] + fc.committed[k] + tc) };
  };
  const lines = fc.cats.map(line);
  const anyB = lines.some((l) => l.budget !== null);
  const typedB = round2(lines.reduce((t, l) => t + (l.budget || 0), 0));
  let finalCost = round2(lines.reduce((t, l) => t + l.final, 0));
  if (!anyB && fc.budgetSource === 'schedule') finalCost = Math.max(finalCost, round2(fc.budgetTotal || 0));
  const budgetNow = anyB ? typedB : fc.budgetSource === 'schedule' ? round2(fc.budgetTotal || 0) : null;
  const profit = round2(fc.ffa - finalCost - (fc.ohpForecast || 0));
  const over = budgetNow !== null ? round2(finalCost - budgetNow) : 0;
  return (
    <ScrollView contentContainerStyle={page(900)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Budget & forecast' }} />
      <Muted style={{ marginBottom: 10 }}>Budget per heading, and (optional) what&apos;s left to spend. Blank &quot;to complete&quot; = budget less spent and ordered. Expected final cost = spent + ordered + to complete.</Muted>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4, color: base.slate, textTransform: 'uppercase' }}>Forecast profit{fc.ohpPct ? ` (after ${fc.ohpPct}% overheads)` : ''}</Text>
            <Text style={[heading(800), { fontSize: 30, color: profit < 0 ? base.red : base.ink }]}>{money(profit, 0)}</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '800', borderRadius: 10, paddingVertical: 5, paddingHorizontal: 11, overflow: 'hidden', backgroundColor: profit < 0 ? '#FDECEC' : '#E7F6EC', color: profit < 0 ? '#B91C1C' : '#1E7A43' }}>{fc.ffa ? pctTxt((profit / fc.ffa) * 100) : '—'}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          {([[`Final account${fc.vPending ? ' (incl. submitted variations)' : ''}`, money(fc.ffa, 0)], ['Forecast final cost', money(finalCost, 0)], ['Budget', budgetNow !== null ? money(budgetNow, 0) : 'Not set']] as const).map(([l, x]) => (
            <View key={l} style={{ flex: 1 }}><Muted style={{ fontSize: 11.5, fontWeight: '700' }}>{l}</Muted><Text style={{ fontSize: 17, fontWeight: '800', color: base.ink }}>{x}</Text></View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 }}>
          <Muted>Spent {money(fc.costToDate, 0)}</Muted>
          <Muted>Ordered {money(fc.committedTotal, 0)}</Muted>
          {budgetNow !== null && <Text style={{ marginLeft: 'auto', fontSize: 12, fontWeight: '700', color: base.ink }}>Left {money(Math.max(0, round2(budgetNow - fc.costToDate - fc.committedTotal)), 0)}</Text>}
        </View>
        <Text style={{ marginTop: 10, fontSize: 13, fontWeight: budgetNow === null ? '400' : '800', borderRadius: 10, padding: 8, overflow: 'hidden', backgroundColor: budgetNow === null ? '#F6F7F9' : over > 0.5 ? '#FDEEEE' : '#EAF7EF', color: budgetNow === null ? '#4B5563' : over > 0.5 ? '#C81E1E' : '#1E7A3C' }}>
          {budgetNow === null ? 'No budget yet — set one below (or from a target margin) to see if the job is on track.' : over > 0.5 ? `Forecast to go ${money(over, 0)} over budget` : `Forecast to finish ${money(Math.abs(over), 0)} under budget`}
        </Text>
      </Card>
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
        const { budget: b, tc, final } = line(k), diff = b !== null ? round2(final - b) : null;
        return (
          <Card key={k}>
            <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 6 }}>{COST_CATS[k]}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <View><Muted>Budget £</Muted><TextInput value={vals[k].budget} onChangeText={(x) => set(k, 'budget', x)} keyboardType="decimal-pad" placeholder="£0.00" style={box} /></View>
              <View><Muted>To complete £</Muted><TextInput value={vals[k].tc} onChangeText={(x) => set(k, 'tc', x)} keyboardType="decimal-pad" placeholder={money(fc.toComplete[k] || 0)} style={box} /></View>
              <View style={{ flex: 1, minWidth: 200 }}><Muted>Spent {money(fc.actual[k], 0)} · ordered {money(fc.committed[k], 0)}</Muted><Text style={{ fontWeight: '800', color: base.ink }}>Expected final {money(final)}</Text>{diff !== null && <Muted style={{ color: diff > 0.5 ? base.red : base.slate, fontWeight: '700' }}>{diff > 0.5 ? 'over' : 'under'} {money(Math.abs(diff))}</Muted>}</View>
            </View>
          </Card>
        );
      })}
      <Card style={{ gap: 4 }}>
        <Text style={{ fontWeight: '800', color: base.ink }}>Total</Text>
        {([['Budget', budgetNow !== null ? money(budgetNow) : '—'], ['Spent', money(fc.costToDate)], ['Ordered', money(fc.committedTotal)], ['To complete', money(round2(lines.reduce((t, l) => t + l.tc, 0)))], ['Forecast final', money(finalCost)], ...(budgetNow !== null ? [[over > 0.5 ? 'Over' : 'Under', money(Math.abs(over))]] : [])] as string[][]).map(([l, x]) => (
          <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Muted>{l}</Muted><Text style={{ color: base.ink, fontWeight: '700' }}>{x}</Text></View>
        ))}
      </Card>
      <SectionTitle>Value</SectionTitle>
      <Card style={{ gap: 4 }}>
        {([['Contract value', money(fc.contract)], ['Variations agreed', money(fc.vAgreed)], ['Variations priced or submitted (not agreed)', money(fc.vPending)], ...(fc.vInstructed ? [['Instructed, not priced yet (estimate, not included)', money(fc.vInstructed)]] : []), ['Forecast final account (incl. submitted variations)', money(fc.ffa)], ...(fc.ohpPct ? [[`Company overheads (OHP) ${fc.ohpPct}% of the final account`, `−${money(fc.ohpForecast || 0)}`]] : []), ['Valuation to date (last application)', money(fc.valuation)], ['Invoiced', money(fc.invoiced)]] as string[][]).map(([l, x]) => (
          <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Muted style={{ flex: 1 }}>{l}</Muted><Text style={{ color: base.ink, fontWeight: l.startsWith('Forecast') ? '800' : '700' }}>{x}</Text></View>
        ))}
        {!fc.ohpPct && <Muted style={{ marginTop: 6 }}>No company overheads are being taken off this project’s profit. {me.role === 'admin' ? 'Set them in Finance › Settings › Company overheads (OHP).' : 'A company admin can set them in Finance › Settings.'}</Muted>}
      </Card>
      <Card><Text style={{ color: base.ink }}>Expected final value {money(fc.ffa, 0)} · expected final cost {money(finalCost, 0)} · <Text style={{ fontWeight: '800' }}>expected profit {money(profit, 0)}</Text></Text>{fc.budgetSource === 'schedule' && <Muted>No heading budgets yet — the budget is taken from the schedule&apos;s cost prices.</Muted>}
        {/* The starting point the job is measured against (911 finSetOriginal). */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <Muted style={{ flex: 1 }}>{fc.jf.original_value == null ? 'Save today’s value and budget as the starting point, so you can see how the job moves.' : `Starting point saved${fc.jf.original_at ? ` ${new Date(fc.jf.original_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}: value ${money(fc.jf.original_value, 0)}${fc.jf.original_cost != null ? ` · budget ${money(fc.jf.original_cost, 0)}` : ''}.`}</Muted>
          <Button kind="ghost" title={fc.jf.original_value == null ? 'Save starting point' : 'Update to today’s figures'} onPress={async () => {
            if (!(await confirmAsk(`Set the original to today’s figures?\n\nValue ${money(fc.ffa)} · budget ${fc.budgetTotal != null ? money(fc.budgetTotal) : 'none'}`, 'Set'))) return;
            const r = await fdb.from('job_finance').upsert({ site_id: id, org_id: me.org_id, original_value: fc.ffa, original_cost: fc.budgetTotal, original_at: new Date().toISOString(), updated_at: new Date().toISOString(), updated_by: me.id } as never, { onConflict: 'site_id' });
            toast(r.error ? 'Could not save — try again.' : 'Original set'); void qc.invalidateQueries({ queryKey: ['finBook'] });
          }} />
        </View></Card>
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
