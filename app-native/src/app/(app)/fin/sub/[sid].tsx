// A subcontractor PO (912 renderFinSubcontract / openFinSubApp): the order
// (name, work, value, retention, CIS, UTR), its applications — record one,
// certify it (retention, contra charges, CIS on labour, pay less), mark paid
// (which records the CIS payment first). "new" takes ?site=. A new order can start from your workers
// list (People & rates — the worker is linked), have priced lines, and go into the project's Price file
// as an issued price sheet for the PM (912 finScSheetBlockHtml / finScSyncSheet).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { FinRow, FinStat } from '@/components/FinNav';
import { confirmAsk, useToast } from '@/components/toast';
import { SelectBox } from '@/components/SelectBox';
import { Button, Card, Check, Muted, SectionTitle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { DateBox } from '@/components/DateField';
import { fdb, insertNumbered, loadSettings } from '@/data/finance';
import { openDocLink } from '@/data/hs';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { cisStatement } from '@/lib/finCisPdf';
import { supabase } from '@/lib/supabase';
import { buildSubNoticePdf } from '@/lib/finSubNoticePdf';
import { deliverPdf } from '@/lib/pdf';
import { addDays, fdate, jobTag, money, num, round2, today } from '@/lib/rules/finance';
import { subAppCalc } from '@/lib/rules/finSubs';
import { base, page, space } from '@/theme/theme';

type Row = Record<string, any>;

export default function FinSubcontract() {
  const { sid, site, app } = useLocalSearchParams<{ sid: string; site?: string; app?: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const [edit, setEdit] = useState(sid === 'new');
  const [appEdit, setAppEdit] = useState<Row | 'new' | null>(null);
  // New order: from the workers list, priced lines, and into the project's Price file (912).
  const [pre, setPre] = useState<Row | null>(null);
  const [lines, setLines] = useState<{ name: string; qty: string; unit: string; rate: string }[]>([]);
  const [toSheet, setToSheet] = useState(true);
  const [tile, setTile] = useState('');
  const { data: workers = [] } = useQuery({ queryKey: ['finWorkers', me?.org_id], enabled: !!me && sid === 'new', queryFn: async () => (((await fdb.from('fin_labour_rates').select('*').eq('org_id', me?.org_id as string)).data as Row[] | null) ?? []).filter((w) => !w.user_id && w.active !== false) });
  const { data: tiles = [] } = useQuery({ queryKey: ['finTiles', site], enabled: !!site && sid === 'new', queryFn: async () => ((await fdb.from('pricing_elements').select('id,name').eq('site_id', site as string).eq('closed', false).order('sort_order')).data as Row[] | null) ?? [] });
  const { data, isLoading } = useQuery({ queryKey: ['finSub', sid], enabled: sid !== 'new', queryFn: async () => {
    const [sc, apps] = await Promise.all([fdb.from('fin_subcontracts').select('*').eq('id', sid).maybeSingle(), fdb.from('fin_sub_apps').select('*').eq('subcontract_id', sid).order('number')]);
    return { sc: sc.data as Row | null, apps: (apps.data as Row[] | null) ?? [] };
  } });
  if (!me) return null;
  if (sid !== 'new' && isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const sc = data?.sc || null, apps = data?.apps || [];
  if (sid !== 'new' && !sc) return <Muted style={{ padding: space.l }}>Subcontractor PO not found.</Muted>;
  const refresh = () => ['finSub', 'finSubs', 'finBook'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  const lastCert = apps.filter((a) => a.certified_gross != null).pop();
  const openApp = app && !appEdit ? apps.find((a) => a.id === app) : null;
  const cur = appEdit && appEdit !== 'new' ? appEdit : openApp || null;
  const showApp = !!appEdit || !!openApp;
  const ctx = (a: Row | null) => {
    const before = apps.filter((x) => x.number < (a ? a.number : 1e9)), certs = before.filter((x) => x.certified_gross != null), pc = certs[certs.length - 1];
    return { prevNet: round2(certs.reduce((t, x) => t + Number(x.net_due || 0), 0)), prevM: pc ? Number(pc.materials_part || 0) : 0, prevContra: pc ? Number(pc.contra || 0) : 0, prevApplied: before.length ? Number(before[before.length - 1].applied_gross || 0) : 0 };
  };
  const markPaid = async (a: Row) => {
    // Record the CIS payment first — the CIS return reads it. Then mark the application paid.
    const have = await fdb.from('fin_sub_payments').select('id').eq('sub_app_id', a.id).neq('status', 'void').limit(1);
    if (have.error) { toast('Couldn’t check the CIS record — check your signal and try again.'); return; }
    const paidOn = a.paid_on || today();
    if (!((have.data as Row[]) || []).length) {
      const prev = apps.filter((x) => x.number < a.number && x.certified_gross != null).pop();
      const materials = Math.max(0, round2(Number(a.materials_part || 0) - Number(prev?.materials_part || 0)));
      const contraNow = round2(Number(a.contra || 0) - Number(prev?.contra || 0)), gross = round2(Number(a.net_due) + contraNow), labour = Math.max(0, round2(gross - materials));
      const ins = await fdb.from('fin_sub_payments').insert({ org_id: me.org_id, worker_id: sc!.worker_id || null, name: sc!.name, utr: sc!.utr || null, sub_app_id: a.id, period_start: a.app_date, period_end: a.app_date, lines: [{ site_id: a.site_id, description: `${sc!.number} application ${a.number}`, days: 1, rate: labour, amount: labour }], labour, materials, gross, cis_rate: sc!.cis_rate, cis_deduction: Number(a.cis_deduction), net_pay: Number(a.pay_amount), status: 'paid', paid_on: paidOn, created_by: me.id, contra: contraNow || 0 } as never);
      if (ins.error) { toast('Not marked paid — the CIS record didn’t save. Please try again.'); return; }
    }
    if (a.status !== 'paid' && !(await fdb.from('fin_sub_apps').update({ status: 'paid', paid_on: paidOn } as never).eq('id', a.id).select('id')).data?.length) { toast('The CIS record is saved, but the application couldn’t be marked paid — try again.'); return; }
    toast('Marked paid — added to the CIS return'); setAppEdit(null); refresh();
  };
  return (
    <ScrollView contentContainerStyle={page(900)}>
      <Stack.Screen options={{ title: sc ? `${sc.number} · ${sc.name}` : 'New subcontractor PO' }} />
      {sc && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <FinStat v={sc.order_value != null ? money(sc.order_value) : '—'} label="Order value" /><FinStat v={money(lastCert?.certified_gross || 0)} label="Certified to date" />
            <FinStat v={money(apps.filter((a) => a.status === 'certified').reduce((t, a) => t + Number(a.pay_amount || 0), 0))} label="Certified, to pay" /><FinStat v={sc.status === 'complete' ? 'Complete' : 'Active'} label="Status" />
          </View>
          <Card>
            <FinRow title="Project" right={jobTag(sites.find((s) => s.id === sc.site_id))} onPress={() => router.push(`/fin/job/${sc.site_id}` as never)} />
            <FinRow title="Work" right={sc.description || '—'} /><FinRow title="Retention" right={`${sc.retention_pct ?? 0}%`} /><FinRow title="CIS" right={`${sc.cis_rate ?? 20}%${sc.utr ? ` · UTR ${sc.utr}` : ''}`} />
            {sc.email && <FinRow title="Email" right={sc.email} />}
            <View style={{ marginTop: 8 }}><Button kind="ghost" title="Edit order" onPress={() => setEdit(true)} /></View>
          </Card>
          <SectionTitle>Applications</SectionTitle>
          {apps.length ? apps.slice().reverse().map((a) => <FinRow key={a.id} left={`No. ${a.number}`} title={fdate(a.app_date)} sub={[`applied ${money(a.applied_gross)}`, a.certified_gross != null ? `certified ${money(a.certified_gross)}` : '', a.final_date ? `pay by ${fdate(a.final_date)}` : '', a.status === 'paid' ? 'Paid' : a.status === 'certified' ? 'Certified' : 'To certify', a.payless ? 'Pay less' : ''].filter(Boolean).join(' · ')} right={a.certified_gross != null ? money(a.pay_amount) : '—'} tone={a.status !== 'paid' && a.final_date && a.final_date < today() ? '#C0392B' : undefined} onPress={() => setAppEdit(a)} />) : <Muted>No applications yet.</Muted>}
          {sc.status !== 'complete' && <Button title="+ Record an application" onPress={() => setAppEdit('new')} />}
          {apps.some((a) => a.certified_gross != null) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>{apps.filter((a) => a.certified_gross != null).slice(-4).reverse().map((a) => <Button key={a.id} kind="ghost" title={`📄 ${a.payless ? 'Pay less' : 'Payment'} notice — No. ${a.number}`} onPress={async () => { try { const bytes = await buildSubNoticePdf(a, sc, sites.find((x) => x.id === a.site_id) as Row | undefined, await loadSettings(me.org_id), org, me.name || ''); if (!(await deliverPdf(bytes, `${a.payless ? 'Pay less notice' : 'Payment notice'} - ${sc.number} app ${a.number}.pdf`))) toast('Could not make the PDF — try again.'); } catch { toast('Could not build the notice.'); } }} />)}</View>}
          <Muted style={{ marginTop: 8 }}>Emailing the notice is off during the Finance trial.</Muted>
        </>
      )}
      {edit && (
        <FinForm key={pre?.id || 'none'} title={sc ? `Edit ${sc.number}` : 'New subcontractor PO'} initial={sc || (pre ? { name: pre.trading_name || pre.name, email: pre.email, utr: pre.utr, cis_rate: String(pre.cis_rate ?? 20), vat_registered: !!pre.vat_registered, retention_pct: 5, order_value: linesTotal(lines) ?? '' } : { retention_pct: 5, cis_rate: 20 })} onClose={() => { setEdit(false); if (!sc) router.back(); }}
          extra={sc ? undefined : (
            <View style={{ marginBottom: 8 }}>
              {workers.length > 0 && <SelectBox label="From your workers list (optional)" value={pre?.id || ''} options={[['', '—'], ...workers.map((w) => [w.id, w.trading_name || w.name || 'Worker'] as [string, string])]} onChange={(k) => setPre(workers.find((w) => w.id === k) || null)} />}
              <Check label="Add to the project’s Price file for the PM (an issued price sheet)" value={toSheet} onChange={setToSheet} />
              {toSheet && (
                <View>
                  <SelectBox label="Price tile" value={tile} options={[['', 'New tile named after the work'], ...tiles.map((t) => [t.id, t.name] as [string, string])]} onChange={setTile} />
                  <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Lines (optional — otherwise one line for the order value)</Muted>
                  {lines.map((l, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                      <TextInput value={l.name} onChangeText={(t) => setLines(lines.map((x, j) => (j === i ? { ...x, name: t } : x)))} placeholder="Item" style={[lbox, { flex: 1 }]} />
                      <TextInput value={l.qty} onChangeText={(t) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: t.replace(/[^0-9.]/g, '') } : x)))} placeholder="Qty" keyboardType="decimal-pad" style={[lbox, { width: 54 }]} />
                      <TextInput value={l.unit} onChangeText={(t) => setLines(lines.map((x, j) => (j === i ? { ...x, unit: t } : x)))} placeholder="Unit" style={[lbox, { width: 54 }]} />
                      <TextInput value={l.rate} onChangeText={(t) => setLines(lines.map((x, j) => (j === i ? { ...x, rate: t.replace(/[^0-9.]/g, '') } : x)))} placeholder="Rate £" keyboardType="decimal-pad" style={[lbox, { width: 70 }]} />
                      <Pressable hitSlop={8} onPress={() => setLines(lines.filter((_, j) => j !== i))}><Text style={{ color: base.slate, fontWeight: '700' }}>✕</Text></Pressable>
                    </View>
                  ))}
                  <Button small kind="ghost" title="+ Add a line" onPress={() => setLines([...lines, { name: '', qty: '1', unit: 'item', rate: '' }])} />
                  {linesTotal(lines) != null && <Muted style={{ marginTop: 4 }}>Lines total {money(linesTotal(lines) as number)} — used as the order value.</Muted>}
                </View>
              )}
            </View>
          )}
          fields={[
            { k: 'name', label: 'Subcontractor' }, { k: 'email', label: 'Email', kind: 'email' }, { k: 'description', label: 'Work', kind: 'multiline' },
            { k: 'order_value', label: 'Order value £', kind: 'money', half: true }, { k: 'retention_pct', label: 'Retention %', kind: 'number', half: true },
            { k: 'cis_rate', label: 'CIS rate', kind: 'choice', options: [['0', '0% (gross)'], ['20', '20% (registered)'], ['30', '30% (not registered)']], half: true }, { k: 'utr', label: 'UTR', half: true },
            { k: 'vat_registered', label: 'VAT registered', kind: 'check' }, ...(sc ? [{ k: 'status', label: 'Status', kind: 'choice', options: [['active', 'Active'], ['complete', 'Complete']] }] as never[] : []),
          ]}
          onSave={async (v) => {
            const name = String(v.name).trim(); if (!name) return 'Enter the subcontractor’s name.';
            const ret = num(v.retention_pct); if (ret === null || isNaN(ret) || ret < 0 || ret > 20) return 'Retention should be between 0 and 20%.';
            const lt = sc ? null : linesTotal(lines);
            const val = lt != null ? lt : num(v.order_value);
            const row: Row = { name, email: String(v.email).trim() || null, description: String(v.description).trim() || null, order_value: val === null || isNaN(val) ? null : round2(val), retention_pct: ret, cis_rate: Number(v.cis_rate || 20), utr: String(v.utr).trim() || null, vat_registered: !!v.vat_registered, ...(!sc && pre ? { worker_id: pre.id } : {}) };
            if (sc && v.status) row.status = v.status;
            if (sc) { if (!(await fdb.from('fin_subcontracts').update(row as never).eq('id', sc.id).select('id')).data?.length) return 'Could not save.'; toast('Subcontractor PO saved'); refresh(); return null; }
            const r = await insertNumbered('fin_subcontracts', { col: 'site_id', val: site || '' }, (s) => `SC-${String(s).padStart(3, '0')}`, { ...row, org_id: me.org_id, site_id: site, created_by: me.id });
            if (!r) return 'Could not save — try again.';
            if (toSheet && site) { const e = await orderToSheet(me, site, { ...row, id: r.id }, lines, tile, pre); if (e) toast(e); }
            refresh(); router.replace(`/fin/sub/${r.id}` as never); return null;
          }} />
      )}
      {showApp && sc && <AppForm sc={sc} a={cur} ctx={ctx(cur)} nextNo={(apps[apps.length - 1]?.number || 0) + 1} onClose={() => { setAppEdit(null); if (openApp) router.setParams({ app: '' }); }} onSaved={refresh} onPaid={markPaid} />}
    </ScrollView>
  );
}

function AppForm({ sc, a, ctx, nextNo, onClose, onSaved, onPaid }: { sc: Row; a: Row | null; ctx: { prevNet: number; prevM: number; prevContra: number; prevApplied: number }; nextNo: number; onClose: () => void; onSaved: () => void; onPaid: (a: Row) => Promise<void> }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const [v, setV] = useState<Row>({ app_date: a?.app_date || today(), final_date: a?.final_date || addDays(a?.app_date || today(), 30), applied: String(a?.applied_gross ?? ''), mat: String(a?.materials_part ?? ctx.prevM ?? 0), cert: a?.certified_gross != null ? String(a.certified_gross) : '', contra: String(a?.contra ?? ctx.prevContra ?? 0), reason: a?.payless_reason || a?.contra_note || '' });
  const [busy, setBusy] = useState(false);
  // Their application (PDF / photo), kept with it (912).
  const [file, setFile] = useState<{ uri: string; name: string; mimeType?: string | null } | null>(null);
  if (!me) return null;
  const locked = a?.status === 'paid';
  const n = (k: string) => { const x = num(v[k]); return x === null || isNaN(x) ? null : x; };
  const c = subAppCalc({ applied: n('applied') || 0, mat: n('mat') || 0, cert: n('cert'), contra: n('contra') || 0, retentionPct: Number(sc.retention_pct || 0), cisRate: Number(sc.cis_rate || 0), ...ctx });
  const save = async (certify: boolean) => {
    if (!c.applied) { toast('Enter the amount applied for.'); return; }
    if (certify && c.cert === null) { toast('Enter the certified amount.'); return; }
    const row: Row = { app_date: v.app_date || today(), final_date: v.final_date || null, applied_gross: round2(c.applied), materials_part: round2(c.mat) };
    if (certify && 'net' in c) Object.assign(row, { certified_gross: round2(c.cert as number), retention: c.retention, contra: round2(c.contra as number), contra_note: v.reason || null, previous: ctx.prevNet, net_due: c.net, cis_deduction: c.cis, pay_amount: c.pay, status: 'certified', payless: !!c.payless, payless_reason: c.payless ? v.reason || null : null, notice_on: today() }); // 912: the notice is dated when certified
    setBusy(true);
    try {
      if (file) {
        const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
        const up = await supabase.storage.from('finance-docs').upload(`${me.org_id}/${sc.site_id}/subcontract/${rid}-${file.name.replace(/[^a-z0-9.-]+/gi, '_').slice(-80)}`, await (await fetch(file.uri)).arrayBuffer(), { contentType: file.mimeType || 'application/octet-stream' });
        if (!up.error) { row.file_path = up.data.path; row.file_name = file.name; }
      }
      const ok = a ? !!(await fdb.from('fin_sub_apps').update(row as never).eq('id', a.id).select('id')).data?.length : !(await fdb.from('fin_sub_apps').insert({ ...row, org_id: me.org_id, site_id: sc.site_id, subcontract_id: sc.id, number: nextNo, status: certify ? 'certified' : 'received', created_by: me.id } as never)).error;
      if (!ok) { toast('Could not save — try again.'); return; }
      toast(certify && 'pay' in c ? `Certified — ${money(c.pay)} to pay` : 'Application saved'); onSaved(); onClose();
    } finally { setBusy(false); }
  };
  const box = { borderWidth: 1, borderColor: base.line, borderRadius: 8, padding: 8, color: base.ink, backgroundColor: base.card };
  const f = (k: string, l: string) => (
    <View key={k} style={{ flexBasis: '47%', flexGrow: 1, marginBottom: 6 }}><Muted>{l}</Muted>{k.includes('date') ? <DateBox disabled={locked} value={String(v[k] ?? '')} onChange={(x) => setV({ ...v, [k]: x })} title={l} style={{ marginBottom: 8 }} /> : <TextInput editable={!locked} value={String(v[k] ?? '')} onChangeText={(x) => setV({ ...v, [k]: x })} keyboardType="decimal-pad" placeholder="£" style={box} />}</View>
  );
  return (
    <Card style={{ borderColor: base.ink, marginTop: 10 }}>
      <Text style={{ fontWeight: '800', fontSize: 16, color: base.ink }}>{sc.name} · application {a ? a.number : nextNo}</Text>
      <Muted style={{ marginBottom: 8 }}>All figures are to date (cumulative), excl. VAT. Last application: {money(ctx.prevApplied)} applied.</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 }}>
        {f('app_date', 'Application date')}{f('final_date', 'Final date for payment')}{f('applied', 'Applied for, gross to date £')}{f('mat', 'Of which materials to date £')}
        {f('cert', 'Certified gross to date £ (blank until checked)')}{f('contra', 'Contra charges to date £')}
      </View>
      <Muted>Contra / reason for paying less (shown on the notice)</Muted>
      <TextInput editable={!locked} value={v.reason} onChangeText={(x) => setV({ ...v, reason: x })} multiline style={[box, { minHeight: 50, marginBottom: 8 }]} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
        {!!a?.file_path && <Pressable onPress={async () => { const u = await openDocLink('finance-docs', a.file_path); if (u) viewDoc(u); }}><Text style={{ color: base.blue, fontWeight: '700' }}>📄 View {a.file_name || 'their application'}</Text></Pressable>}
        {!locked && <Pressable onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) setFile({ uri: r.assets[0].uri, name: r.assets[0].name || 'application.pdf', mimeType: r.assets[0].mimeType }); }}><Text style={{ color: base.blue }}>📎 {file ? file.name : a?.file_path ? 'Replace their application' : 'Attach their application (PDF / photo)'}</Text></Pressable>}
      </View>
      {c.cert === null || !('net' in c) ? <Muted>Enter the certified amount to see what to pay.</Muted> : (
        <View>
          <FinRow title="Certified gross to date" right={money(c.cert)} /><FinRow title={`Less retention @ ${sc.retention_pct || 0}%`} right={`−${money(c.retention)}`} />
          <FinRow title="Less contra charges to date" right={`−${money(c.contra)}`} /><FinRow title="Less paid before" right={`−${money(ctx.prevNet)}`} />
          <FinRow title="Net due this time" right={money(c.net)} /><FinRow title={`CIS @ ${sc.cis_rate}% on labour (${money(c.labour)})`} right={`−${money(c.cis)}`} />
          <FinRow title="Pay them" right={money(c.pay)} />
          {c.payless && <Text style={{ color: '#C0392B', marginTop: 4 }}>You&apos;re certifying {money(c.applied - (c.cert as number))} less than they applied for — this is a pay less notice, so give the reason above and send it before the final date for payment.</Text>}
        </View>
      )}
      <View style={{ gap: 8, marginTop: 10 }}>
        {!locked && <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button kind="ghost" busy={busy} title="Save as received" onPress={() => void save(false)} /></View><View style={{ flex: 1 }}><Button busy={busy} title="Certify" onPress={() => void save(true)} /></View></View>}
        {a?.status === 'certified' && <Button title="Mark paid today" onPress={async () => { if (await confirmAsk(`Mark application ${a.number} paid (${money(a.pay_amount)})? It's added to the CIS return.`, 'Mark paid')) await onPaid(a); }} />}
        {a?.status === 'received' && <Button kind="ghost" title="Delete" onPress={async () => { if (await confirmAsk('Delete this application?', 'Delete')) { if (!!(await fdb.from('fin_sub_apps').delete().eq('id', a.id).select('id')).data?.length) { toast('Deleted'); onSaved(); onClose(); } } }} />}
        {locked && <Button kind="ghost" title="CIS payment statement" onPress={async () => { const p = (await fdb.from('fin_sub_payments').select('*').eq('sub_app_id', a!.id).neq('status', 'void').limit(1)).data as Row[] | null; if (!p?.[0]) { toast('No CIS payment record for this application.'); return; } if (!(await cisStatement(me, org, p[0]))) toast('Could not make the statement — try again.'); }} />}
        <Button kind="ghost" title="Close" onPress={onClose} />
      </View>
    </Card>
  );
}

const lbox = { borderWidth: 1, borderColor: base.line, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 5, color: base.ink, backgroundColor: base.card };
type ScLine = { name: string; qty: string; unit: string; rate: string };
const goodLines = (ls: ScLine[]) => ls.filter((l) => l.name.trim() && Number(l.qty) && l.rate !== '' && !isNaN(Number(l.rate)));
function linesTotal(ls: ScLine[]): number | null { const g = goodLines(ls); return g.length ? round2(g.reduce((t, l) => t + Number(l.qty) * Number(l.rate), 0)) : null; }
/** The order into the project's Price file as an issued price sheet (its own tile, or added to a chosen one) — 912 finScSyncSheet. */
async function orderToSheet(me: Row, siteId: string, sc: Row, ls: ScLine[], tileId: string, worker: Row | null): Promise<string | null> {
  try {
    const g = goodLines(ls);
    const rows = g.length ? g.map((l) => ({ name: l.name.trim(), unit: l.unit || 'item', quantity: Number(l.qty), rate: round2(Number(l.rate)), line_total: round2(Number(l.qty) * Number(l.rate)) }))
      : [{ name: sc.description || `Subcontract — ${sc.name}`, unit: 'item', quantity: 1, rate: round2(Number(sc.order_value || 0)), line_total: round2(Number(sc.order_value || 0)) }];
    const total = round2(rows.reduce((t, r) => t + r.line_total, 0));
    let elId = tileId;
    if (!elId) {
      const ex = ((await fdb.from('pricing_elements').select('sort_order').eq('site_id', siteId).order('sort_order', { ascending: false }).limit(1)).data as Row[] | null) ?? [];
      const made = await fdb.from('pricing_elements').insert({ site_id: siteId, sub_site_id: null, name: sc.description || sc.name, sort_order: ex.length ? Number(ex[0].sort_order || 0) + 1 : 0, price_total: total, created_by: me.id } as never).select('id').single();
      elId = (made.data as Row | null)?.id ?? '';
    } else {
      const el = ((await fdb.from('pricing_elements').select('price_total').eq('id', elId).maybeSingle()).data as Row | null);
      if (el) await fdb.from('pricing_elements').update({ price_total: round2(Number(el.price_total || 0) + total) } as never).eq('id', elId);
    }
    const sh = await fdb.from('price_builder_sheets').insert({ org_id: me.org_id, site_id: siteId, title: `${sc.description || 'Subcontract'} — ${sc.name}`, subcontractor_name: sc.name, status: 'issued', total, created_by: me.id, issued_by: me.id, issued_at: new Date().toISOString(), pricing_element_id: elId || null, assigned_user_ids: worker?.user_id ? [worker.user_id] : [], fin_subcontract_id: sc.id } as never).select('id').single();
    const shId = (sh.data as Row | null)?.id; if (!shId) return 'Order saved, but the price sheet wasn’t made — try again from the order.';
    await fdb.from('price_builder_sheet_items').insert(rows.map((r, i) => ({ sheet_id: shId, category: 'Subcontract', sort_order: i, is_manual_rate: true, ...r })) as never);
    await fdb.from('fin_subcontracts').update({ price_sheet_id: shId, source: 'finance' } as never).eq('id', sc.id);
    return null;
  } catch { return 'Order saved, but the price sheet wasn’t made — try again from the order.'; }
}
