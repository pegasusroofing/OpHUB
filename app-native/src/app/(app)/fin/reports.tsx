// Finance › Reports (913): pick a report, set the projects, project and
// dates; shown as a table on a computer and as cards on a phone, with totals.
// Excel / PDF downloads of reports are still in the current app.
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { FinChip, FinPage } from '@/components/FinNav';
import { pickJob } from '@/components/FinSales';
import { Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { finStatus, loadSettings, selectAll } from '@/data/finance';
import { loadBook } from '@/data/finBook';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { REPORT_GROUPS, REPORTS, type Col, type Filters } from '@/lib/finReports';
import { fdate, jobTag, money } from '@/lib/rules/finance';
import { base, radius } from '@/theme/theme';

type Row = Record<string, any>;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 8, color: base.ink, backgroundColor: base.card };
const fmt = (c: Col, v: unknown) => (v === null || v === undefined || v === '' ? '—' : c.money ? money(v) : c.pct ? `${Math.round(Number(v) * 10) / 10}%` : c.date ? fdate(String(v)) : String(v));

export default function FinReports() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const rep = REPORTS.find((r) => r.id === id);
  if (!rep) return (
    <FinPage title="Reports" section="reports">
      <Muted style={{ marginBottom: 10 }}>Pick a report, then set the projects and dates.</Muted>
      {Object.keys(REPORT_GROUPS).map((g) => (
        <View key={g}>
          <SectionTitle>{REPORT_GROUPS[g]}</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {REPORTS.filter((r) => r.group === g).map((r) => (
              <Pressable key={r.id} onPress={() => router.setParams({ id: r.id })} style={{ flexBasis: 260, flexGrow: 1, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, padding: 12 }}>
                <Text style={{ fontWeight: '800', color: base.ink }}>{r.title}</Text><Text style={{ color: base.slate, fontSize: 12.5 }}>{r.desc}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </FinPage>
  );
  return <Report key={rep.id} id={rep.id} />;
}

function Report({ id }: { id: string }) {
  const rep = REPORTS.find((r) => r.id === id)!;
  const { me } = useAuth();
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
  return (
    <FinPage title={rep.title} section="reports" wide>
      <Pressable onPress={() => router.setParams({ id: '' })}><Text style={{ color: base.blue, marginBottom: 6 }}>‹ All reports</Text></Pressable>
      <Muted style={{ marginBottom: 8 }}>{rep.desc}</Muted>
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
      <Muted style={{ marginTop: 6 }}>Excel and PDF downloads of reports are still in the current app.</Muted>
    </FinPage>
  );
}
