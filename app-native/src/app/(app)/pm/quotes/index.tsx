// Quote tracker (Andy, 11 Nov 2026). Tiles at the top (tap one to open what it counts); tabs Live · Quoted · All, where a
// quote leaves Live once it's returned (the figures put in and sent); in Quoted, the outcome (No News, Negotiating, Won,
// Lost) narrows it down. Then + New Enquiry, the search, and View / Filter / Sort as drop-downs; the quotes as table rows
// (a laptop gets the Finance table); and the footer bar: how many, Settings in the middle, Export ▾ (what to export, then
// Excel or PDF). Who priced a quote isn't shown in the table. PMs and admins only.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FinFilterBar, type FilterSel } from '@/components/FinFilterBar';
import { FinTabs } from '@/components/FinNav';
import { Cell, FinTable } from '@/components/FinTable';
import { FootBar, FootButton, pickExport } from '@/components/FootBar';
import { useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { useQuotes, type Quote } from '@/data/quotes';
import { useAuth } from '@/lib/auth';
import { localISODate } from '@/lib/rules/driver';
import { quoteReport, REPORTS, type ReportKey } from '@/lib/rules/quoteReports';
import { chaseStatus, clientNames, groupQuotes, isQuoted, outcomeOf, OUTCOMES, perClient, statusWord, WORK_STATUS, type Group, type GroupBy, type Outcome } from '@/lib/rules/quotes';
import { exportTableExcel, exportTablePdf, type Table } from '@/lib/tableExport';
import { base, page, useDesk } from '@/theme/theme';

const money = (n: number | null | undefined) => (n ? `£${Math.round(n).toLocaleString('en-GB')}` : '—');
const ukd = (d: string | null | undefined) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—');
const pct = (p: number | null | undefined) => (p == null ? '—' : `${Math.round(p * 1000) / 10}%`);
type Tab = 'live' | 'quoted' | 'all';
const VIEWS: [('list' | GroupBy), string][] = [['list', 'View: List'], ['client_name', 'By Customer'], ['discipline', 'By Discipline'], ['priced_by_name', 'By Who Priced It'], ['year', 'By Year'], ['status', 'By Outcome']];
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
  const [view, setView] = useState<'list' | GroupBy>('list');
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
  const groups: Group[] = view === 'list' ? [] : groupQuotes(view === 'client_name' ? perClient(list) : list, view);
  const pool = all.filter(inTab);
  const distinct = (f: (x: Quote) => string | null) => [...new Set(pool.map(f).filter(Boolean) as string[])].sort();
  const go = (x: Quote) => router.push(`/pm/quotes/${x.id}` as never);
  const openTab = (t: Tab, o: 'any' | Outcome = 'any') => { setTab(t); setOut(o); setShown(100); setView('list'); };
  const tabName = tab === 'live' ? 'Live' : tab === 'quoted' ? 'Quoted' : 'All';

  // Export ▾: this view as it's shown, or any of the reports.
  const doExport = async () => {
    const thisView = `This View (${tabName}${tab === 'quoted' && out !== 'any' ? ` · ${OUTCOMES.find(([k]) => k === out)?.[1]}` : ''}${view !== 'list' ? ` · ${VIEWS.find(([k]) => k === view)?.[1]}` : ''}, ${list.length})`;
    const pick = await pickExport<'view' | ReportKey>([{ key: 'view', label: thisView }, ...REPORTS.map(([key, label]) => ({ key, label }))]);
    if (!pick) return;
    const t = (pick.key === 'view' ? quoteReport(view !== 'list' ? view : tab === 'live' ? 'live' : tab === 'quoted' ? 'quoted' : 'all', list, today) : quoteReport(pick.key, all, today)) as Table;
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

  // The quotes as table rows (phone), as Works Orders: a header row, then a row per quote.
  const W = { a: 62, b: 66, s: 78 };
  const head = (l: string, w?: number) => <Text numberOfLines={1} style={{ ...(w ? { width: w } : { flex: 1 }), fontSize: 10.5, fontWeight: '700', color: base.slate, letterSpacing: 0.3 }}>{l.toUpperCase()}</Text>;
  const small = (t: string, w: number, sub?: string) => (
    <View style={{ width: w }}>
      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: base.ink }}>{t}</Text>
      {!!sub && <Text numberOfLines={1} style={{ fontSize: 10.5, color: base.slate }}>{sub}</Text>}
    </View>
  );
  const phoneTable = (
    <View accessibilityLabel="Quotes table" style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: '#F6F7F9' }}>
        {head('Project')}
        {tab === 'live' ? head('Due Back', W.b) : tab === 'quoted' ? <>{head('Returned', W.a)}{head('Chase', W.b)}</> : head('Date', W.b)}
        {head('Status', W.s)}
      </View>
      {list.slice(0, shown).map((x) => (
        <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={x.title} onPress={() => go(x)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: base.ink }}>{x.title}</Text>
            <Text numberOfLines={1} style={{ fontSize: 11, color: base.slate, marginTop: 1 }}>
              {tab === 'live' ? [x.client_name + (x.others?.length ? ` +${x.others.length}` : ''), x.discipline].filter(Boolean).join(' · ')
                : [x.client_name + (x.others?.length ? ` +${x.others.length}` : ''), money(x.value), x.profit_pct != null ? `${pct(x.profit_pct)} mark-up` : ''].filter((s) => s && s !== '—').join(' · ')}
            </Text>
          </View>
          {tab === 'live' ? small(ukd(x.return_date), W.b)
            : tab === 'quoted' ? <>{small(ukd(returnedOn(x)), W.a)}{small(x.chase_on && x.next_chase_date ? ukd(x.next_chase_date) : '—', W.b, chaseStatus(x, today).split(' · ')[0])}</>
              : small(ukd(isQuoted(x) ? returnedOn(x) : x.return_date), W.b, isQuoted(x) ? 'Returned' : 'Due Back')}
          <Text numberOfLines={2} style={{ width: W.s, fontSize: 11.5, fontWeight: '600', color: x.status === 'won' ? base.ink : base.slate }}>{statusWord(x)}</Text>
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
      { k: 'd', l: 'Due Back', render: (x: Quote) => <Cell>{ukd(x.return_date)}</Cell>, sort: (x: Quote) => x.return_date || '' },
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
        {tile(yrG?.rate == null ? '–' : `${yrG.rate}%`, `Win Rate ${thisYear}`, () => { openTab('quoted'); setView('year'); })}
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
        views={VIEWS} view={view} onView={(k) => setView(k as 'list' | GroupBy)}
        sorts={[['date', 'Newest First'], ['old', 'Oldest First'], ...(tab === 'live' ? [['due', 'Due Back Soonest'] as [string, string]] : []), ['value', 'Highest Value'], ['client', 'Customer A To Z']]} sort={sort} onSort={setSort}
        parts={[
          ...(tab === 'live' ? [{ key: 'st', label: 'Status', items: WORK_STATUS.map(([v, l]) => ({ v, l, n: live.filter((x) => x.status === v).length })) }] : []),
          { key: 'client', label: 'Customer', items: [...new Set(pool.flatMap(clientNames))].sort().map((v) => ({ v, l: v })) },
          { key: 'disc', label: 'Discipline', items: distinct((x) => x.discipline).map((v) => ({ v, l: v })) },
          { key: 'by', label: 'Priced By', items: distinct((x) => x.priced_by_name).map((v) => ({ v, l: v })) },
          { key: 'year', label: 'Year', items: distinct(yearOf).reverse().map((v) => ({ v, l: v })) },
        ]} />
      {isLoading ? <Muted>Loading…</Muted> : view !== 'list' ? (groups.length ? (desk ? (
        <FinTable rows={groups} keyOf={(g) => g.key} defaultSort={{ k: 'v', dir: 'desc' }}
          cols={[
            { k: 'g', l: (VIEWS.find(([k]) => k === view)?.[1] || '').replace('By ', ''), flex: 2, min: 180, render: (g: Group) => <Cell bold>{g.key}</Cell>, sort: (g: Group) => g.key },
            { k: 'n', l: 'Quotes', render: (g: Group) => <Cell>{g.count}</Cell>, sort: (g: Group) => g.count },
            { k: 'v', l: 'Value', render: (g: Group) => <Cell>{money(g.value)}</Cell>, sort: (g: Group) => g.value },
            { k: 'w', l: 'Won', render: (g: Group) => <Cell>{g.won}</Cell>, sort: (g: Group) => g.won },
            { k: 'wv', l: 'Won Value', render: (g: Group) => <Cell>{money(g.wonValue)}</Cell>, sort: (g: Group) => g.wonValue },
            { k: 'l', l: 'Not Won', render: (g: Group) => <Cell>{g.lost}</Cell>, sort: (g: Group) => g.lost },
            { k: 'r', l: 'Win Rate', render: (g: Group) => <Cell>{g.rate == null ? '–' : `${g.rate}%`}</Cell>, sort: (g: Group) => g.rate ?? -1 },
          ]} />
      ) : (
        <View style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, overflow: 'hidden' }}>
          {groups.map((g, i) => (
            <View key={g.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 10, borderTopWidth: i ? 1 : 0, borderTopColor: '#EEF0F2' }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: base.ink }}>{g.key}</Text>
                <Text numberOfLines={1} style={{ fontSize: 11, color: base.slate }}>{g.count} quote{g.count === 1 ? '' : 's'} · {g.won} won{g.rate == null ? '' : ` · ${g.rate}% win rate`}</Text>
              </View>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: base.ink }}>{money(g.value)}</Text>
            </View>
          ))}
        </View>
      )) : <Empty>No quotes match.</Empty>) : list.length ? (desk ? (
        <FinTable rows={list} keyOf={(x) => x.id} onRow={go} defaultSort={{ k: 'd', dir: tab === 'live' ? 'asc' : 'desc' }} cols={deskCols} />
      ) : (
        <>
          {phoneTable}
          {list.length > shown && <View style={{ marginTop: 10 }}><Button kind="ghost" title={`Show More (${list.length - shown} Left)`} onPress={() => setShown(shown + 100)} /></View>}
        </>
      )) : <Empty>{all.length ? 'No quotes match.' : 'No quotes yet. Press + New Enquiry to add one.'}</Empty>}
      <View style={{ flexGrow: 1 }} />
      <FootBar left={`${list.length} Quote${list.length === 1 ? '' : 's'}${total && desk ? ` · ${money(total)}` : ''}`}
        middle={me.role === 'admin' ? <FootButton label="⚙ Settings" a11y="Quote Settings" onPress={() => router.push('/pm/quotes/settings' as never)} /> : undefined}
        right={<FootButton label="⬇ Export ▾" a11y="Export" onPress={() => void doExport()} />} />
    </ScrollView>
  );
}
