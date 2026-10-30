// One project's Finance page (900 renderSiteFinance + 911 cards + 9219n/9219u
// layout): Overview (project summary, cost to date, retention), Sales,
// Purchases, Subcontractors & Labour, and Set-up (contract, billing, client POs).
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { FinChip, FinRow } from '@/components/FinNav';
import { OphIcon } from '@/components/OphIcon';
import { PurchaseQuotes } from '@/components/FinPurchaseQuotes';
import { PurchasesLists } from '@/components/FinPurchases';
import { SalesLists } from '@/components/FinSales';
import { SubsLists } from '@/components/FinSubs';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { fdb } from '@/data/finance';
import { applyRetention, raiseRetentionInvoice } from '@/data/finApp';
import { deleteClientPo, finBookedOn, saveClientPo, saveJobFinance, saveJobNumber, useBook } from '@/data/finBook';
import { deleteSite, setSiteStatus, siteIsEmpty } from '@/data/siteList';
import { subKind } from '@/data/finSubJobs';
import { importSiteVariations } from '@/data/finVar';
import { openDocLink, usePeople } from '@/data/hs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { siteStatusKey } from '@/lib/rules/checkin';
import { forecast, pctTxt } from '@/lib/rules/finBook';
import { heading } from '@/lib/fonts';
import { appDueThisMonth, plantCost, today, appDateFor, FIN_VAT_LABEL, fdate, invOutstandingNet, invOverdue, money, num, retentionAlerts, retentionDates, retentionHeld, retHalfAmt, type FinApp, type FinInv } from '@/lib/rules/finance';
import { isFinanceOnlyOrg, isFinanceUser, isFullManager } from '@/lib/roles';
import { base, page, space, useTheme } from '@/theme/theme';

type Row = Record<string, any>;
const TABS: [string, string][] = [['overview', 'Overview'], ['sales', 'Sales'], ['purchases', 'Purchases'], ['subs', 'Subcontractors & Labour'], ['setup', 'Project Admin']];
// £10.0k, as the current app's tiles (finK).
const k = (n: number | null | undefined) => (n == null ? '…' : Math.abs(n) >= 1000 ? `${n < 0 ? '−' : ''}£${(Math.abs(n) / 1000).toFixed(1)}k` : money(n, 0));

export default function FinJob() {
  const { id, tab = 'overview' } = useLocalSearchParams<{ id: string; tab?: string }>();
  const { me, org } = useAuth();
  const { data: site } = useSite(id);
  const { data, isLoading } = useBook(me?.org_id, id);
  const t = useTheme();
  const [sub, setSub] = useState<Record<string, string>>({ sales: 'invoices', purchases: 'orders', subs: 'orders' });
  // Variations raised on site come into the register (so the forecast and the Variations tile count them).
  const qcJob = useQueryClient();
  const finOnly = isFinanceOnlyOrg(org);
  useEffect(() => {
    if (!me || !id || finOnly || !isFinanceUser(me, org)) return;
    void importSiteVariations(me, id).then((r) => { if (r.added) void qcJob.invalidateQueries({ queryKey: ['finBook'] }); });
  }, [me, org, id, finOnly, qcJob]);
  if (!me) return null;
  if (!isFinanceUser(me, org)) return <Muted style={{ padding: space.l }}>OpHUB Finance isn&apos;t switched on for your account.</Muted>;
  const s = site as (typeof site & Row) | undefined;
  const title = s ? `${s.job_number ? `${s.job_number} · ` : ''}${s.name}` : 'Project';
  const fc = data ? forecast(data.book, id, data.settings) : null;
  const subTabs = (k: string, opts: [string, string][]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>{opts.map(([v, l]) => <FinChip key={v} on={sub[k] === v} label={l} onPress={() => setSub({ ...sub, [k]: v })} />)}</View>
  );
  return (
    <ScrollView contentContainerStyle={page(1000)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 8, marginBottom: 6 }}>
        <Pressable onPress={() => router.push(`/sites/${id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 }}>
          <OphIcon name="home" size={14} color={base.ink} /><Text style={{ fontSize: 12, fontWeight: '700', color: base.ink }}>Home</Text>
        </Pressable>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: base.ink }}><Text style={{ fontWeight: '800' }}>{s?.job_number || ''}</Text>  {s?.name || ''}</Text>
        <Pressable onPress={async () => {
          const opts = [['inv', 'Invoice', `/fin/job/${id}/invoice/new`], ...(fc && !fc.isInvoiceJob ? [['app', 'Application', `/fin/job/${id}/application/new`]] : []), ['po', 'Purchase order', `/fin/po/new?site=${id}`], ['pinv', 'Purchase invoice', `/fin/pinv/new?site=${id}`], ['plant', 'Plant hire', `/fin/plant/new?site=${id}`], ['sub', 'Subcontract', `/fin/sub/new?site=${id}`]];
          const k = await chooseAction('New', opts.map(([key, label]) => ({ key, label })));
          const o = opts.find((x) => x[0] === k); if (o) router.push(o[2] as never);
        }} style={{ backgroundColor: t.brand1, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14, flexDirection: 'row', gap: 18 }}>
          <Text style={{ color: t.brand1Text, fontSize: 12.5, fontWeight: '800' }}>+ New</Text><Text style={{ color: t.brand1Text, fontSize: 11 }}>▾</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginBottom: 14, flexGrow: 0 }} contentContainerStyle={{ gap: 2 }}>
        {[...TABS, ...(fc && !fc.isInvoiceJob ? [['boq', 'Bill of Quantities'] as [string, string]] : [])].map(([key, l]) => (
          <Pressable key={key} onPress={() => (key === 'boq' ? router.push(`/fin/job/${id}/boq` as never) : router.setParams({ tab: key }))} style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: tab === key ? t.brand1 : 'transparent' }}>
            <Text style={{ fontSize: 13, fontWeight: tab === key ? '700' : '600', color: tab === key ? '#111827' : '#6b7280' }}>{l}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {isLoading || !fc || !data ? <Muted>Loading…</Muted> : tab === 'overview' ? <Overview id={id} fc={fc} settings={data.settings} invs={data.book.invs.filter((i) => i.site_id === id)} apps={data.book.apps.filter((a) => a.site_id === id)} book={data.book as unknown as Row} />
        : tab === 'sales' ? <>{subTabs('sales', [['invoices', 'Invoices'], ['apps', 'Applications & Certificates'], ['retention', 'Retention']])}<SalesLists key={sub.sales} tab={sub.sales as 'invoices'} siteId={id} /></>
        : tab === 'purchases' ? <>{subTabs('purchases', [['orders', 'Purchase orders'], ['invoices', 'Purchase invoices'], ['plant', 'Plant hire'], ['quotes', 'Purchase Quotes']])}{sub.purchases === 'quotes' ? <PurchaseQuotes siteId={id} /> : <PurchasesLists key={sub.purchases} tab={sub.purchases as 'orders'} siteId={id} />}</>
        : tab === 'subs' ? <>{subTabs('subs', [['orders', 'Subcontractor POs'], ['apps', 'Applications'], ['opinv', 'Operative invoices']])}<SubsLists key={sub.subs} tab={sub.subs as 'orders'} siteId={id} /></>
        : <Setup id={id} site={s} jf={fc.jf} cpos={data.book.cpos.filter((p) => p.site_id === id)} settings={data.settings} />}
    </ScrollView>
  );
}

function Overview({ id, fc, settings, invs, apps, book }: { id: string; fc: ReturnType<typeof forecast>; settings: Row; invs: FinInv[]; apps: FinApp[]; book: Row }) {
  // Each half is worked out from what the latest certificate holds (903), not what's still held.
  const heldCert = retentionHeld(apps);
  const d = retentionDates(fc.jf, settings), alerts = retentionAlerts(fc.jf, settings, fc.retHeld);
  const { me } = useAuth();
  const { data: site } = useSite(id);
  const toast = useToast();
  // One tap at a time: a double tap could otherwise raise two release invoices (922).
  const [retBusy, setRetBusy] = useState(false);
  // Release a half either way (9219zn): Apply puts it through the next application, or Raise invoice bills it now.
  const retAppFor = (n: 1 | 2) => { const aid = n === 1 ? fc.jf.ret1_app_id : fc.jf.ret2_app_id; const a = aid ? apps.find((x) => x.id === aid) : null; return a && a.status !== 'void' ? a : null; };
  const retInv = async (n: 1 | 2) => {
    if (!me || retBusy) return;
    // 9219zn: invoiced → view the invoice; applied for → that application (never applied for twice);
    // Raise invoice only once the release date (practical completion / end of defects) is set.
    const done = n === 1 ? fc.jf.ret1_invoice_id : fc.jf.ret2_invoice_id;
    if (done) { router.push(`/fin/job/${id}/invoice/${done}` as never); return; }
    const inApp = retAppFor(n);
    if (inApp) { router.push(`/fin/job/${id}/application/${inApp.id}` as never); return; }
    const date = n === 1 ? d.first : d.second;
    const k = await chooseAction(n === 1 ? 'First half of the retention' : 'Final retention release', [{ key: 'app', label: 'Apply — through the next application (the client certifies it)' }, ...(date ? [{ key: 'inv', label: 'Raise invoice — bill it straight away' }] : [])]);
    if (!k) return;
    setRetBusy(true);
    if (k === 'app') {
      const a = await applyRetention(me, id, n).finally(() => setRetBusy(false));
      if (a.error) { toast(a.error); return; }
      toast(`Application ${a.number}: retention ${a.pct}% — ${n === 1 ? 'first half' : 'final'} release applied for`);
      router.push(`/fin/job/${id}/application/${a.id}` as never); return;
    }
    const r = await raiseRetentionInvoice(me, id, n, site as never).finally(() => setRetBusy(false));
    if (r.error) toast(r.error);
    if (r.id) router.push(`/fin/job/${id}/invoice/${r.id}` as never);
  };
  const valued = fc.sales || 0;
  const pv = fc.ffa ? Math.max(0, Math.min(100, Math.round((valued / fc.ffa) * 100))) : 0;
  const mPct = fc.budgetTotal != null && fc.forecastMarginPct != null ? fc.forecastMarginPct : fc.sales ? fc.profitToDatePct : null;
  const live = invs.filter((i) => i.status !== 'void'), od = live.filter((i) => invOverdue(i));
  const odV = od.reduce((tt, i) => tt + invOutstandingNet(i), 0);
  const inv = live.filter((i) => i.status !== 'draft').reduce((tt, i) => tt + Number(i.net || 0), 0);
  const prof = fc.sales ? fc.profitToDatePct : null;
  const TINT = { blue: ['#f3f7ff', '#dbe6ff', '#1d4ed8'], green: ['#f1fbf5', '#d3f0de', '#15803d'], red: ['#fff5f4', '#fbdcd9', '#c81e1e'], amber: ['#fffaf0', '#f8e7c2', '#b45309'], grey: ['#fff', '#e5e7eb', '#111827'] } as const;
  const tiles: { t: string; v: string; sub: string; tone: keyof typeof TINT; go: string }[] = [
    { t: 'Contract Value', v: k(fc.contract), sub: 'excl. VAT', tone: 'blue', go: `/fin/job/${id}?tab=setup` },
    { t: 'Variations', v: k(fc.vAgreed), sub: fc.vPending ? `+ ${k(fc.vPending)} waiting for approval` : 'approved variations', tone: 'blue', go: `/fin/job/${id}/variations` },
    { t: 'Costs', v: k(fc.costToDate), sub: fc.budgetTotal ? `${pctTxt((fc.costToDate / fc.budgetTotal) * 100)} of budget` : 'No budget yet', tone: 'grey', go: `/fin/job/${id}/costs` },
    { t: 'Profit', v: prof == null ? '—' : pctTxt(prof), sub: prof == null ? 'Nothing valued yet' : `${money(fc.profitToDate, 0)}${fc.ohpPct ? ` after ${fc.ohpPct}% OHP` : ' to date'}`, tone: prof == null ? 'grey' : prof < 0 ? 'red' : 'green', go: `/fin/job/${id}/budget` },
    ...(fc.isInvoiceJob ? [] : [{ t: 'Applied', v: k(fc.applied), sub: fc.ffa ? `${pctTxt((fc.applied / fc.ffa) * 100)} of final account` : '', tone: 'blue' as const, go: `/fin/job/${id}?tab=sales` }]),
    { t: 'Invoiced', v: k(inv), sub: 'excl. VAT', tone: 'green', go: `/fin/job/${id}?tab=sales` },
    { t: 'Overdue', v: k(odV), sub: od.length ? `${od.length} invoice${od.length === 1 ? '' : 's'}` : 'excl. VAT', tone: odV > 0 ? 'red' : 'grey', go: `/fin/job/${id}?tab=sales` },
    ...(fc.isInvoiceJob ? [] : [{ t: 'Retention', v: k(fc.retHeld), sub: 'still with the client', tone: 'amber' as const, go: `/fin/job/${id}?tab=sales` }]),
  ];
  const ghost = (l: string, p: string) => <Pressable key={l} onPress={() => router.push(p as never)} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: '#fff' }}><Text style={{ fontSize: 12, fontWeight: '700', color: base.ink }}>{l}</Text></Pressable>;
  return (
    <View>
      <Pressable onPress={() => router.setParams({ tab: 'setup' })}>
        <Card>
          <Text style={{ fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: '#6b7280', textTransform: 'uppercase' }}>Forecasted final account</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Text style={[heading(800), { flex: 1, fontSize: 30, color: '#111827' }]}>{money(fc.ffa, 0)}</Text>
            {mPct == null
              ? <Pressable onPress={() => router.push(`/fin/job/${id}/budget` as never)} style={{ backgroundColor: '#EEF0F2', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 }}><Text style={{ fontSize: 11.5, fontWeight: '700', color: base.ink }}>Set a budget</Text></Pressable>
              : <Text style={{ fontSize: 11.5, fontWeight: '700', color: mPct < 0 ? '#c81e1e' : '#15803d', backgroundColor: mPct < 0 ? '#fff5f4' : '#f1fbf5', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10, overflow: 'hidden' }}>{pctTxt(mPct)} {fc.budgetTotal != null ? 'margin' : 'margin to date'}</Text>}
          </View>
          <Text style={{ fontSize: 12.5, color: '#6b7280', marginTop: 2 }}>Contract {money(fc.contract, 0)} + {money(fc.vAgreed, 0)} agreed variations{fc.vPending ? ` + ${money(fc.vPending, 0)} submitted` : ''}{fc.budgetTotal != null ? ` · forecast profit ${money(fc.forecastMargin, 0)}` : ''}</Text>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: '#EEF0F2', marginTop: 14, overflow: 'hidden' }}><View style={{ width: `${pv}%`, height: '100%', backgroundColor: '#15803d' }} /></View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={{ fontSize: 11.5, color: '#6b7280' }}>{money(valued, 0)} {fc.isInvoiceJob ? 'invoiced' : 'valued'} ({pv}%)</Text>
            <Text style={{ fontSize: 11.5, color: '#6b7280' }}>{fc.ffa ? `${money(Math.max(0, fc.ffa - valued), 0)} to go` : ''}</Text>
          </View>
        </Card>
      </Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
        {tiles.map((x) => (
          <View key={x.t} style={{ width: tiles.length > 6 ? '25%' : '33.333%', minWidth: 150, padding: 4, flexGrow: 1 }}>
            <Pressable onPress={() => router.push(x.go as never)} style={{ backgroundColor: TINT[x.tone][0], borderWidth: 1, borderColor: TINT[x.tone][1], borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, minHeight: 72 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#111827' }}>{x.t}</Text>
              <Text style={[heading(800), { fontSize: 19, color: TINT[x.tone][2], marginTop: 2 }]}>{x.v}</Text>
              <Text style={{ fontSize: 11, color: '#6b7280' }}>{x.sub}</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {ghost('Full Summary', `/fin/job/${id}/summary`)}
        {!!subKind(site) && ghost(subKind(site) === 'repair' ? 'Costs by repair job' : 'Costs by plot', `/fin/job/${id}/parts`)}
        <View style={{ flex: 1 }} />
        {ghost('Monthly Report', `/fin/job/${id}/monthly`)}{ghost('Day Works', `/fin/job/${id}/dayworks`)}{ghost('Budgets', `/fin/job/${id}/budget`)}{ghost('Project Quotes', `/fin/job/${id}/quotes`)}
      </View>
      <NeedsAttention id={id} site={site as Row | undefined} fc={fc} settings={settings} invs={invs} apps={apps} book={book} />
      {!fc.isInvoiceJob && (
        <>
          <SectionTitle>Retention</SectionTitle>
          <Card>
            {alerts.map((a) => <Text key={a.half} style={{ color: '#D98A00', fontWeight: '700' }}>{a.half === 1 ? 'First' : 'Second'} half due {fdate(a.date)}</Text>)}
            <FinRow title="Held to date" right={money(fc.retHeld)} />
            <FinRow title="First half — at practical completion" sub={`${d.first ? fdate(d.first) : 'Set the practical completion date in Set-up'}${fc.jf.ret1_invoice_id ? ' · invoiced' : retAppFor(1) ? ` · In Application ${retAppFor(1)?.number}` : ''}`} right={money(retHalfAmt(heldCert, 1, fc.jf, invs, apps))} onPress={() => void retInv(1)} />
            <FinRow title="Second half — end of defects period" sub={`${d.second ? fdate(d.second) : '—'}${fc.jf.ret2_invoice_id ? ' · invoiced' : retAppFor(2) ? ` · In Application ${retAppFor(2)?.number}` : ''}`} right={money(retHalfAmt(heldCert, 2, fc.jf, invs, apps))} onPress={() => void retInv(2)} />
            <Muted>Tap a half to release it: Apply puts it through your next application (the client certifies it), or Raise invoice bills it straight away.</Muted>
          </Card>
        </>
      )}
    </View>
  );
}

function Setup({ id, site, jf, cpos, settings }: { id: string; site: Row | undefined; jf: Row; cpos: Row[]; settings: Row }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<'job' | 'po' | 'dates' | 'site' | null>(null);
  const { data: people } = usePeople();
  // Directory clients: the bill-to follows the client's Directory record (9219u — it lives on the client).
  const { data: dirClients = [] } = useQuery({ queryKey: ['finDirClients', me?.org_id], enabled: !!me, queryFn: async () => ((await fdb.from('fin_clients').select('id,name,email,address,postcode').eq('org_id', me?.org_id as string).order('name')).data as Row[] | null) ?? [] });
  const [po, setPo] = useState<Row | null>(null);
  const [file, setFile] = useState<{ uri: string; name: string; mimeType?: string | null } | null>(null);
  if (!me) return null;
  const refresh = () => { ['finBook', 'finJobs', 'finOverview', 'sites'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  const kv = (l: string, v: string) => <FinRow key={l} title={l} right={v} />;
  // Delete from Finance (9219u finDeleteJob): not with anything financial booked to it — then close it instead.
  const delJob = async () => {
    if (!me || !site) return;
    const closeIt = async () => { if (await setSiteStatus(me, id, 'closed')) { toast('Project closed'); router.replace('/fin/jobs' as never); } else toast('Could not save — try again.'); };
    const used = await finBookedOn(me.org_id as string, id);
    if (!used) { toast('Couldn’t check what’s booked to this project, so it hasn’t been deleted. Check your signal and try again.'); return; }
    if (used.length) { if (await confirmAsk(`“${site.name}” already has ${used.join(', ')} booked to it, so it can’t be deleted — that would wipe financial records. Close it instead? (It moves to Closed and drops off the live lists.)`, 'Close it')) await closeIt(); return; }
    if (me.role !== 'admin' && !(await siteIsEmpty(id))) { if (await confirmAsk(`“${site.name}” already has data in it, so it can’t be permanently deleted from here — this will close it instead. Continue?`, 'Close it')) await closeIt(); return; }
    if (!(await confirmAsk(`Delete “${site.name}”? This permanently removes the project. This can’t be undone.`, 'Delete'))) return;
    if (await deleteSite(id)) { toast('Project deleted'); void qc.invalidateQueries({ queryKey: ['sites'] }); router.replace('/fin/jobs' as never); } else toast('Could not delete — try again.');
  };
  return (
    <View>
      <SectionTitle>Project details</SectionTitle>
      <Card>
        {kv('Project number', site?.job_number || '—')}
        {kv('Contract value', jf.contract_value != null ? money(jf.contract_value) : 'Not set')}
        {kv('Billing', jf.billing_type === 'invoice' ? 'By invoice' : jf.billing_type === 'application' ? 'By application' : 'Not chosen yet')}
        {kv('Retention', jf.retention_pct != null ? `${jf.retention_pct}%${jf.retention_limit_pct != null ? ` (limit ${jf.retention_limit_pct}%)` : ''}` : `${settings.default_retention_pct}% (company)`)}
        {kv('Payment terms', `${jf.due_days ?? settings.default_due_days} days · final ${jf.final_days ?? settings.default_final_days} days`)}
        {kv('VAT', FIN_VAT_LABEL[jf.vat_treatment || settings.default_vat] || '—')}
        {kv('Application date', jf.app_reminder_day ? `${jf.app_reminder_day} of each month` : settings.app_reminder_day ? `${settings.app_reminder_day} (company)` : 'Not set')}
        {kv('Bill to', [jf.billing_name, jf.billing_email].filter(Boolean).join(' · ') || '—')}
        {kv('Practical completion', jf.pc_date ? fdate(jf.pc_date) : '—')}
        {kv('Defects period', `${jf.defects_months ?? settings.default_defects_months ?? 12} months`)}
        {kv('Final retention release', jf.final_release_date ? `${fdate(jf.final_release_date)} (set by hand)` : 'End of the defects period')}
        {kv('QS', jf.qs_id ? (people ?? []).find((p) => p.id === jf.qs_id)?.name || '—' : 'None yet')}
        {kv('Company overheads', jf.ohp_pct != null ? `${jf.ohp_pct}%` : `${settings.ohp_pct ?? 0}% (company)`)}
        <View style={{ marginTop: 8, gap: 8 }}>{isFullManager(me) && <Button kind="ghost" title="✎ Project — name, client, address, status" onPress={() => setEdit('site')} />}<Button title="Edit project details" onPress={() => setEdit('job')} /><Button kind="ghost" title="📅 Monthly application dates" onPress={() => setEdit('dates')} /></View>
      </Card>
      {isFullManager(me) && <View style={{ marginBottom: 8 }}><Button kind="ghost" title="🗑 Delete this project" onPress={() => void delJob()} /></View>}
      <SectionTitle>Client POs</SectionTitle>
      {cpos.length ? cpos.map((p) => (
        <FinRow key={p.id} title={`PO ${p.po_number}${p.is_primary ? ' (main)' : ''}`} sub={[p.po_date ? fdate(p.po_date) : '', p.description, Array.isArray(p.files) && p.files.length ? `${p.files.length} file${p.files.length === 1 ? '' : 's'}` : p.file_name ? '1 file' : ''].filter(Boolean).join(' · ')} onPress={() => { setPo(p); setFile(null); setEdit('po'); }} />
      )) : <Muted style={{ marginBottom: 8 }}>No client PO yet.</Muted>}
      <Button kind="ghost" title="+ Client PO" onPress={() => { setPo(null); setFile(null); setEdit('po'); }} />
      {edit === 'site' && site && (
        <FinForm title="Project" note="The same details as on the project itself — change them here or there and both update." initial={{ name: site.name || '', status: site.status === 'closed' ? 'closed' : site.status === 'upcoming' ? 'upcoming' : 'live', start_date: site.start_date || '', client_name: site.client_name || '', address: site.address || '', postcode: site.postcode || '' }} onClose={() => setEdit(null)}
          fields={[{ k: 'name', label: 'Project name' }, { k: 'status', label: 'Status', kind: 'choice', options: [['upcoming', 'Upcoming'], ['live', 'Live'], ['closed', 'Closed']], half: true }, { k: 'start_date', label: 'Start date', kind: 'date', half: true }, { k: 'client_name', label: 'Client' }, { k: 'address', label: 'Site address' }, { k: 'postcode', label: 'Postcode', half: true }]}
          onSave={async (v) => {
            const name = String(v.name || '').trim(); if (!name) return 'A project needs a name.';
            const p: Row = { name, client_name: String(v.client_name || '').trim() || null, address: String(v.address || '').trim() || null, postcode: String(v.postcode || '').trim().toUpperCase() || null, start_date: String(v.start_date || '') || null };
            const cur = site.status === 'closed' ? 'closed' : site.status === 'upcoming' ? 'upcoming' : 'live', st = String(v.status || cur);
            if (st !== cur) { p.status = st === 'live' ? 'active' : st; if (st === 'closed') { p.closed_at = new Date().toISOString(); p.closed_by = me.id; } else { p.closed_at = null; p.closed_by = null; } }
            // 9219n saveSiteFinance: a changed client is named in the Directory (added if new) and becomes who's billed.
            let cli: Row | null = null;
            if (p.client_name && p.client_name !== (site.client_name || '')) {
              const all = ((await fdb.from('fin_clients').select('*').eq('org_id', me.org_id as string)).data as Row[] | null) ?? [];
              cli = all.find((c) => String(c.name || '').trim().toLowerCase() === String(p.client_name).toLowerCase()) || null;
              if (!cli) cli = ((await fdb.from('fin_clients').insert({ org_id: me.org_id, name: p.client_name, created_by: me.id } as never).select('*').single()).data as Row | null) ?? null;
              if (cli) p.client_name = cli.name;
            }
            if (!(await fdb.from('sites').update(p as never).eq('id', id).select('id')).data?.length) return 'Could not save — try again.';
            if (cli) await fdb.from('job_finance').update({ billing_name: cli.name, billing_address: [cli.address, cli.postcode].filter(Boolean).join('\n') || null, billing_email: cli.email || null } as never).eq('site_id', id);
            refresh(); return null;
          }} />
      )}
      {edit === 'dates' && (() => {
        const months = Array.from({ length: 13 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1 + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
        const custom = (jf.app_dates || {}) as Record<string, string>;
        const rule = (ym: string) => appDateFor({ ...jf, app_dates: null } as never, settings, ym);
        return (
          <FinForm title="Monthly application dates" onClose={() => setEdit(null)}
            note="Set a date for any month that's different from the usual day. Leave a month blank to use the usual day (shown greyed)."
            initial={Object.fromEntries(months.map((m) => [m, custom[m] || '']))}
            fields={months.map((m) => ({ k: m, label: new Date(`${m}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), kind: 'date' as const, half: true, ph: rule(m) || 'No usual day set' }))}
            onSave={async (v) => {
              const next: Record<string, string> = { ...custom };
              for (const m of months) {
                const d = String(v[m] ?? '').trim();
                if (!d || d === rule(m)) { delete next[m]; continue; }
                if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return `Use YYYY-MM-DD for ${m}.`;
                next[m] = d;
              }
              const e = await saveJobFinance(me, id, { app_dates: Object.keys(next).length ? next : null });
              if (e) return e;
              toast('Application dates saved'); refresh(); return null;
            }} />
        );
      })()}
      {edit === 'job' && (
        <FinForm title="Project details" initial={{ ...jf, job_number: site?.job_number || '', billing_type: jf.billing_type || '' }} onClose={() => setEdit(null)}
          fields={[
            { k: 'job_number', label: 'Project number', half: true }, { k: 'contract_value', label: 'Contract value £ (excl. VAT)', kind: 'money', half: true },
            { k: 'billing_type', label: 'Billed by', kind: 'choice', options: [['invoice', 'Invoice'], ['application', 'Application (with retention)']], note: 'Invoice jobs have no applications or retention.' },
            { k: 'retention_pct', label: 'Retention %', kind: 'number', half: true, ph: String(settings.default_retention_pct) }, { k: 'retention_limit_pct', label: 'Retention limit %', kind: 'number', half: true },
            { k: 'due_days', label: 'Payment due (days)', kind: 'number', half: true, ph: String(settings.default_due_days) }, { k: 'final_days', label: 'Final date (days)', kind: 'number', half: true, ph: String(settings.default_final_days) },
            { k: 'vat_treatment', label: 'VAT', kind: 'choice', options: [['', 'Company default'], ...Object.entries(FIN_VAT_LABEL)] as [string, string][] },
            { k: 'app_reminder_day', label: 'Application date (day of month)', kind: 'number', half: true }, { k: 'ohp_pct', label: `Company overheads % (blank = ${settings.ohp_pct ?? 0}%)`, kind: 'number', half: true, note: me.role === 'admin' ? undefined : 'Only a company admin can change this.' },
            { k: 'billing_name', label: 'Bill to (client)', kind: 'choice', options: [['', 'Not set'], ...dirClients.map((c) => [c.name, c.name] as [string, string]), ...(jf.billing_name && !dirClients.some((c) => c.name === jf.billing_name) ? [[jf.billing_name, `${jf.billing_name} (not in the Directory)`] as [string, string]] : [])], note: 'From the Directory — the billing address and accounts email follow the client’s Directory record.' }, { k: 'billing_address', label: 'Billing address', kind: 'multiline' }, { k: 'billing_email', label: 'Accounts email', kind: 'email' },
            { k: 'pc_date', label: 'Practical completion date', kind: 'date', half: true }, { k: 'defects_months', label: 'Defects period (months)', kind: 'number', half: true },
            { k: 'final_release_date', label: 'Final retention release (blank = end of defects period)', kind: 'date', half: true },
            { k: 'qs_id', label: 'QS', kind: 'choice', half: true, options: [['', 'None yet'], ...(people ?? []).filter((p) => ['pm', 'admin', 'site_manager'].includes(p.role) || (p as { finance_enabled?: boolean }).finance_enabled).sort((a, b) => a.name.localeCompare(b.name)).map((p) => [p.id, p.name] as [string, string])] },
            { k: 'notes', label: 'Notes', kind: 'multiline' },
          ]}
          onSave={async (v) => {
            const n = (k: string) => { const x = num(v[k]); return x === null ? null : x; };
            const contract = n('contract_value'), ret = n('retention_pct'), retLim = n('retention_limit_pct'), appDay = n('app_reminder_day');
            if (contract !== null && (isNaN(contract) || contract < 0)) return 'Enter the contract value as a number.';
            if (ret !== null && (isNaN(ret) || ret < 0 || ret > 100)) return 'Retention must be between 0 and 100%.';
            if (retLim !== null && (isNaN(retLim) || retLim < 0 || retLim > 100)) return 'Retention limit must be between 0 and 100%.';
            if (appDay !== null && (isNaN(appDay) || appDay < 1 || appDay > 31)) return 'Application date must be a day of the month, 1 to 31.';
            // The bill-to follows the Directory: address and accounts email come from the client's record.
            const dc = dirClients.find((c) => c.name === String(v.billing_name || ''));
            if (dc) { v.billing_address = [dc.address, dc.postcode].filter(Boolean).join('\n') || String(v.billing_address || ''); v.billing_email = dc.email || String(v.billing_email || ''); }
            const email = String(v.billing_email).trim();
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid accounts email.';
            const jobNo = String(v.job_number).trim();
            if (jobNo !== String(site?.job_number || '')) { if (!jobNo) return 'A project needs a project number.'; if (!(await saveJobNumber(id, jobNo))) return 'Could not save the project number.'; }
            const patch: Row = {
              contract_value: contract, retention_pct: ret, retention_limit_pct: retLim, due_days: n('due_days'), final_days: n('final_days'), app_reminder_day: appDay,
              vat_treatment: v.vat_treatment || null, billing_type: v.billing_type || null, billing_name: String(v.billing_name).trim() || null, billing_address: String(v.billing_address).trim() || null, billing_email: email || null,
              pc_date: String(v.pc_date).trim() || null, defects_months: n('defects_months'), notes: String(v.notes).trim() || null,
              final_release_date: String(v.final_release_date ?? '').trim() || null, qs_id: String(v.qs_id ?? '') || null,
            };
            if (contract !== null && contract !== Number(jf.contract_value)) patch.contract_value_source = 'manual';
            if (jf.original_value == null && contract && contract > 0) { patch.original_value = contract; patch.original_at = jf.original_at || new Date().toISOString(); }
            if (me.role === 'admin') { const o = n('ohp_pct'); patch.ohp_pct = o === null || isNaN(o) || o < 0 || o > 100 ? null : o; }
            const e = await saveJobFinance(me, id, patch);
            if (e) return e;
            toast('Project details saved'); refresh(); return null;
          }} />
      )}
      {edit === 'po' && (
        <FinForm title={po ? `Client PO ${po.po_number}` : 'Client PO'} initial={po || { is_primary: !cpos.length }} onClose={() => setEdit(null)}
          note="No value on a client PO: the contract value lives in Project details."
          fields={[{ k: 'po_number', label: 'PO number' }, { k: 'po_date', label: 'PO date', kind: 'date' }, { k: 'description', label: 'Description' }, { k: 'is_primary', label: 'Main PO for this project', kind: 'check' }]}
          onSave={async (v) => {
            if (!String(v.po_number).trim()) return 'Enter the PO number.';
            const e = await saveClientPo(me, id, po?.id || null, { po_number: String(v.po_number).trim(), po_date: String(v.po_date).trim() || null, description: String(v.description).trim() || null, is_primary: !!v.is_primary }, file);
            if (e) return e;
            toast('PO saved'); refresh(); return null;
          }}
          onDelete={po ? async () => { if (!(await deleteClientPo(po.id))) return 'Could not delete.'; toast('PO deleted'); refresh(); return null; } : undefined} />
      )}
      {edit === 'po' && (
        <View style={{ marginTop: 8 }}>
          <Pressable onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) { setFile({ uri: r.assets[0].uri, name: r.assets[0].name, mimeType: r.assets[0].mimeType }); toast('File attached — Save to keep it'); } }}><Text style={{ color: base.blue }}>📎 {file ? file.name : 'Attach the PO file'}</Text></Pressable>
          {po && (Array.isArray(po.files) ? po.files : po.file_path ? [{ path: po.file_path, name: po.file_name }] : []).map((f: Row) => (
            <Pressable key={f.path} onPress={async () => { const u = await openDocLink('finance-docs', f.path); if (u) viewDoc(u); }}><Text style={{ color: base.blue }}>📄 {f.name}</Text></Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// 9219n "Needs attention" at the foot of the project Overview: each row goes straight to where it's dealt with.
function NeedsAttention({ id, site, fc, settings, invs, apps, book }: { id: string; site: Row | undefined; fc: ReturnType<typeof forecast>; settings: Row; invs: FinInv[]; apps: FinApp[]; book: Row }) {
  const { me } = useAuth();
  const { data: clients = [] } = useQuery({ queryKey: ['finClientsAttn', me?.org_id], enabled: !!me?.org_id, queryFn: async () => ((await fdb.from('fin_clients').select('id,name,email').eq('org_id', me?.org_id as string)).data as Row[] | null) ?? [] });
  if (!site) return null;
  const at = (rows: unknown) => ((rows as Row[] | undefined) ?? []).filter((x) => !x.site_id || x.site_id === id);
  const live = invs.filter((i) => i.status !== 'void'), od = live.filter((i) => invOverdue(i)), overdue = od.reduce((t, i) => t + invOutstandingNet(i), 0);
  const isLive = siteStatusKey(site as never) === 'live';
  const items: { tone: 'bad' | 'warn' | 'blue' | 'grey'; t: string; s: string; n: number; go: string }[] = [];
  if (od.length) items.push({ tone: 'bad', t: 'Overdue invoices', s: `${money(overdue, 0)} to chase`, n: od.length, go: `/fin/job/${id}?tab=sales` });
  if (!fc.isInvoiceJob && isLive && appDueThisMonth(apps, appDateFor(fc.jf as never, settings, today().slice(0, 7)))) items.push({ tone: 'warn', t: 'Application due this month', s: 'Value the work and send it to the client', n: 1, go: `/fin/job/${id}?tab=sales` });
  const drafts = invs.filter((i) => i.status === 'draft').length + apps.filter((a) => a.status === 'draft').length;
  if (drafts) items.push({ tone: 'blue', t: 'Drafts not sent yet', s: 'Invoices or applications still in draft', n: drafts, go: `/fin/job/${id}?tab=sales` });
  const toApp = at(book.pinvs).filter((p) => ['to_approve', 'query'].includes(p.status));
  if (toApp.length) items.push({ tone: 'warn', t: 'Purchase invoices to approve', s: `${money(toApp.reduce((t, p) => t + Number(p.net || 0), 0), 0)} excl. VAT`, n: toApp.length, go: `/fin/job/${id}?tab=purchases` });
  const longHire = at(book.hires).filter((h) => !h.off_hire && h.on_hire && plantCost(h as never).days > 28);
  if (longHire.length) items.push({ tone: 'warn', t: 'Plant on hire over 4 weeks', s: longHire.map((h) => h.item).join(', '), n: longHire.length, go: `/fin/job/${id}?tab=purchases` });
  if (!at(book.cpos).length && isLive) items.push({ tone: 'grey', t: 'No client PO', s: 'It goes on every invoice and application', n: 1, go: `/fin/job/${id}?tab=setup` });
  if (!Number(fc.jf?.contract_value) && isLive) items.push({ tone: 'grey', t: 'No contract value', s: fc.isInvoiceJob ? 'Add it in Project Admin' : 'Set up the Bill of Quantities', n: 1, go: fc.isInvoiceJob ? `/fin/job/${id}?tab=setup` : `/fin/job/${id}/boq` });
  const c = site.client_name ? clients.find((x) => String(x.name || '').trim().toLowerCase() === String(site.client_name).trim().toLowerCase()) : null;
  if (site.client_name && !c) items.push({ tone: 'grey', t: 'Client not in the Directory', s: site.client_name, n: 1, go: '/fin/directory?kind=client' });
  else if (c && !c.email) items.push({ tone: 'grey', t: 'No accounts email for the client', s: `${c.name} — invoices need somewhere to go`, n: 1, go: '/fin/directory?kind=client' });
  if (!items.length) return null;
  const tone = { bad: base.red, warn: '#D98A00', blue: base.blue, grey: base.slate };
  return (
    <>
      <SectionTitle>Needs attention</SectionTitle>
      <Card>
        {items.map((x, k) => (
          <Pressable key={x.t} onPress={() => router.push(x.go as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: k ? 1 : 0, borderTopColor: base.line }}>
            <Text style={{ minWidth: 26, textAlign: 'center', fontWeight: '800', color: '#fff', backgroundColor: tone[x.tone], borderRadius: 13, paddingVertical: 2, overflow: 'hidden' }}>{x.n}</Text>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: base.ink }}>{x.t}</Text><Muted>{x.s}</Muted></View>
            <Text style={{ color: base.slate }}>›</Text>
          </Pressable>
        ))}
      </Card>
    </>
  );
}
