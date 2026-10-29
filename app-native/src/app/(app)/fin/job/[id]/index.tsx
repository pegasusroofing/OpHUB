// One project's Finance page (900 renderSiteFinance + 911 cards + 9219n/9219u
// layout): Overview (project summary, cost to date, retention), Sales,
// Purchases, Subcontractors & Labour, and Set-up (contract, billing, client POs).
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { FinChip, FinRow, FinStat } from '@/components/FinNav';
import { PurchasesLists } from '@/components/FinPurchases';
import { SalesLists } from '@/components/FinSales';
import { SubsLists } from '@/components/FinSubs';
import { useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { deleteClientPo, saveClientPo, saveJobFinance, saveJobNumber, useBook } from '@/data/finBook';
import { openDocLink } from '@/data/hs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { COST_CATS, forecast, marginOn, pctTxt } from '@/lib/rules/finBook';
import { FIN_VAT_LABEL, fdate, money, num, retentionAlerts, retentionDates, retHalf } from '@/lib/rules/finance';
import { isFinanceUser } from '@/lib/roles';
import { base, space } from '@/theme/theme';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const TABS: [string, string][] = [['overview', 'Overview'], ['sales', 'Sales'], ['purchases', 'Purchases'], ['subs', 'Subcontractors & Labour'], ['setup', 'Set-up']];

export default function FinJob() {
  const { id, tab = 'overview' } = useLocalSearchParams<{ id: string; tab?: string }>();
  const { me, org } = useAuth();
  const { data: site } = useSite(id);
  const { data, isLoading } = useBook(me?.org_id, id);
  const [sub, setSub] = useState<Record<string, string>>({ sales: 'invoices', purchases: 'orders', subs: 'orders' });
  if (!me) return null;
  if (!isFinanceUser(me, org)) return <Muted style={{ padding: space.l }}>OpHUB Finance isn&apos;t switched on for your account.</Muted>;
  const s = site as (typeof site & Row) | undefined;
  const title = s ? `${s.job_number ? `${s.job_number} · ` : ''}${s.name}` : 'Project';
  const fc = data ? forecast(data.book, id, data.settings) : null;
  const subTabs = (k: string, opts: [string, string][]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>{opts.map(([v, l]) => <FinChip key={v} on={sub[k] === v} label={l} onPress={() => setSub({ ...sub, [k]: v })} />)}</View>
  );
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 1000, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
        {TABS.filter(([k]) => k !== 'boq').map(([k, l]) => <FinChip key={k} on={tab === k} label={l} onPress={() => router.setParams({ tab: k })} />)}
        {fc && !fc.isInvoiceJob && <FinChip on={false} label="Bill of Quantities" onPress={() => router.push(`/fin/job/${id}/boq` as never)} />}
      </ScrollView>
      {isLoading || !fc || !data ? <Muted>Loading…</Muted> : tab === 'overview' ? <Overview id={id} fc={fc} settings={data.settings} />
        : tab === 'sales' ? <>{subTabs('sales', [['invoices', 'Invoices'], ['apps', 'Applications & Certificates'], ['retention', 'Retention']])}<SalesLists key={sub.sales} tab={sub.sales as 'invoices'} siteId={id} /></>
        : tab === 'purchases' ? <>{subTabs('purchases', [['orders', 'Purchase orders'], ['invoices', 'Purchase invoices'], ['plant', 'Plant hire']])}<PurchasesLists key={sub.purchases} tab={sub.purchases as 'orders'} siteId={id} /></>
        : tab === 'subs' ? <>{subTabs('subs', [['orders', 'Subcontractor POs'], ['apps', 'Applications'], ['opinv', 'Operative invoices']])}<SubsLists key={sub.subs} tab={sub.subs as 'orders'} siteId={id} /></>
        : <Setup id={id} site={s} jf={fc.jf} cpos={data.book.cpos.filter((p) => p.site_id === id)} settings={data.settings} />}
    </ScrollView>
  );
}

function Overview({ id, fc, settings }: { id: string; fc: ReturnType<typeof forecast>; settings: Row }) {
  const on = marginOn(fc), mg = on.value - fc.costToDate, mp = on.value ? (mg / on.value) * 100 : null;
  const tone = (n: number | null) => (n == null || Math.abs(n) < 0.005 ? undefined : n < 0 ? '#C0392B' : '#1E7A3C');
  const waiting = fc.lines.filter((l) => l.waiting && l.cat !== 'labour').reduce((t, l) => t + l.net, 0);
  const d = retentionDates(fc.jf, settings), alerts = retentionAlerts(fc.jf, settings, fc.retHeld);
  return (
    <View>
      <SectionTitle>Project summary</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <FinStat v={money(fc.ffa, 0)} label={fc.ffaFromInvoiced ? 'Expected final value (= invoiced)' : `Expected final value${fc.vPending ? ` · incl. ${money(fc.vPending, 0)} submitted` : ''}`} />
        <FinStat v={fc.budgetTotal != null ? money(fc.budgetTotal, 0) : '—'} label={fc.budgetTotal == null ? 'Budget not set' : `Budget${fc.budgetSource === 'schedule' ? ' (from the schedule)' : ''}`} onPress={() => router.push(`/fin/job/${id}/budget` as never)} />
        <FinStat v={fc.budgetTotal == null ? '—' : money(fc.forecastMargin, 0)} label={`Expected profit${fc.budgetTotal == null ? ' — needs a budget' : ` · ${pctTxt(fc.forecastMarginPct)}`}`} hot={fc.forecastMargin < 0} />
        <FinStat v={money(fc.sales, 0)} label={fc.isInvoiceJob ? 'Invoiced to date' : 'Work valued to date'} />
        <FinStat v={money(fc.costToDate, 0)} label={`Cost to date${fc.committedTotal ? ` · + ${money(fc.committedTotal, 0)} ordered` : ''}`} />
        <FinStat v={money(mg, 0)} label={`Profit to date on ${on.label} · ${pctTxt(mp)}${fc.ohpPct ? ' (before overheads)' : ''}`} hot={mg < 0} />
      </View>
      <Card><Text style={{ color: base.ink }}>Contract {money(fc.contract, 0)} · agreed variations {money(fc.vAgreed, 0)}{fc.vPending ? ` · waiting for agreement ${money(fc.vPending, 0)}` : ''} · <Text style={{ fontWeight: '800' }}>Expected final cost {money(fc.forecastCost, 0)}</Text>{fc.ohpPct ? ` · company overheads ${fc.ohpPct}%` : ''}</Text></Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {[['Detailed summary', `/fin/job/${id}/summary`], ['Budget', `/fin/job/${id}/budget`], ['Variations', `/fin/job/${id}/variations`], ['Costs ledger', `/fin/job/${id}/costs`]].map(([l, p]) => <View key={l}><Button kind="ghost" title={`${l} ›`} onPress={() => router.push(p as never)} /></View>)}
      </View>
      <SectionTitle>Project cost to date (excl. VAT)</SectionTitle>
      <Card>
        <FinRow title="Contract value" right={money(fc.contract, 0)} /><FinRow title="Invoiced to client" right={money(fc.invoiced, 0)} />
        {fc.cats.filter((k) => fc.actual[k] || k === 'materials' || k === 'labour').map((k) => <FinRow key={k} title={COST_CATS[k]} sub={k === 'materials' && waiting ? `+ ${money(waiting, 0)} waiting approval` : undefined} right={money(fc.actual[k], 0)} />)}
        <FinRow title="Committed" sub="ordered, not invoiced" right={money(fc.committedTotal, 0)} />
        <FinRow title="Costs to date" right={money(fc.costToDate, 0)} />
        {fc.invoiced > 0 && <FinRow title="Invoiced less costs" right={money(fc.invoiced - fc.costToDate, 0)} tone={tone(fc.invoiced - fc.costToDate)} />}
      </Card>
      {!fc.isInvoiceJob && (
        <>
          <SectionTitle>Retention</SectionTitle>
          <Card>
            {alerts.map((a) => <Text key={a.half} style={{ color: '#D98A00', fontWeight: '700' }}>{a.half === 1 ? 'First' : 'Second'} half due {fdate(a.date)}</Text>)}
            <FinRow title="Held to date" right={money(fc.retHeld)} />
            <FinRow title="First half — at practical completion" sub={d.first ? fdate(d.first) : 'Set the practical completion date in Set-up'} right={money(retHalf(fc.retHeld, 1))} />
            <FinRow title="Second half — end of defects period" sub={d.second ? fdate(d.second) : '—'} right={money(retHalf(fc.retHeld, 2))} />
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
  const [edit, setEdit] = useState<'job' | 'po' | null>(null);
  const [po, setPo] = useState<Row | null>(null);
  const [file, setFile] = useState<{ uri: string; name: string; mimeType?: string | null } | null>(null);
  if (!me) return null;
  const refresh = () => { ['finBook', 'finJobs', 'finOverview', 'sites'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  const kv = (l: string, v: string) => <FinRow key={l} title={l} right={v} />;
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
        {kv('Company overheads', jf.ohp_pct != null ? `${jf.ohp_pct}%` : `${settings.ohp_pct ?? 0}% (company)`)}
        <View style={{ marginTop: 8 }}><Button title="Edit project details" onPress={() => setEdit('job')} /></View>
      </Card>
      <SectionTitle>Client POs</SectionTitle>
      {cpos.length ? cpos.map((p) => (
        <FinRow key={p.id} title={`PO ${p.po_number}${p.is_primary ? ' (main)' : ''}`} sub={[p.po_date ? fdate(p.po_date) : '', p.description, Array.isArray(p.files) && p.files.length ? `${p.files.length} file${p.files.length === 1 ? '' : 's'}` : p.file_name ? '1 file' : ''].filter(Boolean).join(' · ')} onPress={() => { setPo(p); setFile(null); setEdit('po'); }} />
      )) : <Muted style={{ marginBottom: 8 }}>No client PO yet.</Muted>}
      <Button kind="ghost" title="+ Client PO" onPress={() => { setPo(null); setFile(null); setEdit('po'); }} />
      {edit === 'job' && (
        <FinForm title="Project details" initial={{ ...jf, job_number: site?.job_number || '', billing_type: jf.billing_type || '' }} onClose={() => setEdit(null)}
          fields={[
            { k: 'job_number', label: 'Project number', half: true }, { k: 'contract_value', label: 'Contract value £ (excl. VAT)', kind: 'money', half: true },
            { k: 'billing_type', label: 'Billed by', kind: 'choice', options: [['invoice', 'Invoice'], ['application', 'Application (with retention)']], note: 'Invoice jobs have no applications or retention.' },
            { k: 'retention_pct', label: 'Retention %', kind: 'number', half: true, ph: String(settings.default_retention_pct) }, { k: 'retention_limit_pct', label: 'Retention limit %', kind: 'number', half: true },
            { k: 'due_days', label: 'Payment due (days)', kind: 'number', half: true, ph: String(settings.default_due_days) }, { k: 'final_days', label: 'Final date (days)', kind: 'number', half: true, ph: String(settings.default_final_days) },
            { k: 'vat_treatment', label: 'VAT', kind: 'choice', options: [['', 'Company default'], ...Object.entries(FIN_VAT_LABEL)] as [string, string][] },
            { k: 'app_reminder_day', label: 'Application date (day of month)', kind: 'number', half: true }, { k: 'ohp_pct', label: `Company overheads % (blank = ${settings.ohp_pct ?? 0}%)`, kind: 'number', half: true, note: me.role === 'admin' ? undefined : 'Only a company admin can change this.' },
            { k: 'billing_name', label: 'Bill to (client)' }, { k: 'billing_address', label: 'Billing address', kind: 'multiline' }, { k: 'billing_email', label: 'Accounts email', kind: 'email' },
            { k: 'pc_date', label: 'Practical completion date', kind: 'date', half: true }, { k: 'defects_months', label: 'Defects period (months)', kind: 'number', half: true },
            { k: 'notes', label: 'Notes', kind: 'multiline' },
          ]}
          onSave={async (v) => {
            const n = (k: string) => { const x = num(v[k]); return x === null ? null : x; };
            const contract = n('contract_value'), ret = n('retention_pct'), retLim = n('retention_limit_pct'), appDay = n('app_reminder_day');
            if (contract !== null && (isNaN(contract) || contract < 0)) return 'Enter the contract value as a number.';
            if (ret !== null && (isNaN(ret) || ret < 0 || ret > 100)) return 'Retention must be between 0 and 100%.';
            if (retLim !== null && (isNaN(retLim) || retLim < 0 || retLim > 100)) return 'Retention limit must be between 0 and 100%.';
            if (appDay !== null && (isNaN(appDay) || appDay < 1 || appDay > 31)) return 'Application date must be a day of the month, 1 to 31.';
            const email = String(v.billing_email).trim();
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid accounts email.';
            const jobNo = String(v.job_number).trim();
            if (jobNo !== String(site?.job_number || '')) { if (!jobNo) return 'A project needs a project number.'; if (!(await saveJobNumber(id, jobNo))) return 'Could not save the project number.'; }
            const patch: Row = {
              contract_value: contract, retention_pct: ret, retention_limit_pct: retLim, due_days: n('due_days'), final_days: n('final_days'), app_reminder_day: appDay,
              vat_treatment: v.vat_treatment || null, billing_type: v.billing_type || null, billing_name: String(v.billing_name).trim() || null, billing_address: String(v.billing_address).trim() || null, billing_email: email || null,
              pc_date: String(v.pc_date).trim() || null, defects_months: n('defects_months'), notes: String(v.notes).trim() || null,
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
            <Pressable key={f.path} onPress={async () => { const u = await openDocLink('finance-docs', f.path); if (u) void Linking.openURL(u); }}><Text style={{ color: base.blue }}>📄 {f.name}</Text></Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
