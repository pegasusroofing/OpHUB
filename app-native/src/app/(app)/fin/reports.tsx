// Finance › Reports (913): pick a report, set the projects, project and
// dates; shown as a table on a computer and as cards on a phone, with totals.
// Excel / PDF downloads of each report (finExportExcel / report PDF).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { ThinExportBar } from '@/components/FinFilterBar';
import { FinPage } from '@/components/FinNav';
import { pickJob } from '@/components/FinSales';
import { useToast } from '@/components/toast';
import { OphIcon } from '@/components/OphIcon';
import { SelectBox } from '@/components/SelectBox';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { DateBox } from '@/components/DateField';
import { fdb, finStatus, loadSettings, selectAll } from '@/data/finance';
import { listFolders, type OdFolder } from '@/data/onedrive';
import { invokeAsUser } from '@/lib/userFunctions';
import { loadBook } from '@/data/finBook';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { AUTO_RUN_REPORTS, REPORT_GROUPS, REPORTS, type Col, type Filters } from '@/lib/finReports';
import { fdate, jobTag, money } from '@/lib/rules/finance';
import { exportTableExcel, exportTablePdf, type Table } from '@/lib/tableExport';
import { base, radius } from '@/theme/theme';

type Row = Record<string, any>;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, color: base.ink, backgroundColor: base.card };
const cw = (c: Col) => (c.money || c.num || c.pct ? { width: 110 } : { flexGrow: 1, flexBasis: 150, minWidth: 110 });
const fmt = (c: Col, v: unknown) => (v === null || v === undefined || v === '' ? '—' : c.money ? money(v) : c.pct ? `${Math.round(Number(v) * 10) / 10}%` : c.date ? fdate(String(v)) : String(v));

export default function FinReports() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const rep = REPORTS.find((r) => r.id === id);
  const { width } = useWindowDimensions();
  // Every report in view, one tight row each, under a plain heading (Andy, 2 Nov 2026). On a laptop the description sits beside the name.
  const sideBySide = width >= 760;
  if (!rep) return (
    <FinPage title="Reports" section="reports">
      {Object.keys(REPORT_GROUPS).map((g) => (
        <View key={g} style={{ marginBottom: 14 }}>
          <Text style={{ fontWeight: '800', fontSize: 14, color: base.ink, marginBottom: 5 }}>{REPORT_GROUPS[g]}</Text>
          <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            {REPORTS.filter((r) => r.group === g).map((r, i) => (
              <Pressable key={r.id} onPress={() => router.setParams({ id: r.id })} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: i ? 1 : 0, borderTopColor: '#EEF0F2', paddingVertical: 8, paddingHorizontal: 12 }, pressed && { backgroundColor: '#F8F9FB' }]}>
                <View style={{ flex: 1, flexDirection: sideBySide ? 'row' : 'column', alignItems: sideBySide ? 'center' : 'stretch', gap: sideBySide ? 12 : 1 }}>
                  <Text style={{ fontWeight: '700', color: base.ink, fontSize: 14, width: sideBySide ? 240 : undefined }}>{r.title}</Text>
                  <Text style={{ flex: sideBySide ? 1 : undefined, color: '#4B5563', fontSize: 13 }}>{r.desc}</Text>
                </View>
                <OphIcon name="chevron" size={15} color={base.slate} />
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
  const table = (): Table | null => (res ? { title: rep.title, sub: [f.job ? jobTag(sites.find((s) => s.id === f.job)) : rep.filters.includes('status') ? `${f.status} projects` : '', f.from || f.to ? `${f.from ? fdate(f.from) : 'start'} to ${f.to ? fdate(f.to) : 'today'}` : ''].filter(Boolean).join(' · '), cols: res.cols.map((c) => ({ l: c.l, money: c.money, num: c.num || c.pct })), boldRows: res.rows.flatMap((r, i) => (r._head || r._bold ? [i] : [])), rows: res.rows.map((r) => res.cols.map((c) => (c.money ? ((r._head || r._bold) && r[c.k] == null ? null : Number(r[c.k]) || 0) : c.pct ? (r[c.k] == null ? null : Math.round(Number(r[c.k]) * 10) / 10) : c.date ? (r[c.k] ? fdate(String(r[c.k])) : '') : r[c.k] == null ? '' : String(r[c.k])))), totals: res.totals ? res.cols.map((c, i) => (i === 0 ? 'Total' : tot(c))) : undefined } : null);
  const download = async (k: 'x' | 'p') => { const t = table(); if (!t || !t.rows.length) { toast('Nothing to export.'); return; } setBusy(k); const ok = await (k === 'x' ? exportTableExcel(t, org) : exportTablePdf(t, org)).catch(() => false); setBusy(''); if (!ok) toast('Could not make the file — try again.'); };
  return (
    <FinPage title={rep.title} section="reports" wide foot={res?.rows.length ? <ThinExportBar busy={busy} onExcel={() => download('x')} onPdf={() => download('p')} /> : null}>
      <Pressable onPress={() => router.setParams({ id: '' })}><Text style={{ color: base.blue, marginBottom: 6 }}>‹ All reports</Text></Pressable>
      <Text style={{ color: '#4B5563', fontSize: 13, marginBottom: 8 }}>{rep.desc}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        {has('status') && <SelectBox compact title="Projects" value={f.status} options={[['live', 'Live'], ['upcoming', 'Upcoming'], ['closed', 'Closed'], ['all', 'All']]} onChange={(k) => setF({ ...f, status: k })} style={{ width: 110, marginBottom: 0 }} />}
        {has('job') && <Pressable onPress={async () => { const k = await pickJob('Project', sites); setF({ ...f, job: k || '' }); }} style={box}><Text style={{ color: base.ink, fontSize: 12 }}>{f.job ? jobTag(sites.find((s) => s.id === f.job)) : 'All projects'} ▾</Text></Pressable>}
        {has('dates') && <><DateBox value={f.from} onChange={(v) => setF({ ...f, from: v })} compact placeholder="From" title="From" style={{ width: 120 }} /><DateBox value={f.to} onChange={(v) => setF({ ...f, to: v })} compact placeholder="To" title="To" style={{ width: 120 }} /></>}
        {has('opening') && <TextInput value={f.opening} onChangeText={(v) => setF({ ...f, opening: v })} placeholder="Opening bank balance £" keyboardType="decimal-pad" style={[box, { width: 180, fontSize: 12 }]} />}
        {has('varstatus') && <SelectBox compact title="Variation status" value={f.varstatus || 'any'} options={[['any', 'Any status'], ['instructed', 'Instructed'], ['priced', 'Priced'], ['submitted', 'Submitted'], ['agreed', 'Agreed'], ['rejected', 'Rejected']]} onChange={(k) => setF({ ...f, varstatus: k === 'any' ? '' : k })} style={{ width: 130, marginBottom: 0 }} />}
        {has('postatus') && <SelectBox compact title="PO status" value={f.postatus || 'any'} options={[['any', 'Any PO'], ['open', 'Open'], ['invoiced', 'Invoiced'], ['cancelled', 'Cancelled']]} onChange={(k) => setF({ ...f, postatus: k === 'any' ? '' : k })} style={{ width: 130, marginBottom: 0 }} />}
        {AUTO_RUN_REPORTS.includes(id) && <AutoRun id={id} title={rep.title} />}
      </View>
      {isLoading || !res ? <Muted>Working it out…</Muted> : !res.rows.length ? <Empty>Nothing to show.</Empty> : wide ? (
        <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ flexGrow: 1 }}>
            <View style={{ flexDirection: 'row', backgroundColor: '#EEF0F2', borderRadius: 6, paddingVertical: 6 }}>{res.cols.map((c) => <Text key={c.k} style={{ ...cw(c), fontWeight: '800', color: base.ink, fontSize: 13, textAlign: c.money || c.num || c.pct ? 'right' : 'left', paddingHorizontal: 4 }}>{c.l}</Text>)}</View>
            {res.rows.map((r, i) => (
              <Pressable key={i} onPress={r._go ? () => router.push(r._go as never) : undefined} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#EEF0F2', paddingVertical: 6 }}>
                {res.cols.map((c) => <Text key={c.k} style={{ ...cw(c), fontWeight: r._head || r._bold ? '800' : '400', color: Number(r[c.k]) < 0 && c.money ? '#C0392B' : base.ink, fontSize: 13.5, textAlign: c.money || c.num || c.pct ? 'right' : 'left', paddingHorizontal: 4 }}>{r._head || r._bold ? (r[c.k] == null ? '' : fmt(c, r[c.k])) : fmt(c, r[c.k])}</Text>)}
              </Pressable>
            ))}
            {res.totals ? <View style={{ flexDirection: 'row', borderTopWidth: 2, borderColor: base.ink, paddingVertical: 5 }}>{res.cols.map((c, i) => { const t = tot(c); return <Text key={c.k} style={{ ...cw(c), fontWeight: '800', color: base.ink, fontSize: 13.5, textAlign: c.money || c.num || c.pct ? 'right' : 'left', paddingHorizontal: 4 }}>{i === 0 ? `Total (${res.rows.length})` : t !== null ? money(t) : ''}</Text>; })}</View> : null}
          </View>
        </ScrollView>
      ) : (
        <View>
          {res.rows.map((r, i) => r._head ? <Text key={i} style={{ fontWeight: '800', fontSize: 14, color: base.ink, marginTop: 8, marginBottom: 5 }}>{String(r[res.cols[0].k])}</Text> : r._bold ? (
            <View key={i} style={{ flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 6, marginBottom: 6, backgroundColor: '#EEF0F2', borderRadius: 8 }}>
              <Text style={{ flex: 1, fontWeight: '800', color: base.ink }}>{res.cols.map((c) => (c.money ? '' : r[c.k] || '')).join('')}</Text>
              <Text style={{ fontWeight: '800', color: base.ink }}>{res.cols.filter((c) => c.money).map((c) => fmt(c, r[c.k])).join(' ')}</Text>
            </View>
          ) : (
            <Pressable key={i} onPress={r._go ? () => router.push(r._go as never) : undefined}>
              <Card style={{ padding: 10 }}>
                <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 4 }}>{fmt(res.cols[0], r[res.cols[0].k])}</Text>
                {res.cols.slice(1).map((c) => <View key={c.k} style={{ flexDirection: 'row' }}><Text style={{ flex: 1, color: '#4B5563', fontSize: 13 }}>{c.l}</Text><Text style={{ color: Number(r[c.k]) < 0 && c.money ? '#C0392B' : base.ink, fontWeight: '700', fontSize: 13 }}>{fmt(c, r[c.k])}</Text></View>)}
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

// Auto-run (Andy, 2 Nov 2026): how often the report saves itself, and which OneDrive folder it goes in.
// The server function finance-report-run does the saving, from 6am UK time.
const FREQ: [string, string][] = [['off', 'Off'], ['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month']];
const WEEKDAYS: [string, string][] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d, i) => [String(i + 1), d]);
const MONTH_DAYS: [string, string][] = Array.from({ length: 28 }, (_, i) => [String(i + 1), String(i + 1)]);
function AutoRun({ id, title }: { id: string; title: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ['finReportSchedule', me?.org_id, id];
  const { data: sc } = useQuery({ queryKey: key, enabled: !!me, queryFn: async () => (await fdb.from('fin_report_schedules').select('*').eq('org_id', me?.org_id as string).eq('report_id', id).maybeSingle()).data as Row | null });
  const [open, setOpen] = useState(false);
  const [freq, setFreq] = useState('off'), [day, setDay] = useState('1');
  const [folder, setFolder] = useState<{ id: string; name: string; driveId?: string | null } | null>(null);
  const [trail, setTrail] = useState<OdFolder[]>([]), [choosing, setChoosing] = useState(false), [busy, setBusy] = useState('');
  const here = trail[trail.length - 1] ?? null;
  const { data: level, isLoading } = useQuery({ queryKey: ['reportFolders', here?.id ?? 'root', here?.driveId ?? ''], enabled: open && choosing, queryFn: () => listFolders(here) });
  if (!me || !['admin', 'pm'].includes(me.role)) return null;
  const on = !!sc?.active;
  const label = on ? `Auto-run: ${FREQ.find(([k]) => k === sc?.frequency)?.[1] || 'On'}` : 'Auto-run: Off';
  const start = () => { setFreq(on ? String(sc?.frequency) : 'off'); setDay(String(sc?.run_day || 1)); setFolder(sc?.folder_id ? { id: sc.folder_id, name: sc.folder_name || 'Chosen folder', driveId: sc.drive_id } : null); setTrail([]); setChoosing(false); setOpen(true); };
  const save = async () => {
    if (freq !== 'off' && !folder) { toast('Choose the OneDrive folder first.'); return null; }
    setBusy('save');
    const r = await fdb.from('fin_report_schedules').upsert({ org_id: me.org_id, report_id: id, active: freq !== 'off', frequency: freq === 'off' ? String(sc?.frequency || 'monthly') : freq, run_day: Number(day) || 1, folder_id: folder?.id ?? null, folder_name: folder?.name ?? null, drive_id: folder?.driveId ?? null, updated_by: me.id, updated_at: new Date().toISOString() } as never, { onConflict: 'org_id,report_id' }).select('id').maybeSingle();
    setBusy('');
    if (r.error || !r.data) { toast('Not saved — try again.'); return null; }
    void qc.invalidateQueries({ queryKey: key });
    return (r.data as { id: string }).id;
  };
  return (
    <>
      <Pressable accessibilityRole="button" onPress={start} style={box}><Text style={{ color: base.ink, fontSize: 12 }}>{label} ▾</Text></Pressable>
      {!!sc?.last_run_at && <Text style={{ fontSize: 12, color: sc.last_ok ? '#4B5563' : '#C0392B' }}>{sc.last_ok ? 'Last saved' : 'Last try failed'} {fdate(String(sc.last_run_at).slice(0, 10))}{sc.last_ok ? '' : `: ${sc.last_message || ''}`}</Text>}
      {open && (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
            <Pressable onPress={() => {}} style={{ backgroundColor: base.card, borderRadius: 14, padding: 16, width: '100%', maxWidth: 440, maxHeight: '90%', alignSelf: 'center' }}>
              <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                <Text style={{ flex: 1, fontWeight: '800', fontSize: 16, color: base.ink }}>Auto-run {title}</Text>
                <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}><Text style={{ fontSize: 18, color: base.slate, fontWeight: '700' }}>✕</Text></Pressable>
              </View>
              <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
                <SelectBox label="How often" title="How often" value={freq} options={FREQ} onChange={setFreq} />
                {freq === 'weekly' && <SelectBox label="Which day" title="Which day" value={day} options={WEEKDAYS} onChange={setDay} />}
                {freq === 'monthly' && <SelectBox label="Day of the month" title="Day of the month" value={day} options={MONTH_DAYS} onChange={setDay} />}
                <Text style={{ fontSize: 12, fontWeight: '700', color: base.slate, marginBottom: 4 }}>Save to OneDrive folder</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Save to OneDrive folder" onPress={() => setChoosing(!choosing)} style={{ flexDirection: 'row', borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: folder ? base.ink : base.slateLight }}>{folder?.name || 'Choose a folder'}</Text><Text style={{ color: base.slate, fontSize: 12 }}>▾</Text>
                </Pressable>
                {choosing && (
                  <View style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 8, marginBottom: 8 }}>
                    <Text style={{ fontSize: 12.5, color: '#4B5563', marginBottom: 4 }}>{['OneDrive', ...trail.map((t) => t.name)].join(' › ')}</Text>
                    {!!here && <Pressable onPress={() => setTrail(trail.slice(0, -1))} style={{ paddingVertical: 6 }}><Text style={{ color: base.blue, fontWeight: '700' }}>‹ Back</Text></Pressable>}
                    {isLoading ? <Muted>Loading…</Muted> : level?.error ? <Muted style={{ color: base.warn }}>{level.error}</Muted> : !level?.folders.length ? <Muted>No folders in here.</Muted> : level.folders.map((x) => (
                      <Pressable key={x.id} onPress={() => setTrail([...trail, { ...x, driveId: x.driveId || here?.driveId }])} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
                        <Text numberOfLines={1} style={{ flex: 1, color: base.ink }}>{x.name}</Text><OphIcon name="chevron" size={14} color={base.slate} />
                      </Pressable>
                    ))}
                    {!!here && !here.virtual && !here.isSite && <View style={{ marginTop: 6 }}><Button small title={`Use ${here.name}`} onPress={() => { setFolder({ id: here.id, name: here.name, driveId: here.driveId }); setChoosing(false); }} /></View>}
                  </View>
                )}
                <Muted style={{ fontSize: 12, marginBottom: 10 }}>Saves as Excel from 6am UK time, with the date in the file name. Older copies stay in the folder.</Muted>
              </ScrollView>
              <View style={{ gap: 8 }}>
                <Button busy={busy === 'save'} title="Save" onPress={async () => { if (await save()) { toast(freq === 'off' ? 'Auto-run off' : 'Auto-run saved'); setOpen(false); } }} />
                {!!folder && <Button kind="ghost" busy={busy === 'run'} title="Save and run now" onPress={async () => {
                  const sid = await save(); if (!sid) return;
                  setBusy('run'); const r = await invokeAsUser<{ ok?: boolean; message?: string; error?: string }>('finance-report-run', { schedule_id: sid }); setBusy('');
                  toast(r.data?.message || r.data?.error || r.error || 'Could not run it — try again.'); void qc.invalidateQueries({ queryKey: key }); setOpen(false);
                }} />}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  );
}
