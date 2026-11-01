// Quote tracker: every enquiry, searched and filtered by customer, discipline, who priced it, outcome and year (tick as
// many as you like), with figures for each and exports of whatever is showing. PMs and admins only.
import { router, Stack } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { useQuotes, type Quote } from '@/data/quotes';
import { useAuth } from '@/lib/auth';
import { groupQuotes, isClosed, QUOTE_STATUS, statusLabel, type GroupBy } from '@/lib/rules/quotes';
import { exportTableExcel, exportTablePdf, type Table } from '@/lib/tableExport';
import { base, page, radius, space } from '@/theme/theme';

const money = (n: number | null | undefined) => (n ? `£${Math.round(n).toLocaleString('en-GB')}` : '');
const ukd = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '');
const colour = (s: string) => (s === 'won' ? base.ok : isClosed(s) ? base.slate : s === 'negotiating' ? base.blue : s === 'returned' ? base.warn : base.ink);
const VIEWS: { key: 'list' | GroupBy; label: string }[] = [{ key: 'list', label: 'List' }, { key: 'client_name', label: 'By customer' }, { key: 'discipline', label: 'By discipline' }, { key: 'priced_by_name', label: 'By who priced it' }, { key: 'year', label: 'By year' }, { key: 'status', label: 'By outcome' }];
const SORTS: { key: string; label: string; f: (a: Quote, b: Quote) => number }[] = [
  { key: 'date', label: 'Newest first', f: (a, b) => (b.return_date || '').localeCompare(a.return_date || '') },
  { key: 'old', label: 'Oldest first', f: (a, b) => (a.return_date || '9').localeCompare(b.return_date || '9') },
  { key: 'value', label: 'Highest value', f: (a, b) => (b.value || 0) - (a.value || 0) },
  { key: 'client', label: 'Customer A to Z', f: (a, b) => a.client_name.localeCompare(b.client_name) },
];
const LIVE = QUOTE_STATUS.filter((s) => !isClosed(s.key)).map((s) => s.key as string);
type Key = 'status' | 'client' | 'disc' | 'by' | 'year';
type Sel = Record<Key, string[]>;
const yearOf = (x: Quote) => (x.completed_at || x.return_date || '').slice(0, 4);
const COLS: { w: number | undefined; flex?: number }[] = [{ w: undefined, flex: 2 }, { w: undefined, flex: 1.4 }, { w: 100 }, { w: 90 }, { w: 80 }, { w: 80 }, { w: 90 }];

export default function Quotes() {
  const { me, org } = useAuth();
  const toast = useToast();
  const wide = useWindowDimensions().width >= 900;
  const { data, isLoading } = useQuotes(me?.org_id);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Sel>({ status: LIVE, client: [], disc: [], by: [], year: [] });
  const [view, setView] = useState<'list' | GroupBy>('list');
  const [sort, setSort] = useState('date');
  const [shown, setShown] = useState(100);
  const [menu, setMenu] = useState<'' | 'filter' | 'sort' | 'view'>('');
  const [part, setPart] = useState<Key | ''>('');
  const [find, setFind] = useState('');
  const all = useMemo(() => data ?? [], [data]);
  const distinct = (f: (x: Quote) => string | null) => [...new Set(all.map(f).filter(Boolean) as string[])].sort();
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const has = (k: Key, v: string | null) => !sel[k].length || sel[k].includes(v ?? '');
    return all.filter((x) => has('status', x.status) && has('client', x.client_name) && has('disc', x.discipline) && has('by', x.priced_by_name) && has('year', yearOf(x))
      && (!s || `${x.client_name} ${x.title} ${x.address ?? ''} ${x.notes ?? ''}`.toLowerCase().includes(s))).sort(SORTS.find((o) => o.key === sort)?.f);
  }, [all, q, sel, sort]);
  if (!me) return null;
  if (me.role !== 'pm' && me.role !== 'admin') return <Muted style={{ padding: space.l }}>Project managers and admins only.</Muted>;
  const groups = view === 'list' ? [] : groupQuotes(list, view);
  const total = groupQuotes(list.map((x) => ({ ...x, client_name: 'all' })), 'client_name')[0];
  const isLiveOnly = sel.status.length === LIVE.length && LIVE.every((s) => sel.status.includes(s));
  const applied = (Object.keys(sel) as Key[]).filter((k) => k !== 'status').reduce((n, k) => n + sel[k].length, 0) + (isLiveOnly ? 0 : sel.status.length);
  const parts: { key: Key; label: string; items: { v: string; l: string }[] }[] = [
    { key: 'status', label: 'Outcome', items: QUOTE_STATUS.map((s) => ({ v: s.key, l: s.label })) },
    { key: 'client', label: 'Customer', items: distinct((x) => x.client_name).map((v) => ({ v, l: v })) },
    { key: 'disc', label: 'Discipline', items: distinct((x) => x.discipline).map((v) => ({ v, l: v })) },
    { key: 'by', label: 'Priced by', items: distinct((x) => x.priced_by_name).map((v) => ({ v, l: v })) },
    { key: 'year', label: 'Year', items: distinct(yearOf).reverse().map((v) => ({ v, l: v })) },
  ];
  const tick = (k: Key, v: string) => { setSel({ ...sel, [k]: sel[k].includes(v) ? sel[k].filter((x) => x !== v) : [...sel[k], v] }); setShown(100); };
  const drop = (key: typeof menu, label: string, on = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setMenu(menu === key ? '' : key)} style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.input, borderWidth: 1, borderColor: on || menu === key ? base.ink : base.line, backgroundColor: base.card, flexDirection: 'row', justifyContent: 'space-between', gap: 4 }}>
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, fontWeight: '700', color: base.ink }}>{label}</Text>
      <Text style={{ fontSize: 11, color: base.slate }}>{menu === key ? '▲' : '▼'}</Text>
    </Pressable>
  );
  const panel = (kids: ReactNode) => <View style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, marginBottom: 8, overflow: 'hidden' }}>{kids}</View>;
  const option = (label: string, on: boolean, press: () => void, box = false) => (
    <Pressable key={label} accessibilityRole={box ? 'checkbox' : 'button'} accessibilityLabel={label} onPress={press} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: base.cardLine }}>
      <Text style={{ width: 18, fontSize: 15, color: base.ink }}>{box ? (on ? '☑' : '☐') : on ? '✓' : ''}</Text>
      <Text style={{ flex: 1, fontSize: 13.5, color: base.ink, fontWeight: on ? '700' : '400' }}>{label}</Text>
    </Pressable>
  );
  const table = (): Table => view === 'list' ? ({
    title: 'Quotes', sub: `${list.length} quotes`,
    cols: [{ l: 'Customer', w: 130 }, { l: 'Project', w: 190 }, { l: 'Discipline', w: 80 }, { l: 'Value', money: true, w: 75 }, { l: 'Priced by', w: 70 }, { l: 'Date', w: 65 }, { l: 'Outcome', w: 70 }, { l: 'Notes', w: 150 }],
    rows: list.map((x) => [x.client_name, x.title, x.discipline, x.value, x.priced_by_name, ukd(x.return_date), statusLabel(x.status), x.notes]),
    totals: ['Total', '', '', total?.value ?? 0, '', '', '', ''],
  }) : ({
    title: `Quotes ${VIEWS.find((v) => v.key === view)?.label.toLowerCase()}`, sub: `${list.length} quotes`,
    cols: [{ l: VIEWS.find((v) => v.key === view)?.label.replace('By ', '') ?? '', w: 170 }, { l: 'Quotes', num: true, w: 50 }, { l: 'Value', money: true, w: 90 }, { l: 'Won', num: true, w: 45 }, { l: 'Won value', money: true, w: 90 }, { l: 'Not won', num: true, w: 50 }, { l: 'Win rate %', num: true, w: 60 }],
    rows: groups.map((g) => [g.key, g.count, g.value, g.won, g.wonValue, g.lost, g.rate]),
  });
  const cell = (i: number, kid: ReactNode) => <View key={i} style={COLS[i].w ? { width: COLS[i].w } : { flex: COLS[i].flex }}>{kid}</View>;
  const open = parts.find((p) => p.key === part);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={page(1100)} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: 'Quotes' }} />
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          {[{ l: 'Showing', v: String(list.length) }, { l: 'Value', v: money(total?.value) || '£0' }, { l: 'Won', v: String(total?.won ?? 0) }, { l: 'Win rate', v: total?.rate == null ? '–' : `${total.rate}%` }].map((c) => (
            <View key={c.l} style={{ flex: 1, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.input, paddingVertical: 5, alignItems: 'center' }}>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 14.5, fontWeight: '800', color: base.ink }}>{c.v}</Text>
              <Text style={{ fontSize: 10.5, fontWeight: '600', color: base.slate }}>{c.l}</Text>
            </View>
          ))}
        </View>
        <View style={{ marginBottom: 8 }}><Button title="+ New Enquiry" onPress={() => router.push('/pm/quotes/new' as never)} /></View>
        <TextInput value={q} onChangeText={(t) => { setQ(t); setShown(100); }} placeholder="Search customer, project, address…" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: base.card, color: base.ink, marginBottom: 8, fontSize: 16 }} />
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          {drop('filter', `Filter${applied ? ` (${applied})` : isLiveOnly ? ': Live' : ''}`, applied > 0)}
          {drop('sort', SORTS.find((o) => o.key === sort)?.label ?? 'Sort')}
          {drop('view', VIEWS.find((v) => v.key === view)?.label ?? 'List', view !== 'list')}
        </View>
        {menu === 'sort' && panel(SORTS.map((o) => option(o.label, sort === o.key, () => { setSort(o.key); setMenu(''); })))}
        {menu === 'view' && panel(VIEWS.map((o) => option(o.label, view === o.key, () => { setView(o.key); setMenu(''); })))}
        {menu === 'filter' && panel(
          <>
            {parts.map((p) => (
              <View key={p.key}>
                <Pressable accessibilityRole="button" accessibilityLabel={p.label} onPress={() => { setPart(part === p.key ? '' : p.key); setFind(''); }} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: base.cardLine }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: base.ink }}>{p.label}{sel[p.key].length ? ` (${sel[p.key].length})` : ''}</Text>
                  <Text style={{ fontSize: 11, color: base.slate }}>{part === p.key ? '▲' : '▼'}</Text>
                </Pressable>
                {open?.key === p.key && (
                  <View style={{ backgroundColor: base.paper }}>
                    {p.items.length > 12 && <TextInput value={find} onChangeText={setFind} placeholder={`Find a ${p.label.toLowerCase()}…`} style={{ margin: 8, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 8, backgroundColor: base.card, color: base.ink, fontSize: 16 }} />}
                    {p.items.filter((i) => !find.trim() || i.l.toLowerCase().includes(find.trim().toLowerCase())).slice(0, 60).map((i) => option(i.l, sel[p.key].includes(i.v), () => tick(p.key, i.v), true))}
                  </View>
                )}
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 8, padding: 8, borderTopWidth: 1, borderTopColor: base.cardLine }}>
              <View style={{ flex: 1 }}><Button small kind="ghost" title="Show everything" onPress={() => { setSel({ status: [], client: [], disc: [], by: [], year: [] }); setShown(100); }} /></View>
              <View style={{ flex: 1 }}><Button small title="Done" onPress={() => setMenu('')} /></View>
            </View>
          </>,
        )}
        {isLoading ? <Muted>Loading…</Muted> : view !== 'list' ? (groups.length ? groups.map((g) => (
          <View key={g.key} style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.input, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontWeight: '700', color: base.ink, fontSize: 14 }}>{g.key}</Text>
              <Text style={{ fontWeight: '800', fontSize: 13.5, color: base.ink }}>{money(g.value)}</Text>
            </View>
            <Text numberOfLines={1} style={{ fontSize: 12, color: base.slate, marginTop: 1 }}>{g.count} quote{g.count === 1 ? '' : 's'} · {g.won} won{g.wonValue ? ` (${money(g.wonValue)})` : ''} · {g.lost} not won{g.rate == null ? '' : ` · ${g.rate}% win rate`}</Text>
          </View>
        )) : <Empty>No quotes match.</Empty>) : list.length ? (
          <>
            {wide && (
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingBottom: 4 }}>
                {['Project', 'Customer', 'Discipline', 'Value', 'Priced by', 'Date', 'Outcome'].map((h, i) => cell(i, <Text style={{ fontSize: 11, fontWeight: '800', color: base.slate }}>{h}</Text>))}
              </View>
            )}
            {list.slice(0, shown).map((x) => wide ? (
              <Pressable key={x.id} onPress={() => router.push(`/pm/quotes/${x.id}` as never)} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: base.card, borderBottomWidth: 1, borderBottomColor: base.cardLine, paddingHorizontal: 10, paddingVertical: 6 }}>
                {cell(0, <Text numberOfLines={1} style={{ fontWeight: '700', fontSize: 13, color: base.ink }}>{x.title}</Text>)}
                {cell(1, <Text numberOfLines={1} style={{ fontSize: 13, color: base.ink }}>{x.client_name}</Text>)}
                {cell(2, <Text numberOfLines={1} style={{ fontSize: 12.5, color: base.slate }}>{x.discipline}</Text>)}
                {cell(3, <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: base.ink }}>{money(x.value)}</Text>)}
                {cell(4, <Text numberOfLines={1} style={{ fontSize: 12.5, color: base.slate }}>{x.priced_by_name}</Text>)}
                {cell(5, <Text numberOfLines={1} style={{ fontSize: 12.5, color: base.slate }}>{ukd(x.return_date)}</Text>)}
                {cell(6, <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '800', color: colour(x.status) }}>{statusLabel(x.status)}</Text>)}
              </Pressable>
            ) : (
              <Pressable key={x.id} onPress={() => router.push(`/pm/quotes/${x.id}` as never)} style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.input, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontWeight: '700', color: base.ink, fontSize: 13.5 }}>{x.title}</Text>
                  <Text style={{ fontWeight: '800', fontSize: 11.5, color: colour(x.status) }}>{statusLabel(x.status)}</Text>
                </View>
                <Text numberOfLines={1} style={{ fontSize: 11.5, color: base.slate, marginTop: 1 }}>{[x.client_name, money(x.value), x.discipline, x.priced_by_name, ukd(x.return_date)].filter(Boolean).join(' · ')}</Text>
              </Pressable>
            ))}
            {list.length > shown && <View style={{ marginTop: 6 }}><Button kind="ghost" title={`Show more (${list.length - shown} left)`} onPress={() => setShown(shown + 100)} /></View>}
          </>
        ) : <Empty>{all.length ? 'No quotes match.' : 'No quotes yet. Press + New Enquiry to add one.'}</Empty>}
        {me.role === 'admin' && <View style={{ marginTop: 14 }}><Button kind="ghost" small title="⚙️ Quote settings" onPress={() => router.push('/pm/quotes/settings' as never)} /></View>}
      </ScrollView>
      {list.length > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: base.card, borderTopWidth: 1, borderTopColor: base.line, paddingHorizontal: 16, paddingVertical: 9 }}>
          <Pressable onPress={() => void exportTableExcel(table(), org).then((ok) => { if (!ok) toast('Could not save the file.'); })}><Text style={{ fontSize: 13, fontWeight: '700', color: base.blue }}>📊 Excel</Text></Pressable>
          <Pressable onPress={() => void exportTablePdf(table(), org).then((ok) => { if (!ok) toast('Could not build the PDF.'); })}><Text style={{ fontSize: 13, fontWeight: '700', color: base.blue }}>📄 PDF</Text></Pressable>
        </View>
      )}
    </View>
  );
}
