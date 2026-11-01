// Quote tracker: every enquiry, searched and filtered by customer, discipline, who priced it, outcome and year, with
// figures for each and exports of whatever is showing. Replaces Andy's Tender Tracker.xlsm. PMs and admins only.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { chooseAction, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { importTenderLog, useQuotes, type Quote } from '@/data/quotes';
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
  { key: 'value', label: 'Highest value', f: (a, b) => (b.value || 0) - (a.value || 0) },
  { key: 'client', label: 'Customer A to Z', f: (a, b) => a.client_name.localeCompare(b.client_name) },
];

export default function Quotes() {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuotes(me?.org_id);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('live');
  const [disc, setDisc] = useState('');
  const [by, setBy] = useState('');
  const [client, setClient] = useState('');
  const [year, setYear] = useState('');
  const [view, setView] = useState<'list' | GroupBy>('list');
  const [sort, setSort] = useState('date');
  const [shown, setShown] = useState(100);
  const [busy, setBusy] = useState(false);
  const all = useMemo(() => data ?? [], [data]);
  const distinct = (f: (x: Quote) => string | null) => [...new Set(all.map(f).filter(Boolean) as string[])].sort();
  const yearOf = (x: Quote) => (x.completed_at || x.return_date || '').slice(0, 4);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((x) => (status === 'all' || (status === 'live' ? !isClosed(x.status) : x.status === status))
      && (!disc || x.discipline === disc) && (!by || x.priced_by_name === by) && (!client || x.client_name === client) && (!year || yearOf(x) === year)
      && (!s || `${x.client_name} ${x.title} ${x.address ?? ''} ${x.notes ?? ''}`.toLowerCase().includes(s))).sort(SORTS.find((o) => o.key === sort)?.f);
  }, [all, q, status, disc, by, client, year, sort]);
  if (!me) return null;
  if (me.role !== 'pm' && me.role !== 'admin') return <Muted style={{ padding: space.l }}>Project managers and admins only.</Muted>;
  const groups = view === 'list' ? [] : groupQuotes(list, view);
  const total = groupQuotes(list.map((x) => ({ ...x, client_name: 'all' })), 'client_name')[0];
  const pick = async (title: string, none: string, items: string[], set: (v: string) => void, cur: string) => {
    const k = await chooseAction(title, [{ key: '__none', label: `${cur ? '' : '✓ '}${none}` }, ...items.map((i) => ({ key: i, label: `${cur === i ? '✓ ' : ''}${i}` }))]);
    if (k !== null) { set(k === '__none' ? '' : k); setShown(100); }
  };
  const chip = (label: string, press: () => void, on = false) => (
    <Pressable onPress={press} style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card }}>
      <Text numberOfLines={1} style={{ maxWidth: 170, fontSize: 12.5, fontWeight: '700', color: on ? '#fff' : base.ink }}>{label} ▾</Text>
    </Pressable>
  );
  const table = (): Table => view === 'list' ? ({
    title: 'Quotes', sub: `${list.length} quotes`,
    cols: [{ l: 'Customer', w: 130 }, { l: 'Project', w: 190 }, { l: 'Discipline', w: 80 }, { l: 'Value', money: true, w: 75 }, { l: 'Priced by', w: 70 }, { l: 'Return date', w: 65 }, { l: 'Outcome', w: 70 }, { l: 'Notes', w: 150 }],
    rows: list.map((x) => [x.client_name, x.title, x.discipline, x.value, x.priced_by_name, ukd(x.return_date), statusLabel(x.status), x.notes]),
    totals: ['Total', '', '', total?.value ?? 0, '', '', '', ''],
  }) : ({
    title: `Quotes ${VIEWS.find((v) => v.key === view)?.label.toLowerCase()}`, sub: `${list.length} quotes`,
    cols: [{ l: VIEWS.find((v) => v.key === view)?.label.replace('By ', '') ?? '', w: 170 }, { l: 'Quotes', num: true, w: 50 }, { l: 'Value', money: true, w: 90 }, { l: 'Won', num: true, w: 45 }, { l: 'Won value', money: true, w: 90 }, { l: 'Not won', num: true, w: 50 }, { l: 'Win rate %', num: true, w: 60 }],
    rows: groups.map((g) => [g.key, g.count, g.value, g.won, g.wonValue, g.lost, g.rate]),
  });
  const load = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const names = await promptText('Who prices quotes? Put the names as they’re written in the Feedback column, split by commas. Those go in Priced by.', 'Andy C, Neil');
    if (names === null) return;
    setBusy(true);
    try {
      const out = await importTenderLog(me, new Uint8Array(await (await fetch(r.assets[0].uri)).arrayBuffer()), names.split(',').map((x) => x.trim()).filter(Boolean));
      if ('error' in out) showAlert(out.error);
      else showAlert(`${out.added} quotes loaded. ${out.already} were already here. ${out.skipped} rows skipped as they had no client or project. The chaser is off on all of them.`);
      void qc.invalidateQueries({ queryKey: ['quotes', me.org_id] });
    } catch { toast('Could not read that file: is it the Excel tracker?'); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={page(960)} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: 'Quotes' }} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          {[{ l: 'Showing', v: String(list.length) }, { l: 'Value', v: money(total?.value) || '£0' }, { l: 'Won', v: String(total?.won ?? 0) }, { l: 'Win rate', v: total?.rate == null ? '–' : `${total.rate}%` }].map((c) => (
            <View key={c.l} style={{ flex: 1, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, paddingVertical: 8, alignItems: 'center' }}>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 16, fontWeight: '800', color: base.ink }}>{c.v}</Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: base.slate }}>{c.l}</Text>
            </View>
          ))}
        </View>
        <View style={{ marginBottom: 10 }}><Button title="+ New Quote" onPress={() => router.push('/pm/quotes/new' as never)} /></View>
        <TextInput value={q} onChangeText={(t) => { setQ(t); setShown(100); }} placeholder="Search customer, project, address…" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, backgroundColor: base.card, color: base.ink, marginBottom: 8, fontSize: 16 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {chip(status === 'live' ? 'Live' : status === 'all' ? 'All' : statusLabel(status), async () => { const k = await chooseAction('Outcome', [{ key: 'live', label: 'Live (not finished)' }, { key: 'all', label: 'All' }, ...QUOTE_STATUS.map((s) => ({ key: s.key, label: s.label }))]); if (k) { setStatus(k); setShown(100); } }, true)}
          {chip(VIEWS.find((v) => v.key === view)?.label ?? 'List', async () => { const k = await chooseAction('View', VIEWS.map((v) => ({ key: v.key, label: v.label }))); if (k) setView(k as typeof view); }, view !== 'list')}
          {chip(client || 'Customer', () => void pick('Customer', 'All customers', distinct((x) => x.client_name), setClient, client), !!client)}
          {chip(disc || 'Discipline', () => void pick('Discipline', 'All disciplines', distinct((x) => x.discipline), setDisc, disc), !!disc)}
          {chip(by || 'Priced by', () => void pick('Priced by', 'Everyone', distinct((x) => x.priced_by_name), setBy, by), !!by)}
          {chip(year || 'Year', () => void pick('Year', 'All years', distinct(yearOf).reverse(), setYear, year), !!year)}
          {view === 'list' && chip(SORTS.find((o) => o.key === sort)?.label ?? 'Sort', async () => { const k = await chooseAction('Sort', SORTS.map((o) => ({ key: o.key, label: o.label }))); if (k) setSort(k); })}
        </View>
        {isLoading ? <Muted>Loading…</Muted> : view !== 'list' ? (groups.length ? groups.map((g) => (
          <View key={g.key} style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, padding: 12, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <Text style={{ flex: 1, fontWeight: '700', color: base.ink, fontSize: 15 }}>{g.key}</Text>
              <Text style={{ fontWeight: '800', color: base.ink }}>{money(g.value)}</Text>
            </View>
            <Text style={{ fontSize: 12.5, color: base.slate, marginTop: 3 }}>{g.count} quote{g.count === 1 ? '' : 's'} · {g.won} won{g.wonValue ? ` (${money(g.wonValue)})` : ''} · {g.lost} not won{g.rate == null ? '' : ` · ${g.rate}% win rate`}</Text>
          </View>
        )) : <Empty>No quotes match.</Empty>) : list.length ? (
          <>
            {list.slice(0, shown).map((x) => (
              <Pressable key={x.id} onPress={() => router.push(`/pm/quotes/${x.id}` as never)} style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, padding: 12, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <Text style={{ flex: 1, fontWeight: '700', color: base.ink, fontSize: 15 }}>{x.title}</Text>
                  <Text style={{ fontWeight: '800', fontSize: 12, color: colour(x.status) }}>{statusLabel(x.status)}</Text>
                </View>
                <Text style={{ fontSize: 12.5, color: base.slate, marginTop: 3 }}>{[x.client_name, x.discipline, money(x.value), x.priced_by_name, x.return_date ? `Return ${ukd(x.return_date)}` : ''].filter(Boolean).join(' · ')}</Text>
                {x.chase_on && !!x.next_chase_date && <Text style={{ fontSize: 12, color: base.warn, fontWeight: '700', marginTop: 2 }}>Chase {ukd(x.next_chase_date)}</Text>}
              </Pressable>
            ))}
            {list.length > shown && <Button kind="ghost" title={`Show more (${list.length - shown} left)`} onPress={() => setShown(shown + 100)} />}
          </>
        ) : <Empty>{all.length ? 'No quotes match.' : 'No quotes yet. Add one, or load your Excel tracker below.'}</Empty>}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <View style={{ flex: 1 }}><Button kind="ghost" small busy={busy} title="📊 Load Excel tracker" onPress={() => void load()} /></View>
          {me.role === 'admin' && <View style={{ flex: 1 }}><Button kind="ghost" small title="⚙️ Quote settings" onPress={() => router.push('/pm/quotes/settings' as never)} /></View>}
        </View>
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
