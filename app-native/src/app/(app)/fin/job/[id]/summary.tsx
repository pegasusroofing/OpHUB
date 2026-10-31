// Detailed Summary for one project (9219v renderFinDetail): Cost Summary,
// Purchases, Labour & Subcontractors, Applications & Invoices, Plant — every
// figure from the same cost lines, excl. VAT, optionally limited to dates.
// Excel download has one sheet per tab.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { FinChip, FinRow } from '@/components/FinNav';
import { appStage, type App } from '@/components/FinSales';
import { useFinRowMenu } from '@/components/FinRowMenu';
import { useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { DateBox } from '@/components/DateField';
import { useBook } from '@/data/finBook';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { forecast, poInvoiced, type CostLine } from '@/lib/rules/finBook';
import { fdate, invOutstandingNet, money, retentionStillHeld, round2 } from '@/lib/rules/finance';
import { exportTableExcel, type Table } from '@/lib/tableExport';
import { base, page, radius, space } from '@/theme/theme';

type Row = Record<string, any>;
const TABS: [string, string][] = [['summary', 'Cost Summary'], ['purchases', 'Purchases'], ['labour', 'Labour & Subcontractors'], ['sales', 'Applications & Invoices'], ['plant', 'Plant']];
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 8, color: base.ink, backgroundColor: base.card };

export default function FinDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const { data: site } = useSite(id);
  const { data } = useBook(me?.org_id, id);
  const rowMenu = useFinRowMenu(data?.book.invs);
  const [tab, setTab] = useState('summary');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  if (!data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const s = site as Row | undefined;
  const inD = (d: unknown) => { const x = String(d || '').slice(0, 10); if (from && (!x || x < from)) return false; if (to && (!x || x > to)) return false; return true; };
  const fc = forecast(data.book, id, data.settings);
  const L = fc.lines.filter((l) => inD(l.date)), cost = L.filter((l) => l.cat !== 'committed'), committed = L.filter((l) => l.cat === 'committed');
  const byCat = (k: string) => round2(cost.filter((l) => l.cat === k).reduce((t, l) => t + l.net, 0));
  const totalCost = round2(cost.reduce((t, l) => t + l.net, 0)), committedTot = round2(committed.reduce((t, l) => t + l.net, 0));
  const apps = data.book.apps.filter((a) => a.site_id === id && a.status !== 'void') as Row[];
  const appsTo = apps.filter((a) => a.status !== 'draft' && (!to || String(a.valuation_date || '') <= to)).sort((x, y) => x.number - y.number);
  const last = appsTo[appsTo.length - 1], lastCert = appsTo.filter((a) => a.cert_gross != null).pop();
  const invsAll = data.book.invs.filter((i) => i.site_id === id);
  const invs = invsAll.filter((i) => i.status !== 'void' && i.status !== 'draft' && inD(i.issue_date));
  const invoiced = round2(invs.reduce((t, i) => t + Number(i.net || 0), 0)), outstanding = round2(invs.reduce((t, i) => t + invOutstandingNet(i), 0));
  const received = round2(invs.reduce((t, i) => { const tt = Number(i.total || 0); return t + (tt ? (Number(i.paid || 0) * Number(i.net || 0)) / tt : 0); }, 0));
  const salesValue = fc.isInvoiceJob ? invoiced : last ? (last.cert_gross != null ? Number(last.cert_gross) - Number(last.cert_discount != null ? last.cert_discount : last.discount || 0) : Number(last.gross || 0) - Number(last.discount || 0)) : 0;
  const profit = round2(salesValue - totalCost), ohp = round2((salesValue * (fc.ohpPct || 0)) / 100);
  const tone = (n: number) => (n < 0 ? '#C0392B' : n > 0 ? '#1E7A3C' : undefined);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean), hit = (l: Row) => words.every((w) => JSON.stringify([l.desc, l.who, l.ref, l.status]).toLowerCase().includes(w));
  const lines = (list: CostLine[], empty: string) => {
    const shown = list.filter(hit).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return shown.length ? (
      <View>
        {shown.map((l) => <FinRow key={l.key} title={l.desc} sub={[l.date ? fdate(l.date) : '', l.cat === 'committed' ? 'Ordered' : l.cat, l.who, l.ref, l.status].filter(Boolean).join(' · ')} right={money(l.net)} onPress={l.go ? () => router.push(l.go as never) : undefined} />)}
        <Muted>{shown.length} line{shown.length === 1 ? '' : 's'} · total {money(shown.reduce((t, l) => t + l.net, 0))}</Muted>
      </View>
    ) : <Empty>{empty}</Empty>;
  };
  const kv = (l: string, v: number, o: { minus?: boolean; t?: string } = {}) => <FinRow key={l} title={l} right={`${o.minus ? '−' : ''}${money(v)}`} tone={o.t} />;
  const lineTable = (title: string, list: CostLine[]): Table => ({ title, cols: [{ l: 'Date' }, { l: 'Description', w: 220 }, { l: 'Type' }, { l: 'Who' }, { l: 'Ref' }, { l: 'Status' }, { l: 'Net £', money: true }], rows: list.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).map((l) => [l.date ? fdate(l.date) : '', l.desc, l.cat === 'committed' ? 'Ordered' : l.cat, l.who || '', l.ref || '', l.status || '', round2(l.net)]), totals: ['Total', '', '', '', '', '', round2(list.reduce((t, l) => t + l.net, 0))] });
  const exportAll = async () => {
    const sum: [string, number][] = [['Applied to date (gross)', last ? Number(last.gross || 0) : 0], ['Certified to date (gross)', lastCert ? Number(lastCert.cert_gross) : 0], ['Invoiced', invoiced], ['Received', received], ['Outstanding', outstanding], ['Sales value', salesValue], ['Purchases (materials)', byCat('materials')], ['Plant', byCat('plant')], ['Labour', byCat('labour')], ['Subcontractors', byCat('subcontract')], ['Prelims & site costs', byCat('overheads')], ['Other', byCat('other')], ['Total cost', totalCost], ['Profit before overheads', profit], ...(fc.ohpPct ? [[`Company overheads (OHP) ${fc.ohpPct}%`, -ohp], ['Profit after overheads', round2(profit - ohp)]] as [string, number][] : []), ['Ordered, not invoiced yet', committedTot]];
    const period = from || to ? `${from ? fdate(from) : 'start'} to ${to ? fdate(to) : 'today'}` : 'whole job';
    const first: Table = { title: 'Cost Summary', site: s?.name, sub: `${s?.job_number || ''} ${s?.name || ''} · ${period} · excl. VAT`, cols: [{ l: '', w: 220 }, { l: '£', money: true }], rows: sum };
    const ok = await exportTableExcel(first, org, [
      lineTable('Purchases', cost.filter((l) => ['materials', 'overheads', 'other'].includes(l.cat))), lineTable('Labour', cost.filter((l) => l.cat === 'labour')), lineTable('Subcontractors', cost.filter((l) => l.cat === 'subcontract')), lineTable('Plant', cost.filter((l) => l.cat === 'plant')), lineTable('Ordered not invoiced', committed),
      { title: 'Applications', cols: [{ l: 'No.', num: true }, { l: 'Valuation date' }, { l: 'Status' }, { l: 'Applied gross', money: true }, { l: 'Certified gross', money: true }], rows: apps.filter((a) => inD(a.valuation_date)).sort((x, y) => x.number - y.number).map((a) => [a.number, fdate(a.valuation_date), a.status, Number(a.gross || 0), a.cert_gross != null ? Number(a.cert_gross) : null]) },
      { title: 'Sales invoices', cols: [{ l: 'Number' }, { l: 'Date' }, { l: 'Status' }, { l: 'Net', money: true }, { l: 'Total', money: true }, { l: 'Paid', money: true }], rows: invsAll.filter((i) => inD(i.issue_date)).map((i) => [i.number || 'Draft', i.issue_date ? fdate(i.issue_date) : '', i.status, Number(i.net || 0), Number(i.total || 0), Number(i.paid || 0)]) },
    ]).catch(() => false);
    if (!ok) toast('Could not make the file — try again.');
  };
  let body;
  if (tab === 'summary') body = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 280 }}>
        <SectionTitle>Sales</SectionTitle>
        {kv('Applied to date (gross)', last ? Number(last.gross || 0) : 0)}{kv('Application discount', last ? Number(last.discount || 0) : 0, { minus: true })}
        {kv('Applied net of discount', last ? round2(Number(last.gross || 0) - Number(last.discount || 0)) : 0)}{kv('Certified to date (gross)', lastCert ? Number(lastCert.cert_gross) : 0)}
        {kv('Invoiced', invoiced)}{kv('Received', received)}{kv('Outstanding', outstanding)}{kv('Retention held by client', retentionStillHeld(appsTo as never, fc.jf, data.book.invs.filter((i) => i.site_id === id)))}
        {kv('Sales value', salesValue)}
        <Muted>{fc.isInvoiceJob ? 'Sales value = invoiced.' : 'Sales value = latest certified (or applied) to date, less discount.'} All excl. VAT.</Muted>
      </View>
      <View style={{ flex: 1, minWidth: 280 }}>
        <SectionTitle>Cost</SectionTitle>
        {kv('Purchases (materials)', byCat('materials'))}{kv('Plant', byCat('plant'))}{kv('Labour', byCat('labour'))}{kv('Subcontractors', byCat('subcontract'))}{kv('Prelims & site costs', byCat('overheads'))}{kv('Other', byCat('other'))}
        {kv('Total cost', totalCost)}{kv('Profit before overheads', profit, { t: tone(profit) })}
        {fc.ohpPct ? kv(`Company overheads (OHP) ${fc.ohpPct}%`, ohp, { minus: true }) : null}
        {fc.ohpPct ? kv('Profit after overheads', round2(profit - ohp), { t: tone(profit - ohp) }) : null}
        <FinRow title={`% profit${fc.ohpPct ? ' (after overheads)' : ''}`} right={salesValue ? `${Math.round(((profit - ohp) / salesValue) * 1000) / 10}%` : '—'} tone={tone(profit - ohp)} />
        {kv('Ordered, not invoiced yet', committedTot)}
        <Muted>Ordered (open POs and subcontract orders) isn&apos;t in total cost until it&apos;s invoiced or certified.</Muted>
      </View>
    </View>
  );
  else if (tab === 'labour') body = <><SectionTitle>Labour</SectionTitle>{lines(cost.filter((l) => l.cat === 'labour'), 'No labour costs.')}<SectionTitle>Subcontractors</SectionTitle>{lines(cost.filter((l) => l.cat === 'subcontract').concat(committed.filter((l) => l.ccat === 'subcontract')), 'No subcontractor costs.')}</>;
  else if (tab === 'plant') body = <><SectionTitle>Plant</SectionTitle>{lines(cost.filter((l) => l.cat === 'plant').concat(committed.filter((l) => l.ccat === 'plant')), 'No plant costs.')}</>;
  else if (tab === 'sales') body = (
    <>
      <SectionTitle>Applications &amp; Certificates</SectionTitle>
      {apps.filter((a) => inD(a.valuation_date)).sort((x, y) => y.number - x.number).map((a) => <FinRow key={a.id} left={`App ${a.number}`} title={fdate(a.valuation_date)} sub={`applied ${money(a.gross)}${a.cert_gross != null ? ` · certified ${money(a.cert_gross)}` : ''}`} right={money(a.cert_net ?? a.net_due)} onMenu={() => void rowMenu.appMenu(a, appStage(a as App).k)} onPress={() => router.push(`/fin/job/${id}/application/${a.id}` as never)} />)}
      <SectionTitle>Sales invoices</SectionTitle>
      {rowMenu.form}
      {invsAll.filter((i) => inD(i.issue_date)).map((i) => <FinRow key={i.id} left={i.number || 'Draft'} title={fdate(i.issue_date)} sub={i.status} right={money(i.total)} onMenu={() => void rowMenu.invMenu(i)} onPress={() => router.push(`/fin/job/${id}/invoice/${i.id}` as never)} />)}
    </>
  );
  else {
    const pos = data.book.pos.filter((p) => p.site_id === id && inD(String(p.created_at || '').slice(0, 10)));
    body = (
      <>
        <SectionTitle>Purchase invoices &amp; other costs</SectionTitle>{lines(cost.filter((l) => ['materials', 'overheads', 'other'].includes(l.cat)), 'No purchase invoices.')}
        <SectionTitle>Purchase orders</SectionTitle>
        {pos.length ? pos.map((p) => { const inv = poInvoiced(p, data.book.pinvs), v = p.value != null ? Number(p.value) : null; return <FinRow key={p.id} left={p.number} title={p.supplier_name || '—'} sub={`invoiced ${money(inv)}${v != null ? ` · left ${money(Math.max(0, v - inv))}` : ''} · ${p.status}`} right={v != null ? money(v) : '—'} onPress={() => router.push(`/fin/po/${p.id}` as never)} />; }) : <Empty>No purchase orders.</Empty>}
      </>
    );
  }
  return (
    <ScrollView contentContainerStyle={page(1100)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Detailed Summary' }} />
      <Card>
        <Text style={{ fontWeight: '800', color: base.ink }}>{s?.job_number || '—'} · {s?.name} · {s?.client_name || 'No client'}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Muted>Only items dated</Muted>
          <DateBox value={from} onChange={setFrom} placeholder="From" title="From" style={{ width: 170 }} />
          <DateBox value={to} onChange={setTo} placeholder="To" title="To" style={{ width: 170 }} />
        </View>
        <Muted style={{ marginTop: 4 }}>{from || to ? `Showing ${from ? `from ${fdate(from)}` : ''}${to ? ` to ${fdate(to)}` : ''} — every tab and total only counts items in these dates.` : 'Showing the whole job. Pick dates to see one period (e.g. a month).'}</Muted>
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>{TABS.map(([k, l]) => <FinChip key={k} on={tab === k} label={l} onPress={() => { setTab(k); setQ(''); }} />)}</View>
      {tab !== 'summary' && <TextInput value={q} onChangeText={setQ} placeholder="Search this tab — supplier, PO, invoice no., description…" style={[box, { marginBottom: 10 }]} />}
      <Card>{body}</Card>
      <Button kind="ghost" title="📊 Excel (every tab)" onPress={exportAll} />
    </ScrollView>
  );
}
