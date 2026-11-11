// Quote tracker (Andy, 11 Nov 2026). Tiles at the top (tap one to open what it counts); tabs Live · Quoted · All, where a
// quote leaves Live once it's returned (the figures put in and sent); in Quoted, the outcome (No News, Negotiating, Won,
// Lost) narrows it down. Then + New Enquiry, the search, and Filter / Sort as drop-downs; the quotes as table rows
// (a laptop gets the Finance table); and the thin export footer: Export ▾ bottom left (what to export, then Excel or PDF),
// Settings bottom right. Who priced a quote isn't shown in the table. PMs and admins only.
// Phone table (Andy, 11 Nov 2026, evening): Live = Project (client below) · Due Back (a red border once it's past) · Status;
// Quoted = Project · Value · Chase (short date, no year) · Status; All = Project · Date · Status. Dates and values centred
// under their headings, Status at the right. The View drop-down went: the filter narrows the list, the summaries are in Export.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FinFilterBar, ThinExportBar, type FilterSel } from '@/components/FinFilterBar';
import { FinTabs } from '@/components/FinNav';
import { Cell, FinTable } from '@/components/FinTable';
import { pickExport } from '@/components/FootBar';
import { useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { useQuotes, type Quote } from '@/data/quotes';
import { useAuth } from '@/lib/auth';
import { localISODate } from '@/lib/rules/driver';
import { quoteReport, REPORTS, type ReportKey } from '@/lib/rules/quoteReports';
import { chaseStatus, clientNames, groupQuotes, isQuoted, outcomeOf, OUTCOMES, statusWord, WORK_STATUS, type Outcome } from '@/lib/rules/quotes';
import { exportTableExcel, exportTablePdf, type Table } from '@/lib/tableExport';
import { base, page, useDesk } from '@/theme/theme';

const money = (n: number | null | undefined) => (n ? `£${Math.round(n).toLocaleString('en-GB')}` : '—');
const ukd = (d: string | null | undefined) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—');
const pct = (p: number | null | undefined) => (p == null ? '—' : `${Math.round(p * 1000) / 10}%`);
// Short: "14 Nov", no year (the Chase column).
const dm = (d: string | null | undefined) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—');
// Thousands as k on a phone (£48k), so Value fits a narrow column.
const kMoney = (n: number | null | undefined) => (!n ? '—' : n >= 1000000 ? `£${(Math.round(n / 100000) / 10).toLocaleString('en-GB')}m` : n >= 1000 ? `£${Math.round(n / 1000).toLocaleString('en-GB')}k` : `£${Math.round(n)}`);
const RED = '#C8102E';
type Tab = 'live' | 'quoted' | 'all';
const yearOf = (x: Quote) => (x.completed_at || x.returned_at || x.return_date || '').slice(0, 4);
const thisYear = String(new Date().getFullYear());
const returnedOn = (x: Quote) => x.returned_at || x.return_date;

export default function Quotes() {
  const { me, org } = useAuth();
  const toast = useToast();
  const desk = useDesk();
  const params = useLocalSearchParams<{ tab?: string; out?: string }>();
  const { data, isLoading } = useQuotes(me?.org_id);
  const [tab, setTab] = useState<Tab>((['live', 'quoted', 'all'].includes(String(params.tab)) ? params.tab : 'live') as Tab);
  const [out, setOut] = useState<'any' | Outcome>((params.out as Outcome) || 'any');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<FilterSel>({ client: [], disc: [], by: [], year: [], st: [] });
  const [sort, setSort] = useState('date');
  const [shown, setShown] = useState(100);
  const today = localISODate(new Date());
  const all = useMemo(() => data ?? [], [data]);
  const inTab = (x: Quote) => (tab === 'all' ? true : tab === 'live' ? !isQuoted(x) : isQuoted(x) && (out === 'any' || outcomeOf(x.status) === out));
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const has = (k: string, v: string | null) => !sel[k]?.length || sel[k].includes(v ?? '');
    const dateOf = (x: Quote) => (tab === 'live' ? x.return_date : returnedOn(x)) || '';
    const SORT: Record<string, (a: Quote, b: Quote) => number> = {
      date: (a, b) => dateOf(b).localeCompare(dateOf(a)), old: (a, b) => (dateOf(a) || '9').localeCompare(dateOf(b) || '9'),
      due: (a, b) => (a.return_date || '9').localeCompare(b.return_date || '9'),
      value: (a, b) => (b.value || 0) - (a.value || 0), client: (a, b) => a.client_name.localeCompare(b.client_name),
    };
    return all.filter(inTab).filter((x) => (!sel.client?.length || clientNames(x).some((n) => sel.client.includes(n))) && has('disc', x.discipline) && has('by', x.priced_by_name) && has('year', yearOf(x)) && has('st', x.status)
      && (!s || `${clientNames(x).join(' ')} ${x.title} ${x.address ?? ''} ${x.postcode ?? ''} ${x.discipline ?? ''} ${x.notes ?? ''}`.toLowerCase().includes(s))).sort(SORT[sort] || SORT.date);
  }, [all, tab, out, q, sel, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return null;
  if (me.role !== 'pm' && me.role !== 'admin') return <Muted style={{ padding: 16 }}>Project managers and admins only.</Muted>;

  const live = all.filter((x) => !isQuoted(x)), quoted = all.filter((x) => isQuoted(x));
  const yr = quoted.filter((x) => yearOf(x) === thisYear);
  const yrG = groupQuotes(yr.map((x) => ({ ...x, client_name: 'all' })), 'client_name')[0];
  const pool = all.filter(inTab);
  const distinct = (f: (x: Quote) => string | null) => [...new Set(pool.map(f).filter(Boolean) as string[])].sort();
  const go = (x: Quote) => router.push(`/pm/quotes/${x.id}` as never);
  const openTab = (t: Tab, o: 'any' | Outcome = 'any') => { setTab(t); setOut(o); setShown(100); };
  const tabName = tab === 'live' ? 'Live' : tab === 'quoted' ? 'Quoted' : 'All';

  // Export ▾: this view as it's shown, or any of the reports.
  const doExport = async () => {
    const thisView = `This View (${tabName}${tab === 'quoted' && out !== 'any' ? ` · ${OUTCOMES.find(([k]) => k === out)?.[1]}` : ''}, ${list.length})`;
    const pick = await pickExport<'view' | ReportKey>([{ key: 'view', label: thisView }, ...REPORTS.map(([key, label]) => ({ key, label }))]);
    if (!pick) return;
    const t = (pick.key === 'view' ? quoteReport(tab === 'live' ? 'live' : tab === 'quoted' ? 'quoted' : 'all', list, today) : quoteReport(pick.key, all, today)) as Table;
    const ok = pick.as === 'xlsx' ? await exportTableExcel(t, org) : await exportTablePdf(t, org);
    if (!ok) toast('Could not make the file. Try again.');
  };

  // Small tiles, each opening what it counts (Andy, 11 Nov 2026).
  const tile = (v: string, label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${v}`} onPress={onPress}
      style={{ flexGrow: 1, flexBasis: desk ? 160 : '45%', backgroundColor: base.card, borderRadius: 10, borderWidth: 1, borderColor: base.cardLine, paddingVertical: 10, paddingHorizontal: 12 }}>
      <Text numberOfLines={1} style={{ fontSize: 18, fontWeight: '700', color: base.ink }}>{v}</Text>
      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '500', color: base.slate }}>{label}</Text>
    </Pressable>
  );

  // The quotes as table rows (phone): a header row, then a row per quote. Dates, values and chase centred under their
  // headings; Status at the right (Andy, 11 Nov 2026).
  const W = { d: 74, v: 52, c: 50, s: 80 };
  const head = (l: string, w?: number, align: 'left' | 'center' | 'right' = 'left') => <Text numberOfLines={1} style={{ ...(w ? { width: w } : { flex: 1 }), textAlign: align, fontSize: 10.5, fontWeight: '700', color: base.slate, letterSpacing: 0.3 }}>{l.toUpperCase()}</Text>;
  const mid = (t: string, w: number, opts: { sub?: string; late?: boolean; bold?: boolean } = {}) => (
    <View style={{ width: w, alignItems: 'center' }}>
      <View accessibilityLabel={opts.late ? `${t}, overdue` : undefined} style={opts.late ? { borderWidth: 1.5, borderColor: RED, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 } : null}>
        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: opts.bold === false ? '500' : '600', color: base.ink, textAlign: 'center' }}>{t}</Text>
      </View>
      {!!opts.sub && <Text numberOfLines={1} style={{ fontSize: 10.5, color: base.slate, textAlign: 'center' }}>{opts.sub}</Text>}
    </View>
  );
  // Past its Due Back date and not returned yet: a red border round the date.
  const late = (x: Quote) => !isQuoted(x) && !!x.return_date && x.return_date.slice(0, 10) < today;
  const who = (x: Quote) => x.client_name + (x.others?.length ? ` +${x.others.length}` : '');
  const phoneTable = (
    <View accessibilityLabel="Quotes table" style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: '#F6F7F9' }}>
        {head('Project')}
        {tab === 'live' ? head('Due Back', W.d, 'center') : tab === 'quoted' ? <>{head('Value', W.v, 'center')}{head('Chase', W.c, 'center')}</> : head('Date', W.d, 'center')}
        {head('Status', W.s, 'right')}
      </View>
      {list.slice(0, shown).map((x) => (
        <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={x.title} onPress={() => go(x)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: base.ink }}>{x.title}</Text>
            <Text numberOfLines={1} style={{ fontSize: 11, color: base.slate, marginTop: 1 }}>
              {tab === 'quoted' ? [who(x), x.profit_pct != null ? `${pct(x.profit_pct)} mark-up` : ''].filter(Boolean).join(' · ') : who(x)}
            </Text>
          </View>
          {tab === 'live' ? mid(ukd(x.return_date), W.d, { late: late(x) })
            : tab === 'quoted' ? <>{mid(kMoney(x.value), W.v)}{x.chase_on ? mid(x.next_chase_date ? dm(x.next_chase_date) : 'On', W.c, { sub: chaseStatus(x, today).startsWith('Due') ? 'Due' : '', bold: false }) : mid('Off', W.c, { bold: false })}</>
              : mid(ukd(isQuoted(x) ? returnedOn(x) : x.return_date), W.d, { sub: isQuoted(x) ? 'Returned' : 'Due Back', late: late(x) })}
          <Text numberOfLines={2} style={{ width: W.s, textAlign: 'right', fontSize: 11.5, fontWeight: '600', color: x.status === 'won' ? base.ink : base.slate }}>{statusWord(x)}</Text>
        </Pressable>
      ))}
    </View>
  );
  // A laptop: the Finance table, columns to suit the tab.
  const deskCols = [
    { k: 'p', l: 'Project', flex: 2, min: 200, render: (x: Quote) => <View style={{ alignItems: 'center' }}><Cell bold>{x.title}</Cell>{x.address ? <Text numberOfLines={1} style={{ fontSize: 11, color: base.slate }}>{x.address}</Text> : null}</View>, sort: (x: Quote) => x.title },
    { k: 'c', l: 'Customer', flex: 1.5, min: 140, render: (x: Quote) => <View style={{ alignItems: 'center' }}><Cell>{x.client_name}</Cell>{x.others?.length ? <Text numberOfLines={1} style={{ fontSize: 11, color: base.slate }}>also {x.others.map((o) => o.client_name).join(', ')}</Text> : null}</View>, sort: (x: Quote) => x.client_name },
    ...(tab === 'live' ? [
      { k: 'di', l: 'Discipline', choices: distinct((x) => x.discipline), render: (x: Quote) => <Cell>{x.discipline || '—'}</Cell>, sort: (x: Quote) => x.discipline || '' },
      { k: 'rc', l: 'Received', render: (x: Quote) => <Cell>{ukd(x.received_date)}</Cell>, sort: (x: Quote) => x.received_date || '' },
      { k: 'd', l: 'Due Back', render: (x: Quote) => <View style={late(x) ? { borderWidth: 1.5, borderColor: RED, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 } : null}><Cell>{ukd(x.return_date)}</Cell></View>, sort: (x: Quote) => x.return_date || '' },
    ] : tab === 'quoted' ? [
      { k: 'v', l: 'Tender Value', render: (x: Quote) => <Cell bold>{money(x.value)}</Cell>, sort: (x: Quote) => x.value || 0 },
      { k: 'm', l: 'Mark-Up', render: (x: Quote) => <Cell>{pct(x.profit_pct)}</Cell>, sort: (x: Quote) => x.profit_pct ?? -1 },
      { k: 'd', l: 'Returned', render: (x: Quote) => <Cell>{ukd(returnedOn(x))}</Cell>, sort: (x: Quote) => returnedOn(x) || '' },
      { k: 'cd', l: 'Chase Date', render: (x: Quote) => <Cell>{x.chase_on && x.next_chase_date ? ukd(x.next_chase_date) : '—'}</Cell>, sort: (x: Quote) => (x.chase_on && x.next_chase_date) || '' },
      { k: 'cs', l: 'Chase Status', noSort: true, render: (x: Quote) => <Cell>{chaseStatus(x, today)}</Cell> },
    ] : [
      { k: 'v', l: 'Value', render: (x: Quote) => <Cell bold>{money(x.value)}</Cell>, sort: (x: Quote) => x.value || 0 },
      { k: 'd', l: 'Date', render: (x: Quote) => <View style={{ alignItems: 'center' }}><Cell>{ukd(isQuoted(x) ? returnedOn(x) : x.return_date)}</Cell><Text style={{ fontSize: 10.5, color: base.slate }}>{isQuoted(x) ? 'Returned' : 'Due Back'}</Text></View>, sort: (x: Quote) => (isQuoted(x) ? returnedOn(x) : x.return_date) || '' },
    ]),
    { k: 's', l: 'Status', noSort: true, render: (x: Quote) => <Cell bold={x.status === 'won'}>{statusWord(x)}</Cell> },
  ];

  const counts = (o: Outcome) => quoted.filter((x) => outcomeOf(x.status) === o).length;
  const total = list.reduce((t, x) => t + (x.value || 0), 0);
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[page(1200), { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Quotes' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {tile(`${live.length}`, 'Live Quotes', () => openTab('live'))}
        {tile(money(quoted.reduce((t, x) => t + (x.value || 0), 0)), `Quoted Projects · ${quoted.length}`, () => openTab('quoted'))}
        {tile(money(yrG?.wonValue), `Won ${thisYear} · ${yrG?.won ?? 0} Quote${(yrG?.won ?? 0) === 1 ? '' : 's'}`, () => openTab('quoted', 'won'))}
        {tile(yrG?.rate == null ? '–' : `${yrG.rate}%`, `Win Rate ${thisYear}`, () => { openTab('quoted'); setSel({ client: [], disc: [], by: [], year: [thisYear], st: [] }); })}
      </View>
      <FinTabs even items={[['live', 'Live', live.length], ['quoted', 'Quoted', quoted.length], ['all', 'All', all.length]]} value={tab} onChange={(k) => openTab(k as Tab)} />
      {tab === 'quoted' && (
        <View style={{ flexDirection: 'row', backgroundColor: '#EEF0F2', borderRadius: 10, padding: 3, gap: 2, marginBottom: 10 }}>
          {([['any', 'All', quoted.length], ...OUTCOMES.map(([k, l]) => [k, l, counts(k)])] as [string, string, number][]).map(([k, l, n]) => (
            <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: out === k }} accessibilityLabel={`${l} ${n}`} onPress={() => { setOut(k as 'any' | Outcome); setShown(100); }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8, backgroundColor: out === k ? base.card : 'transparent' }}>
              <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: out === k ? '700' : '500', color: out === k ? base.ink : base.slate }}>{l}</Text>
              <Text style={{ fontSize: 10.5, color: base.slate }}>{n}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={{ marginBottom: 10 }}><Button title="+ New Enquiry" onPress={() => router.push('/pm/quotes/new' as never)} /></View>
      <FinFilterBar search={{ value: q, onChange: (t) => { setQ(t); setShown(100); }, placeholder: 'Search Customer, Project, Address…' }} sel={sel} onChange={setSel} onClear={() => setSel({ client: [], disc: [], by: [], year: [], st: [] })}
        sorts={[['date', 'Newest First'], ['old', 'Oldest First'], ...(tab === 'live' ? [['due', 'Due Back Soonest'] as [string, string]] : []), ['value', 'Highest Value'], ['client', 'Customer A To Z']]} sort={sort} onSort={setSort}
        parts={[
          ...(tab === 'live' ? [{ key: 'st', label: 'Status', items: WORK_STATUS.map(([v, l]) => ({ v, l, n: live.filter((x) => x.status === v).length })) }] : []),
          { key: 'client', label: 'Customer', items: [...new Set(pool.flatMap(clientNames))].sort().map((v) => ({ v, l: v })) },
          { key: 'disc', label: 'Discipline', items: distinct((x) => x.discipline).map((v) => ({ v, l: v })) },
          { key: 'by', label: 'Priced By', items: distinct((x) => x.priced_by_name).map((v) => ({ v, l: v })) },
          { key: 'year', label: 'Year', items: distinct(yearOf).reverse().map((v) => ({ v, l: v })) },
        ]} />
      {isLoading ? <Muted>Loading…</Muted> : list.length ? (desk ? (
        <FinTable rows={list} keyOf={(x) => x.id} onRow={go} defaultSort={{ k: 'd', dir: tab === 'live' ? 'asc' : 'desc' }} cols={deskCols} />
      ) : (
        <>
          {phoneTable}
          {list.length > shown && <View style={{ marginTop: 10 }}><Button kind="ghost" title={`Show More (${list.length - shown} Left)`} onPress={() => setShown(shown + 100)} /></View>}
        </>
      )) : <Empty>{all.length ? 'No quotes match.' : 'No quotes yet. Press + New Enquiry to add one.'}</Empty>}
      <View style={{ flexGrow: 1 }} />
      {/* The normal export footer (Andy, 11 Nov 2026): Export bottom left, Settings bottom right. */}
      <View style={{ marginTop: 10, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: base.cardLine }}>
        <ThinExportBar excelLabel="⬇ Export ▾" excelA11y="Export" onExcel={() => void doExport()}
          pdfLabel="⚙ Settings" pdfA11y="Quote Settings" onPdf={me.role === 'admin' ? () => router.push('/pm/quotes/settings' as never) : undefined} />
      </View>
    </ScrollView>
  );
}
