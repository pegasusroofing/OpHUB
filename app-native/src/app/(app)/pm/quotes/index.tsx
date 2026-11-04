// Quote tracker, laid out like Finance (Andy, 4 Nov 2026): figures as tiles (tap one to filter), outcome chips, then on a
// laptop the Finance table (click a heading to sort, its filter box to filter, totals underneath) and on a phone compact
// rows with a search and drop-down filters. "View" groups the same quotes by customer, discipline, who priced it, year or
// outcome. The thin bar at the bottom exports whatever is showing. PMs and admins only.
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FinFilterBar, ThinExportBar, type FilterSel } from '@/components/FinFilterBar';
import { FinChip, FinRow, FinStat } from '@/components/FinNav';
import { Cell, FinTable, FootText } from '@/components/FinTable';
import { SelectBox } from '@/components/SelectBox';
import { useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { useQuotes, type Quote } from '@/data/quotes';
import { useAuth } from '@/lib/auth';
import { groupQuotes, isClosed, QUOTE_STATUS, statusLabel, type Group, type GroupBy } from '@/lib/rules/quotes';
import { exportTableExcel, exportTablePdf, type Table } from '@/lib/tableExport';
import { base, page, space, useDesk } from '@/theme/theme';

const money = (n: number | null | undefined) => (n ? `£${Math.round(n).toLocaleString('en-GB')}` : '—');
const ukd = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—');
const TONE: Record<string, string> = { won: '#15803d', lost: '#7A7F87', no_reply: '#7A7F87', declined: '#7A7F87', negotiating: '#2F6FB3', returned: '#D98A00', checking: '#7C3AED', awaiting: '#C0392B', pricing: '#1E2124' };
const tone = (s: string) => TONE[s] || base.ink;
const Pill = ({ s }: { s: string }) => <Text style={{ fontSize: 10.5, fontWeight: '600', color: tone(s), backgroundColor: `${tone(s)}1A`, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9, overflow: 'hidden', textAlign: 'center' }}>● {statusLabel(s)}</Text>;
type Show = 'live' | 'returned' | 'negotiating' | 'won' | 'closed' | 'all';
const SHOW: [Show, string, (x: Quote) => boolean][] = [
  ['live', 'Live', (x) => !isClosed(x.status)], ['returned', 'Returned', (x) => x.status === 'returned'], ['negotiating', 'Tender Stage', (x) => x.status === 'negotiating'],
  ['won', 'Won', (x) => x.status === 'won'], ['closed', 'Lost / No Reply', (x) => ['lost', 'no_reply', 'declined'].includes(x.status)], ['all', 'All', () => true],
];
const VIEWS: [('list' | GroupBy), string][] = [['list', 'List'], ['client_name', 'By Customer'], ['discipline', 'By Discipline'], ['priced_by_name', 'By Who Priced It'], ['year', 'By Year'], ['status', 'By Outcome']];
const yearOf = (x: Quote) => (x.completed_at || x.return_date || '').slice(0, 4);
const thisYear = String(new Date().getFullYear());
// The date that matters: when it's due back while being priced, when it went for a returned one, when it closed.
const dateOf = (x: Quote) => (isClosed(x.status) ? x.completed_at || x.return_date : x.return_date);
const dateWord = (x: Quote) => (isClosed(x.status) ? 'Closed' : x.returned_at ? 'Sent' : 'Due back');

export default function Quotes() {
  const { me, org } = useAuth();
  const toast = useToast();
  const desk = useDesk();
  const { data, isLoading } = useQuotes(me?.org_id);
  const [show, setShow] = useState<Show>('live');
  const [view, setView] = useState<'list' | GroupBy>('list');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<FilterSel>({ client: [], disc: [], by: [], year: [] });
  const [sort, setSort] = useState('date');
  const [shown, setShown] = useState(100);
  const all = useMemo(() => data ?? [], [data]);
  const inShow = useMemo(() => SHOW.find(([k]) => k === show)?.[2] ?? (() => true), [show]);
  // Phones filter here; on a laptop the table's own headings do it.
  const list = useMemo(() => {
    const s = desk ? '' : q.trim().toLowerCase();
    const has = (k: string, v: string | null) => desk || !sel[k]?.length || sel[k].includes(v ?? '');
    const SORT: Record<string, (a: Quote, b: Quote) => number> = {
      date: (a, b) => (dateOf(b) || '').localeCompare(dateOf(a) || ''), old: (a, b) => (dateOf(a) || '9').localeCompare(dateOf(b) || '9'),
      value: (a, b) => (b.value || 0) - (a.value || 0), client: (a, b) => a.client_name.localeCompare(b.client_name),
    };
    return all.filter(inShow).filter((x) => has('client', x.client_name) && has('disc', x.discipline) && has('by', x.priced_by_name) && has('year', yearOf(x))
      && (!s || `${x.client_name} ${x.title} ${x.address ?? ''} ${x.postcode ?? ''} ${x.discipline ?? ''} ${x.priced_by_name ?? ''} ${x.notes ?? ''}`.toLowerCase().includes(s))).sort(SORT[sort]);
  }, [all, inShow, q, sel, sort, desk]);
  if (!me) return null;
  if (me.role !== 'pm' && me.role !== 'admin') return <Muted style={{ padding: space.l }}>Project managers and admins only.</Muted>;

  const live = all.filter((x) => !isClosed(x.status));
  const yr = all.filter((x) => yearOf(x) === thisYear);
  const yrG = groupQuotes(yr.map((x) => ({ ...x, client_name: 'all' })), 'client_name')[0];
  const chaseDue = all.filter((x) => x.chase_on && x.next_chase_date && x.next_chase_date <= new Date().toISOString().slice(0, 10)).length;
  const groups: Group[] = view === 'list' ? [] : groupQuotes(list, view);
  const distinct = (f: (x: Quote) => string | null) => [...new Set(all.filter(inShow).map(f).filter(Boolean) as string[])].sort();
  const viewLabel = VIEWS.find(([k]) => k === view)?.[1] ?? 'List';
  const table = (): Table => view === 'list' ? ({
    title: 'Quotes', sub: `${SHOW.find(([k]) => k === show)?.[1]} · ${list.length} quotes`,
    cols: [{ l: 'Customer', w: 130 }, { l: 'Project', w: 190 }, { l: 'Discipline', w: 80 }, { l: 'Value', money: true, w: 75 }, { l: 'Priced by', w: 70 }, { l: 'Date', w: 65 }, { l: 'Outcome', w: 70 }, { l: 'Notes', w: 150 }],
    rows: list.map((x) => [x.client_name, x.title, x.discipline, x.value, x.priced_by_name, ukd(dateOf(x)), statusLabel(x.status), x.notes]),
    totals: ['Total', '', '', list.reduce((t, x) => t + (x.value || 0), 0), '', '', '', ''],
  }) : ({
    title: `Quotes ${viewLabel.toLowerCase()}`, sub: `${list.length} quotes`,
    cols: [{ l: viewLabel.replace('By ', ''), w: 170 }, { l: 'Quotes', num: true, w: 50 }, { l: 'Value', money: true, w: 90 }, { l: 'Won', num: true, w: 45 }, { l: 'Won value', money: true, w: 90 }, { l: 'Not won', num: true, w: 50 }, { l: 'Win rate %', num: true, w: 60 }],
    rows: groups.map((g) => [g.key, g.count, g.value, g.won, g.wonValue, g.lost, g.rate]),
  });
  const go = (x: Quote) => router.push(`/pm/quotes/${x.id}` as never);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={page(1200)} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: 'Quotes' }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <FinStat basis={desk ? 160 : '45%'} v={`${live.length}`} label={`Live quotes · ${money(live.reduce((t, x) => t + (x.value || 0), 0))}`} tone="blue" onPress={() => setShow('live')} />
          <FinStat basis={desk ? 160 : '45%'} v={`${all.filter((x) => x.status === 'returned').length}`} label={`Returned, waiting${chaseDue ? ` · ${chaseDue} chase due` : ''}`} tone="amber" onPress={() => setShow('returned')} />
          <FinStat basis={desk ? 160 : '45%'} v={money(yrG?.wonValue)} label={`Won in ${thisYear} · ${yrG?.won ?? 0} quotes`} tone="green" onPress={() => setShow('won')} />
          <FinStat basis={desk ? 160 : '45%'} v={yrG?.rate == null ? '–' : `${yrG.rate}%`} label={`Win rate ${thisYear}`} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          {SHOW.map(([k, l, f]) => <FinChip key={k} on={show === k} label={l} n={k === 'all' ? undefined : all.filter(f).length} onPress={() => { setShow(k); setShown(100); }} />)}
          <View style={{ flexGrow: 1 }} />
          <View style={{ width: desk ? 190 : '100%' }}><SelectBox compact value={view} title="View" options={VIEWS} onChange={(k) => setView(k)} style={{ marginBottom: 0 }} /></View>
          {desk && <Button small title="+ New Enquiry" onPress={() => router.push('/pm/quotes/new' as never)} />}
          {desk && me.role === 'admin' && <Button small kind="ghost" title="⚙ Settings" onPress={() => router.push('/pm/quotes/settings' as never)} />}
        </View>
        {!desk && <View style={{ marginBottom: 10 }}><Button title="+ New Enquiry" onPress={() => router.push('/pm/quotes/new' as never)} /></View>}
        {!desk && (
          <FinFilterBar search={{ value: q, onChange: (t) => { setQ(t); setShown(100); }, placeholder: 'Search customer, project, address…' }} sel={sel} onChange={setSel} onClear={() => setSel({ client: [], disc: [], by: [], year: [] })}
            sorts={[['date', 'Newest first'], ['old', 'Oldest first'], ['value', 'Highest value'], ['client', 'Customer A to Z']]} sort={sort} onSort={setSort}
            parts={[
              { key: 'client', label: 'Customer', items: distinct((x) => x.client_name).map((v) => ({ v, l: v })) },
              { key: 'disc', label: 'Discipline', items: distinct((x) => x.discipline).map((v) => ({ v, l: v })) },
              { key: 'by', label: 'Priced by', items: distinct((x) => x.priced_by_name).map((v) => ({ v, l: v })) },
              { key: 'year', label: 'Year', items: distinct(yearOf).reverse().map((v) => ({ v, l: v })) },
            ]} />
        )}
        {isLoading ? <Muted>Loading…</Muted> : view !== 'list' ? (groups.length ? (desk ? (
          <FinTable rows={groups} keyOf={(g) => g.key} defaultSort={{ k: 'v', dir: 'desc' }}
            cols={[
              { k: 'g', l: viewLabel.replace('By ', ''), flex: 2, min: 180, render: (g: Group) => <Cell bold>{g.key}</Cell>, sort: (g: Group) => g.key },
              { k: 'n', l: 'Quotes', render: (g: Group) => <Cell>{g.count}</Cell>, sort: (g: Group) => g.count },
              { k: 'v', l: 'Value', render: (g: Group) => <Cell>{money(g.value)}</Cell>, sort: (g: Group) => g.value },
              { k: 'w', l: 'Won', render: (g: Group) => <Cell>{g.won}</Cell>, sort: (g: Group) => g.won },
              { k: 'wv', l: 'Won Value', render: (g: Group) => <Cell>{money(g.wonValue)}</Cell>, sort: (g: Group) => g.wonValue },
              { k: 'l', l: 'Not Won', render: (g: Group) => <Cell>{g.lost}</Cell>, sort: (g: Group) => g.lost },
              { k: 'r', l: 'Win Rate', render: (g: Group) => <Cell>{g.rate == null ? '–' : `${g.rate}%`}</Cell>, sort: (g: Group) => g.rate ?? -1 },
            ]}
            foot={(rows) => <><FootText bold>{rows.length} groups</FootText><FootText>{rows.reduce((t, g) => t + g.count, 0)} quotes</FootText><FootText>Value {money(rows.reduce((t, g) => t + g.value, 0))}</FootText><FootText>Won {money(rows.reduce((t, g) => t + g.wonValue, 0))}</FootText></>} />
        ) : groups.map((g) => (
          <FinRow compact key={g.key} title={g.key} sub={`${g.count} quote${g.count === 1 ? '' : 's'} · ${g.won} won${g.wonValue ? ` (${money(g.wonValue)})` : ''} · ${g.lost} not won${g.rate == null ? '' : ` · ${g.rate}% win rate`}`} right={money(g.value)} />
        ))) : <Empty>No quotes match.</Empty>) : list.length ? (desk ? (
          <FinTable rows={list} keyOf={(x) => x.id} onRow={go} defaultSort={{ k: 'd', dir: 'desc' }}
            cols={[
              { k: 'p', l: 'Project', flex: 2, min: 200, render: (x: Quote) => <View style={{ alignItems: 'center' }}><Cell bold>{x.title}</Cell>{x.address ? <Text numberOfLines={1} style={{ fontSize: 11, color: base.slate }}>{x.address}</Text> : null}</View>, sort: (x: Quote) => x.title },
              { k: 'c', l: 'Customer', flex: 1.5, min: 140, render: (x: Quote) => <Cell>{x.client_name}</Cell>, sort: (x: Quote) => x.client_name },
              { k: 'di', l: 'Discipline', choices: [...new Set(list.map((x) => x.discipline).filter(Boolean) as string[])].sort(), render: (x: Quote) => <Cell>{x.discipline || '—'}</Cell>, sort: (x: Quote) => x.discipline || '' },
              { k: 'v', l: 'Value', render: (x: Quote) => <View style={{ alignItems: 'center' }}><Cell bold>{money(x.value)}</Cell>{x.profit_pct != null ? <Text style={{ fontSize: 11, color: base.slate }}>{Math.round(x.profit_pct * 1000) / 10}% profit</Text> : null}</View>, sort: (x: Quote) => x.value || 0 },
              { k: 'b', l: 'Priced By', choices: [...new Set(list.map((x) => x.priced_by_name).filter(Boolean) as string[])].sort(), render: (x: Quote) => <Cell>{x.priced_by_name || '—'}</Cell>, sort: (x: Quote) => x.priced_by_name || '' },
              { k: 'd', l: 'Date', render: (x: Quote) => <View style={{ alignItems: 'center' }}><Cell>{ukd(dateOf(x))}</Cell><Text style={{ fontSize: 10.5, color: base.slate }}>{dateWord(x)}</Text></View>, sort: (x: Quote) => dateOf(x) || '' },
              { k: 'ch', l: 'Chaser', noSort: true, render: (x: Quote) => <Cell>{x.chase_on && x.next_chase_date ? `Next ${ukd(x.next_chase_date)}` : x.chase_count ? `Chased ×${x.chase_count}` : '—'}</Cell> },
              { k: 's', l: 'Outcome', noSort: true, choices: QUOTE_STATUS.map((s) => s.label), render: (x: Quote) => <Pill s={x.status} /> },
            ]}
            foot={(rows) => <><FootText bold>{rows.length} quote{rows.length === 1 ? '' : 's'}</FootText><FootText>Value {money(rows.reduce((t, x) => t + (x.value || 0), 0))}</FootText><FootText>Won {money(rows.filter((x) => x.status === 'won').reduce((t, x) => t + (x.value || 0), 0))}</FootText></>} />
        ) : (
          <>
            {list.slice(0, shown).map((x) => (
              <Pressable key={x.id} onPress={() => go(x)} style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontWeight: '500', color: base.ink, fontSize: 13.5 }}>{x.title}</Text>
                  <Text style={{ fontWeight: '600', fontSize: 13, color: base.ink }}>{money(x.value)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 11.5, color: base.slate }}>{[x.client_name, x.discipline, x.priced_by_name, `${dateWord(x)} ${ukd(dateOf(x))}`].filter(Boolean).join(' · ')}</Text>
                  <Pill s={x.status} />
                </View>
              </Pressable>
            ))}
            {list.length > shown && <View style={{ marginTop: 10 }}><Button kind="ghost" title={`Show More (${list.length - shown} Left)`} onPress={() => setShown(shown + 100)} /></View>}
          </>
        )) : <Empty>{all.length ? 'No quotes match.' : 'No quotes yet. Press + New Enquiry to add one.'}</Empty>}
        {!desk && me.role === 'admin' && <View style={{ marginTop: 10 }}><Button kind="ghost" small title="⚙ Quote Settings" onPress={() => router.push('/pm/quotes/settings' as never)} /></View>}
      </ScrollView>
      {(list.length > 0 || groups.length > 0) && <ThinExportBar onExcel={() => void exportTableExcel(table(), org).then((ok) => { if (!ok) toast('Could not save the file.'); })} onPdf={() => void exportTablePdf(table(), org).then((ok) => { if (!ok) toast('Could not build the PDF.'); })} />}
    </View>
  );
}
