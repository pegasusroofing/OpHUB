// A subcontractor PO (912 renderFinSubcontract / openFinSubApp): the order
// (name, work, value, retention, CIS, UTR), its applications — record one,
// certify it (retention, contra charges, CIS on labour, pay less), mark paid
// (which records the CIS payment first). "new" takes ?site=.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { FinRow, FinStat } from '@/components/FinNav';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { fdb, insertNumbered, loadSettings } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { cisStatement } from '@/lib/finCisPdf';
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
    if (a.status !== 'paid' && (await fdb.from('fin_sub_apps').update({ status: 'paid', paid_on: paidOn } as never).eq('id', a.id)).error) { toast('The CIS record is saved, but the application couldn’t be marked paid — try again.'); return; }
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
          <Button title="+ Record an application" onPress={() => setAppEdit('new')} />
          {apps.some((a) => a.certified_gross != null) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>{apps.filter((a) => a.certified_gross != null).slice(-4).reverse().map((a) => <Button key={a.id} kind="ghost" title={`📄 ${a.payless ? 'Pay less' : 'Payment'} notice — No. ${a.number}`} onPress={async () => { try { const bytes = await buildSubNoticePdf(a, sc, sites.find((x) => x.id === a.site_id) as Row | undefined, await loadSettings(me.org_id), org, me.name || ''); if (!(await deliverPdf(bytes, `${a.payless ? 'Pay less notice' : 'Payment notice'} - ${sc.number} app ${a.number}.pdf`))) toast('Could not make the PDF — try again.'); } catch { toast('Could not build the notice.'); } }} />)}</View>}
          <Muted style={{ marginTop: 8 }}>Emailing the notice is off during the Finance trial.</Muted>
        </>
      )}
      {edit && (
        <FinForm title={sc ? `Edit ${sc.number}` : 'New subcontractor PO'} initial={sc || { retention_pct: 0, cis_rate: 20 }} onClose={() => { setEdit(false); if (!sc) router.back(); }}
          fields={[
            { k: 'name', label: 'Subcontractor' }, { k: 'email', label: 'Email', kind: 'email' }, { k: 'description', label: 'Work', kind: 'multiline' },
            { k: 'order_value', label: 'Order value £', kind: 'money', half: true }, { k: 'retention_pct', label: 'Retention %', kind: 'number', half: true },
            { k: 'cis_rate', label: 'CIS rate', kind: 'choice', options: [['0', '0% (gross)'], ['20', '20% (registered)'], ['30', '30% (not registered)']], half: true }, { k: 'utr', label: 'UTR', half: true },
            { k: 'vat_registered', label: 'VAT registered', kind: 'check' }, ...(sc ? [{ k: 'status', label: 'Status', kind: 'choice', options: [['active', 'Active'], ['complete', 'Complete']] }] as never[] : []),
          ]}
          onSave={async (v) => {
            const name = String(v.name).trim(); if (!name) return 'Enter the subcontractor’s name.';
            const ret = num(v.retention_pct) ?? 0; if (isNaN(ret) || ret < 0 || ret > 20) return 'Retention should be between 0 and 20%.';
            const val = num(v.order_value);
            const row: Row = { name, email: String(v.email).trim() || null, description: String(v.description).trim() || null, order_value: val === null || isNaN(val) ? null : round2(val), retention_pct: ret, cis_rate: Number(v.cis_rate || 20), utr: String(v.utr).trim() || null, vat_registered: !!v.vat_registered };
            if (sc && v.status) row.status = v.status;
            if (sc) { if ((await fdb.from('fin_subcontracts').update(row as never).eq('id', sc.id)).error) return 'Could not save.'; toast('Subcontractor PO saved'); refresh(); return null; }
            const r = await insertNumbered('fin_subcontracts', { col: 'site_id', val: site || '' }, (s) => `SC-${String(s).padStart(3, '0')}`, { ...row, org_id: me.org_id, site_id: site, created_by: me.id });
            if (!r) return 'Could not save — try again.';
            toast('Subcontractor PO saved'); refresh(); router.replace(`/fin/sub/${r.id}` as never); return null;
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
  if (!me) return null;
  const locked = a?.status === 'paid';
  const n = (k: string) => { const x = num(v[k]); return x === null || isNaN(x) ? null : x; };
  const c = subAppCalc({ applied: n('applied') || 0, mat: n('mat') || 0, cert: n('cert'), contra: n('contra') || 0, retentionPct: Number(sc.retention_pct || 0), cisRate: Number(sc.cis_rate || 0), ...ctx });
  const save = async (certify: boolean) => {
    if (!c.applied) { toast('Enter the amount applied for.'); return; }
    if (certify && c.cert === null) { toast('Enter the certified amount.'); return; }
    const row: Row = { app_date: v.app_date || today(), final_date: v.final_date || null, applied_gross: round2(c.applied), materials_part: round2(c.mat) };
    if (certify && 'net' in c) Object.assign(row, { certified_gross: round2(c.cert as number), retention: c.retention, contra: round2(c.contra as number), contra_note: v.reason || null, previous: ctx.prevNet, net_due: c.net, cis_deduction: c.cis, pay_amount: c.pay, status: 'certified', payless: !!c.payless, payless_reason: c.payless ? v.reason || null : null });
    setBusy(true);
    try {
      const ok = a ? !(await fdb.from('fin_sub_apps').update(row as never).eq('id', a.id)).error : !(await fdb.from('fin_sub_apps').insert({ ...row, org_id: me.org_id, site_id: sc.site_id, subcontract_id: sc.id, number: nextNo, status: certify ? 'certified' : 'received', created_by: me.id } as never)).error;
      if (!ok) { toast('Could not save — try again.'); return; }
      toast(certify && 'pay' in c ? `Certified — ${money(c.pay)} to pay` : 'Application saved'); onSaved(); onClose();
    } finally { setBusy(false); }
  };
  const box = { borderWidth: 1, borderColor: base.line, borderRadius: 8, padding: 8, color: base.ink, backgroundColor: base.card };
  const f = (k: string, l: string) => (
    <View key={k} style={{ flexBasis: '47%', flexGrow: 1, marginBottom: 6 }}><Muted>{l}</Muted><TextInput editable={!locked} value={String(v[k] ?? '')} onChangeText={(x) => setV({ ...v, [k]: x })} keyboardType={k.includes('date') ? 'default' : 'decimal-pad'} placeholder={k.includes('date') ? 'YYYY-MM-DD' : '£'} style={box} /></View>
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
        {a?.status === 'received' && <Button kind="ghost" title="Delete" onPress={async () => { if (await confirmAsk('Delete this application?', 'Delete')) { if (!(await fdb.from('fin_sub_apps').delete().eq('id', a.id)).error) { toast('Deleted'); onSaved(); onClose(); } } }} />}
        {locked && <Button kind="ghost" title="CIS payment statement" onPress={async () => { const p = (await fdb.from('fin_sub_payments').select('*').eq('sub_app_id', a!.id).neq('status', 'void').limit(1)).data as Row[] | null; if (!p?.[0]) { toast('No CIS payment record for this application.'); return; } if (!(await cisStatement(me, org, p[0]))) toast('Could not make the statement — try again.'); }} />}
        <Button kind="ghost" title="Close" onPress={onClose} />
      </View>
    </Card>
  );
}
