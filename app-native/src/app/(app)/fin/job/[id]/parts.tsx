// Costs by plot / repair job for one project (917 renderFinParts): value, cost by type, committed and
// margin for each plot, plus what isn't allocated yet. Tap one to see its costs.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { ThinExportBar } from '@/components/FinFilterBar';
import { bookable, bookCostTo } from '@/components/FinBookCost';
import { BoqTabs, FinRow, FinStat, RepairTabs } from '@/components/FinNav';
import { Cell, FinTable, FootText } from '@/components/FinTable';
import { PhoneTable } from '@/components/PhoneTable';
import { chooseAction, promptText, useToast } from '@/components/toast';
import { Card, Muted } from '@/components/ui';
import { useBook } from '@/data/finBook';
import { loadSubJobs, saveSubValue, subKind, subNoun, subValues } from '@/data/finSubJobs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { billingType, forecast } from '@/lib/rules/finBook';
import { invOutstandingNet, money, num, round2 } from '@/lib/rules/finance';
import { exportTableExcel, exportTablePdf } from '@/lib/tableExport';
import { base, page, space, useDesk } from '@/theme/theme';

type P = { id: string; name: string; detail: string; value: number | null; materials: number; labour: number; plant: number; subcontract: number; other: number; cost: number; committed: number; margin: number | null; invoiced: number; owed: number; left: number };

export default function FinParts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
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
    const t = by[k] || blank(), r = { id: k || 'none', name, detail, value, materials: round2(t.materials), labour: round2(t.labour), plant: round2(t.plant), subcontract: round2(t.subcontract), other: round2(t.other), cost: round2(t.cost), committed: round2(t.committed), margin: null as number | null, invoiced: 0, owed: 0, left: 0 };
    const invs = (data.book.invs as Record<string, any>[]).filter((i) => i.site_id === id && i.status !== 'void' && (i.sub_job_id || '') === k);
    r.invoiced = round2(invs.reduce((n, i) => n + Number(i.net || 0), 0)); r.owed = round2(invs.reduce((n, i) => n + invOutstandingNet(i as never), 0)); r.left = round2(r.invoiced - r.cost);
    r.margin = value != null ? round2(value - r.cost - r.committed) : null; return r;
  };
  const rows = sv.subs.map((a) => mk(a.id, a.label, [a.detail, a.closed ? 'Closed' : a.status].filter(Boolean).join(' · '), sv.values[a.id] ?? null));
  Object.keys(by).filter((k) => k && !sv.subs.some((a) => a.id === k)).forEach((k) => rows.push(mk(k, `Removed ${noun.toLowerCase()}`, '', null)));
  const un = mk('', 'Not allocated — whole project', `Costs and invoices not booked to one ${noun.toLowerCase()} yet`, sv.values[''] ?? null);
  const all = [...rows, un];
  const sum = (k: keyof P) => round2(all.reduce((t, r) => t + (Number(r[k]) || 0), 0));
  const editValues = sv.source === 'manual' && bt !== 'application';
  const valTot = sum('value'), cv = jf?.contract_value != null ? Number(jf.contract_value) : null;
  const open = async (r: P) => {
    const go = () => router.push(`/fin/job/${id}/costs?sub=${r.id}` as never);
    const isSub = r.id !== 'none' && sv.subs.some((a) => a.id === r.id);
    if (!isSub) { go(); return; }
    // Book a cost to it (Andy, 8 Nov 2026): one of the project's costs not booked to a job or plot yet.
    const k = await chooseAction(r.name, [{ key: 'costs', label: 'See Its Costs' }, ...(bookable(fc.lines).length ? [{ key: 'book', label: 'Book A Cost To It' }] : []), { key: 'add', label: '+ Add A Cost To It' }, ...(editValues ? [{ key: 'value', label: r.value != null ? `Change The Value (${money(r.value)})` : 'Set Its Value' }] : [])]);
    if (k === 'costs') go();
    if (k === 'add') router.push(`/fin/job/${id}/costs?sub=${r.id}&add=1` as never);
    if (k === 'book') { const m = await bookCostTo(fc.lines, r.id, r.name); if (m) toast(m); void qc.invalidateQueries({ queryKey: ['finBook'] }); }
    if (k !== 'value') return;
    const t = await promptText(`Value of ${r.name} (£, blank to clear)`, r.value != null ? String(r.value) : ''); if (t == null) return;
    const n = num(t), value = n === null || isNaN(n) ? null : round2(n);
    if (await saveSubValue(me, id, r.id, value)) { toast(value == null ? 'Value cleared' : 'Value saved'); void qc.invalidateQueries({ queryKey: ['finParts'] }); } else toast('Could not save the value');
  };
  const m = (v: number | null) => (v == null ? '—' : v ? money(v) : '–');
  const col = (k: keyof P, l: string, off?: boolean) => ({ k, l, off, min: 72, render: (r: P) => <Cell>{m(r[k] as number | null)}</Cell> });
  const table = () => ({ title: `Costs by ${noun.toLowerCase()}`, site: site?.name || '', sub: site?.name || '', cols: [{ l: noun, w: 170 }, ...['Value', 'Invoiced', 'Owed', 'Materials', 'Labour', 'Plant', 'Subcontract', 'Other', 'Total cost', 'Ordered', 'Margin', 'Invoiced less cost'].map((l) => ({ l, money: true }))], rows: all.map((r) => [r.name, r.value, r.invoiced, r.owed, r.materials, r.labour, r.plant, r.subcontract, r.other, r.cost, r.committed, r.margin, r.left]) });
  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={page(1200)}>
      <Stack.Screen options={{ title: subKind(site) === 'repair' ? 'Costs By Job' : 'Costs By Plot' }} />
      {/* A tab beside Live Jobs, or beside the Bill's Plots (Andy, 8 Nov 2026). */}
      {subKind(site) === 'repair' ? <RepairTabs id={id} on="parts" /> : <BoqTabs id={id} on="parts" />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <FinStat v={money(sum('cost'), 0)} label="Total cost" /><FinStat v={money(round2(rows.reduce((t, r) => t + r.cost, 0)), 0)} label={`Allocated to ${nouns}`} />
        <FinStat v={money(un.cost, 0)} label="Not allocated" tone={un.cost > 0 ? 'amber' : undefined} /><FinStat v={money(sum('committed'), 0)} label="Committed (ordered)" />
      </View>
      {sv.subs.length > 0 && cv != null && valTot > 0 && Math.abs(valTot - cv) >= 1 && <Card style={{ backgroundColor: '#fffaf0' }}><Text style={{ color: base.ink }}>The {nouns} add up to {money(valTot)} but the contract value is {money(cv)}.</Text></Card>}
      {!sv.subs.length && <Card><Text style={{ color: base.ink }}>No {nouns} on this project yet. {subKind(site) === 'repair' ? 'Add repair jobs from the project home.' : 'Add them in the project’s Settings › Multi-Site.'}</Text></Card>}
      {desk ? (
        // Thirteen columns don't fit a laptop, so it opens on the current app's columns (917 finPartsCols) and Invoiced, Owed and
        // Invoiced less cost are a tick away in ⚙ Columns (saved on this device). The name wraps rather than widening the table.
        <FinTable rows={all} keyOf={(r) => r.id} onRow={(r) => void open(r)} colsKey="parts"
          cols={[
            { k: 'n', l: noun, flex: 2.2, min: 180, lock: true, render: (r: P) => <View style={{ alignSelf: 'stretch', width: 0, minWidth: '100%' }}><Text style={{ fontWeight: '600', fontSize: 13, color: '#111827' }}>{r.name}</Text>{!!r.detail && <Text style={{ fontSize: 11.5, color: '#6b7280' }}>{r.detail}</Text>}</View> },
            col('value', 'Value'), col('invoiced', 'Invoiced', true), col('owed', 'Owed', true), col('materials', 'Materials'), col('labour', 'Labour'), col('plant', 'Plant'), col('subcontract', 'Subcontract'), col('other', 'Other'), col('cost', 'Total cost'), col('committed', 'Committed'),
            { k: 'margin', l: 'Margin', min: 84, render: (r: P) => <Text style={{ fontSize: 13, fontWeight: '500', color: r.margin != null && r.margin < 0 ? '#C0392B' : '#111827' }}>{m(r.margin)}</Text> },
            { k: 'left', l: 'Invoiced less cost', off: true, render: (r: P) => <Text style={{ fontSize: 13, fontWeight: '500', color: r.left < 0 ? '#C0392B' : '#111827' }}>{m(r.left)}</Text> },
          ]}
          foot={(left) => { const add = (k: keyof P) => round2(left.reduce((t, r) => t + (Number(r[k]) || 0), 0)); return <><FootText bold>Total cost {money(add('cost'))}</FootText><FootText>Committed {money(add('committed'))}</FootText>{add('value') ? <FootText>Value {money(add('value'))}</FootText> : null}<FootText>Invoiced {money(add('invoiced'))}</FootText></>; }} />
      ) : all.length ? (
        // A phone: a table like the rest of Finance (Andy, 14 Nov 2026): the cost, and the margin with the value under it.
        <PhoneTable key="parts" label={nouns} rows={all} keyOf={(r) => r.id} onRow={(r) => void open(r)}
          cols={[
            { k: 'n', l: noun, lines: 2, main: (r) => r.name, sub: (r) => r.detail || '', sort: (r) => String(r.name || '').toLowerCase() },
            { k: 'c', l: 'Cost', w: 80, right: true, bigFirst: true, main: (r) => money(r.cost), sub: (r) => (r.committed ? `+${money(r.committed, 0)} Ord.` : ''), tone: (r) => (r.id === 'none' && r.cost > 0 ? '#D98A00' : undefined), sort: (r) => Number(r.cost || 0) },
            { k: 'm', l: 'Margin', w: 84, right: true, bold: true, bigFirst: true, main: (r) => m(r.margin), sub: (r) => (r.value != null ? `Value ${money(r.value, 0)}` : ''), tone: (r) => (r.margin != null && r.margin < 0 ? '#C0392B' : undefined), sort: (r) => r.margin },
          ]} />
      ) : null}
      <Muted style={{ marginTop: 10 }}>{`Excl. VAT. Tap a ${noun.toLowerCase()} to see every cost booked to it. Split costs show their share. Sign-in days are shared across the addresses signed into that day. ${sv.source === 'schedule' ? 'Value = the Bill of Quantities for each one.' : subKind(site) === 'repair' ? 'Value = the cost issued on the repair job, unless you type another.' : 'Tap one to type its value.'} Margin = value − cost − committed.`}</Muted>
    </ScrollView>
    <ThinExportBar onExcel={async () => { if (!(await exportTableExcel(table(), org).catch(() => false))) toast('Could not make the file — try again.'); }} onPdf={async () => { if (!(await exportTablePdf(table(), org).catch(() => false))) toast('Could not make the PDF — try again.'); }} />
    </View>
  );
}
