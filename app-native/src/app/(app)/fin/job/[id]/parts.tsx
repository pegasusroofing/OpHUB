// Costs by plot / repair job for one project (917 renderFinParts): value, cost by type, committed and
// margin for each plot, plus what isn't allocated yet. Tap one to see its costs.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { FinRow, FinStat } from '@/components/FinNav';
import { Cell, FinTable, FootText } from '@/components/FinTable';
import { chooseAction, promptText, useToast } from '@/components/toast';
import { Card, Muted } from '@/components/ui';
import { useBook } from '@/data/finBook';
import { loadSubJobs, saveSubValue, subKind, subNoun, subValues } from '@/data/finSubJobs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { billingType, forecast } from '@/lib/rules/finBook';
import { money, num, round2 } from '@/lib/rules/finance';
import { base, page, space, useDesk } from '@/theme/theme';

type P = { id: string; name: string; detail: string; value: number | null; materials: number; labour: number; plant: number; subcontract: number; other: number; cost: number; committed: number; margin: number | null };

export default function FinParts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const desk = useDesk();
  const { data: site } = useSite(id);
  const { data } = useBook(me?.org_id, id);
  const fc = data ? forecast(data.book, id, data.settings) : null;
  const jf = fc?.jf as Record<string, any> | undefined;
  const bt = data ? billingType(jf, data.book.items.filter((i) => i.site_id === id).length, data.book.apps.filter((a) => a.site_id === id).length) : null;
  const { data: sv } = useQuery({ queryKey: ['finParts', id, bt, subKind(site)], enabled: !!site && !!data, queryFn: async () => { const subs = await loadSubJobs(site); return { subs, ...(await subValues(id, subs, bt || '')) }; } });
  if (!data || !fc || !sv || !me) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const noun = subNoun(site), nouns = subNoun(site, true).toLowerCase();
  const blank = () => ({ materials: 0, labour: 0, plant: 0, subcontract: 0, other: 0, committed: 0, cost: 0 });
  const by: Record<string, ReturnType<typeof blank>> = { '': blank() }; sv.subs.forEach((a) => { by[a.id] = blank(); });
  fc.lines.forEach((l) => {
    const k = l.sub || ''; if (!by[k]) by[k] = blank();
    const t = by[k];
    if (l.cat === 'committed') t.committed += l.net;
    else { const c = (['materials', 'labour', 'plant', 'subcontract'].includes(l.cat) ? l.cat : 'other') as 'materials'; t[c] += l.net; t.cost += l.net; }
  });
  const mk = (k: string, name: string, detail: string, value: number | null): P => {
    const t = by[k] || blank(), r = { id: k || 'none', name, detail, value, materials: round2(t.materials), labour: round2(t.labour), plant: round2(t.plant), subcontract: round2(t.subcontract), other: round2(t.other), cost: round2(t.cost), committed: round2(t.committed), margin: null as number | null };
    r.margin = value != null ? round2(value - r.cost - r.committed) : null; return r;
  };
  const rows = sv.subs.map((a) => mk(a.id, a.label, [a.detail, a.closed ? 'Closed' : a.status].filter(Boolean).join(' · '), sv.values[a.id] ?? null));
  Object.keys(by).filter((k) => k && !sv.subs.some((a) => a.id === k)).forEach((k) => rows.push(mk(k, `Removed ${noun.toLowerCase()}`, '', null)));
  const un = mk('', 'Not allocated — whole project', `Costs not booked to one ${noun.toLowerCase()} yet`, sv.values[''] ?? null);
  const all = [...rows, un];
  const sum = (k: keyof P) => round2(all.reduce((t, r) => t + (Number(r[k]) || 0), 0));
  const editValues = sv.source === 'manual' && bt !== 'application';
  const valTot = sum('value'), cv = jf?.contract_value != null ? Number(jf.contract_value) : null;
  const open = async (r: P) => {
    const go = () => router.push(`/fin/job/${id}/costs?sub=${r.id}` as never);
    if (!editValues || r.id === 'none' || !sv.subs.some((a) => a.id === r.id)) { go(); return; }
    const k = await chooseAction(r.name, [{ key: 'costs', label: 'See its costs' }, { key: 'value', label: r.value != null ? `Change the value (${money(r.value)})` : 'Set its value' }]);
    if (k === 'costs') go();
    if (k !== 'value') return;
    const t = await promptText(`Value of ${r.name} (£, blank to clear)`, r.value != null ? String(r.value) : ''); if (t == null) return;
    const n = num(t), value = n === null || isNaN(n) ? null : round2(n);
    if (await saveSubValue(me, id, r.id, value)) { toast(value == null ? 'Value cleared' : 'Value saved'); void qc.invalidateQueries({ queryKey: ['finParts'] }); } else toast('Could not save the value');
  };
  const m = (v: number | null) => (v == null ? '—' : v ? money(v) : '–');
  const col = (k: keyof P, l: string) => ({ k, l, render: (r: P) => <Cell>{m(r[k] as number | null)}</Cell> });
  return (
    <ScrollView contentContainerStyle={page(1200)}>
      <Stack.Screen options={{ title: `Costs by ${subKind(site) === 'repair' ? 'repair job' : 'plot'}` }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <FinStat v={money(sum('cost'), 0)} label="Total cost" /><FinStat v={money(round2(rows.reduce((t, r) => t + r.cost, 0)), 0)} label={`Allocated to ${nouns}`} />
        <FinStat v={money(un.cost, 0)} label="Not allocated" tone={un.cost > 0 ? 'amber' : undefined} /><FinStat v={money(sum('committed'), 0)} label="Committed (ordered)" />
      </View>
      {sv.subs.length > 0 && cv != null && valTot > 0 && Math.abs(valTot - cv) >= 1 && <Card style={{ backgroundColor: '#fffaf0' }}><Text style={{ color: base.ink }}>The {nouns} add up to {money(valTot)} but the contract value is {money(cv)}.</Text></Card>}
      {!sv.subs.length && <Card><Text style={{ color: base.ink }}>No {nouns} on this project yet. {subKind(site) === 'repair' ? 'Add repair jobs from the project home.' : 'Add them in the project’s Settings › Multi-Site.'}</Text></Card>}
      {desk ? (
        <FinTable rows={all} keyOf={(r) => r.id} onRow={(r) => void open(r)}
          cols={[
            { k: 'n', l: noun, flex: 2.2, min: 200, render: (r: P) => <View style={{ alignSelf: 'stretch' }}><Text style={{ fontWeight: '800', fontSize: 13, color: '#111827' }}>{r.name}</Text>{!!r.detail && <Text style={{ fontSize: 11.5, color: '#6b7280' }}>{r.detail}</Text>}</View> },
            col('value', 'Value'), col('materials', 'Materials'), col('labour', 'Labour'), col('plant', 'Plant'), col('subcontract', 'Subcontract'), col('other', 'Other'), col('cost', 'Total cost'), col('committed', 'Committed'),
            { k: 'margin', l: 'Margin', render: (r: P) => <Text style={{ fontSize: 13, fontWeight: '700', color: r.margin != null && r.margin < 0 ? '#C0392B' : '#111827' }}>{m(r.margin)}</Text> },
          ]}
          foot={(left) => { const add = (k: keyof P) => round2(left.reduce((t, r) => t + (Number(r[k]) || 0), 0)); return <><FootText bold>Total cost {money(add('cost'))}</FootText><FootText>Committed {money(add('committed'))}</FootText>{add('value') ? <FootText>Value {money(add('value'))}</FootText> : null}</>; }} />
      ) : all.map((r) => <FinRow key={r.id} title={r.name} sub={[r.detail, `cost ${money(r.cost)}`, r.committed ? `committed ${money(r.committed)}` : '', r.value != null ? `value ${money(r.value)}` : '', r.margin != null ? `margin ${money(r.margin)}` : ''].filter(Boolean).join(' · ')} right={money(r.cost)} tone={r.id === 'none' && r.cost > 0 ? '#D98A00' : undefined} onPress={() => void open(r)} />)}
      <Muted style={{ marginTop: 10 }}>{`Excl. VAT. Tap a ${noun.toLowerCase()} to see every cost booked to it. Split costs show their share. Sign-in days are shared across the addresses signed into that day. ${sv.source === 'schedule' ? 'Value = the Bill of Quantities for each one.' : subKind(site) === 'repair' ? 'Value = the cost issued on the repair job, unless you type another.' : 'Tap one to type its value.'} Margin = value − cost − committed.`}</Muted>
    </ScrollView>
  );
}
