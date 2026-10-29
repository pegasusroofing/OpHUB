// Finance › Reports (913): pick a report, set the projects, project and
// dates; shown as a table on a computer and as cards on a phone, with totals.
// Excel / PDF downloads of each report (finExportExcel / report PDF).
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { FinChip, FinPage } from '@/components/FinNav';
import { pickJob } from '@/components/FinSales';
import { useToast } from '@/components/toast';
import { OphIcon } from '@/components/OphIcon';
import { Button, Card, Empty, Muted, TINTS } from '@/components/ui';
import { finStatus, loadSettings, selectAll } from '@/data/finance';
import { loadBook } from '@/data/finBook';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { REPORT_GROUPS, REPORTS, type Col, type Filters } from '@/lib/finReports';
import { fdate, jobTag, money } from '@/lib/rules/finance';
import { exportTableExcel, exportTablePdf, type Table } from '@/lib/tableExport';
import { base, radius } from '@/theme/theme';

type Row = Record<string, any>;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 8, color: base.ink, backgroundColor: base.card };
const fmt = (c: Col, v: unknown) => (v === null || v === undefined || v === '' ? '—' : c.money ? money(v) : c.pct ? `${Math.round(Number(v) * 10) / 10}%` : c.date ? fdate(String(v)) : String(v));

export default function FinReports() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const rep = REPORTS.find((r) => r.id === id);
  const [open, setOpen] = useState<string[]>([Object.keys(REPORT_GROUPS)[0]]);
  // Each group as a card that opens (the current app's report picker): a tinted icon, "· n reports", then a row per report.
  const ICON = [['chart', 'blue'], ['pound', 'green'], ['reports', 'orange']] as const;
  if (!rep) return (
    <FinPage title="Reports" section="reports">
      <Muted style={{ marginBottom: 10, fontSize: 12 }}>Pick a report, set the project and dates, then download it as Excel or PDF.</Muted>
      {Object.keys(REPORT_GROUPS).map((g, gi) => {
        const list = REPORTS.filter((r) => r.group === g), on = open.includes(g), [ic, tn] = ICON[gi % ICON.length];
        return (
          <View key={g} style={{ marginBottom: 10 }}>
            <Pressable onPress={() => setOpen(on ? open.filter((x) => x !== g) : [...open, g])} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 }}>
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: TINTS[tn][0], alignItems: 'center', justifyContent: 'center' }}><OphIcon name={ic} size={16} color={TINTS[tn][1]} /></View>
              <Text style={{ flex: 1, color: '#111827' }}><Text style={{ fontWeight: '800' }}>{REPORT_GROUPS[g]}</Text><Text style={{ color: '#6b7280', fontSize: 12 }}> · {list.length} reports</Text></Text>
              <Text style={{ color: '#111827', fontSize: 10 }}>{on ? '▼' : '▶'}</Text>
            </Pressable>
            {on && <View style={{ marginLeft: 14, marginTop: 6, gap: 6 }}>
              {list.map((r) => (
                <Pressable key={r.id} onPress={() => router.setParams({ id: r.id })} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 }, pressed && { backgroundColor: '#F8F9FB' }]}>
                  <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: '#111827', fontSize: 13 }}>{r.title}</Text><Text style={{ color: '#6b7280', fontSize: 11.5, marginTop: 1 }}>{r.desc}</Text></View>
                  <OphIcon name="chevron" size={16} color={base.slateLight} stroke={2.2} />
                </Pressable>
              ))}
            </View>}
          </View>
        );
      })}
    </FinPage>
  );
  return <Report key={rep.id} id={rep.id} />;
}

function Report({ id }: { id: string }) {
  const rep = REPORTS.find((r) => r.id === id)!;
  const { me, org } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const { data: sites = [] } = useSites();
  const { width } = useWindowDimensions();
  const [f, setF] = useState<Filters>({ job: '', from: '', to: '', status: 'live', opening: '', varstatus: '', postatus: '' });
  const { data, isLoading } = useQuery({
    queryKey: ['finRepCtx', me?.org_id, id === 'cis'], enabled: !!me, staleTime: 15000,
    queryFn: async () => {
      const org = me?.org_id as string;
      const [b, settings, cisPays] = await Promise.all([loadBook(org, null), loadSettings(org), id === 'cis' ? selectAll<Row>('fin_sub_payments', '*', (q) => q.eq('org_id', org).eq('status', 'paid')) : Promise.resolve([])]);
      return { b, settings, cisPays };
    },
  });
  const has = (k: string) => rep.filters.includes(k);
  const res = data ? rep.run({ b: data.b, settings: data.settings, sites: sites as Row[], status: (s) => finStatus(s as never), cisPays: data.cisPays }, f) : null;
  const tot = (c: Col) => (res?.totals === true ? c.money : Array.isArray(res?.totals) && res.totals.includes(c.k)) ? res!.rows.reduce((t, r) => t + (Number(r[c.k]) || 0), 0) : null;
  const wide = width >= 900;
  const table = (): Table | null => (res ? { title: rep.title, sub: [f.job ? jobTag(sites.find((s) => s.id === f.job)) : rep.filters.includes('status') ? `${f.status} projects` : '', f.from || f.to ? `${f.from ? fdate(f.from) : 'start'} to ${f.to ? fdate(f.to) : 'today'}` : ''].filter(Boolean).join(' · '), cols: res.cols.map((c) => ({ l: c.l, money: c.money, num: c.num || c.pct })), rows: res.rows.map((r) => res.cols.map((c) => (c.money ? Number(r[c.k]) || 0 : c.pct ? (r[c.k] == null ? null : Math.round(Number(r[c.k]) * 10) / 10) : c.date ? (r[c.k] ? fdate(String(r[c.k])) : '') : r[c.k] == null ? '' : String(r[c.k])))), totals: res.totals ? res.cols.map((c, i) => (i === 0 ? 'Total' : tot(c))) : undefined } : null);
  const download = async (k: 'x' | 'p') => { const t = table(); if (!t || !t.rows.length) { toast('Nothing to export.'); return; } setBusy(k); const ok = await (k === 'x' ? exportTableExcel(t, org) : exportTablePdf(t, org)).catch(() => false); setBusy(''); if (!ok) toast('Could not make the file — try again.'); };
  return (
    <FinPage title={rep.title} section="reports" wide>
      <Pressable onPress={() => router.setParams({ id: '' })}><Text style={{ color: base.blue, marginBottom: 6 }}>‹ All reports</Text></Pressable>
      <Muted style={{ marginBottom: 8 }}>{rep.desc}</Muted>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}><Button kind="ghost" title={busy === 'x' ? 'Making…' : '📊 Excel'} onPress={() => download('x')} /><Button kind="ghost" title={busy === 'p' ? 'Making…' : '📄 PDF'} onPress={() => download('p')} /></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        {has('status') && ['live', 'upcoming', 'closed', 'all'].map((k) => <FinChip key={k} on={f.status === k} label={k[0].toUpperCase() + k.slice(1)} onPress={() => setF({ ...f, status: k })} />)}
        {has('job') && <Pressable onPress={async () => { const k = await pickJob('Project', sites); setF({ ...f, job: k || '' }); }} style={box}><Text style={{ color: base.ink }}>{f.job ? jobTag(sites.find((s) => s.id === f.job)) : 'All projects'} ▾</Text></Pressable>}
        {has('dates') && <><TextInput value={f.from} onChangeText={(v) => setF({ ...f, from: v })} placeholder="From YYYY-MM-DD" style={[box, { width: 140 }]} /><TextInput value={f.to} onChangeText={(v) => setF({ ...f, to: v })} placeholder="To YYYY-MM-DD" style={[box, { width: 140 }]} /></>}
        {has('opening') && <TextInput value={f.opening} onChangeText={(v) => setF({ ...f, opening: v })} placeholder="Opening bank balance £" keyboardType="decimal-pad" style={[box, { width: 180 }]} />}
        {has('varstatus') && ['', 'instructed', 'priced', 'submitted', 'agreed', 'rejected'].map((k) => <FinChip key={k || 'all'} on={f.varstatus === k} label={k ? k[0].toUpperCase() + k.slice(1) : 'Any status'} onPress={() => setF({ ...f, varstatus: k })} />)}
        {has('postatus') && ['', 'open', 'invoiced', 'cancelled'].map((k) => <FinChip key={k || 'allpo'} on={f.postatus === k} label={k ? k[0].toUpperCase() + k.slice(1) : 'Any PO'} onPress={() => setF({ ...f, postatus: k })} />)}
      </View>
      {isLoading || !res ? <Muted>Working it out…</Muted> : !res.rows.length ? <Empty>Nothing to show.</Empty> : wide ? (
        <ScrollView horizontal>
          <View>
            <View style={{ flexDirection: 'row', borderBottomWidth: 2, borderColor: base.ink, paddingBottom: 4 }}>{res.cols.map((c) => <Text key={c.k} style={{ width: c.money || c.num || c.pct ? 110 : 180, fontWeight: '800', color: base.ink, fontSize: 12, textAlign: c.money || c.num || c.pct ? 'right' : 'left', paddingHorizontal: 4 }}>{c.l}</Text>)}</View>
            {res.rows.map((r, i) => (
              <Pressable key={i} onPress={r._go ? () => router.push(r._go as never) : undefined} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: base.line, paddingVertical: 5 }}>
                {res.cols.map((c) => <Text key={c.k} style={{ width: c.money || c.num || c.pct ? 110 : 180, color: Number(r[c.k]) < 0 && c.money ? '#C0392B' : base.ink, fontSize: 12.5, textAlign: c.money || c.num || c.pct ? 'right' : 'left', paddingHorizontal: 4 }}>{fmt(c, r[c.k])}</Text>)}
              </Pressable>
            ))}
            {res.totals ? <View style={{ flexDirection: 'row', borderTopWidth: 2, borderColor: base.ink, paddingVertical: 5 }}>{res.cols.map((c, i) => { const t = tot(c); return <Text key={c.k} style={{ width: c.money || c.num || c.pct ? 110 : 180, fontWeight: '800', color: base.ink, fontSize: 12.5, textAlign: c.money || c.num || c.pct ? 'right' : 'left', paddingHorizontal: 4 }}>{i === 0 ? `Total (${res.rows.length})` : t !== null ? money(t) : ''}</Text>; })}</View> : null}
          </View>
        </ScrollView>
      ) : (
        <View>
          {res.rows.map((r, i) => (
            <Pressable key={i} onPress={r._go ? () => router.push(r._go as never) : undefined}>
              <Card style={{ padding: 10 }}>
                <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 4 }}>{fmt(res.cols[0], r[res.cols[0].k])}</Text>
                {res.cols.slice(1).map((c) => <View key={c.k} style={{ flexDirection: 'row' }}><Text style={{ flex: 1, color: base.slate, fontSize: 12.5 }}>{c.l}</Text><Text style={{ color: base.ink, fontSize: 12.5 }}>{fmt(c, r[c.k])}</Text></View>)}
              </Card>
            </Pressable>
          ))}
          {res.totals ? <Card>{res.cols.map((c) => { const t = tot(c); return t !== null ? <View key={c.k} style={{ flexDirection: 'row' }}><Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{c.l}</Text><Text style={{ fontWeight: '800', color: base.ink }}>{money(t)}</Text></View> : null; })}</Card> : null}
        </View>
      )}
      {res?.note ? <Muted style={{ marginTop: 8 }}>{res.note}</Muted> : null}
    </FinPage>
  );
}
