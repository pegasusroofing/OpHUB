// Finance › Settings (900 renderFinanceSettings / saveFinanceSettings):
// project and invoice numbering, default retention / terms / VAT /
// application date, company overheads (admins), company and bank details
// for invoices, CIS references — plus Xero's connection status. The counters
// are only written back when they were changed, so a form left open can't
// wind them back. The purchase-order switch isn't changed here during the trial.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { FinPage, FinRow } from '@/components/FinNav';
import { useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { fdb, finInvoke, useFinSettings } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { FIN_TRIAL, FIN_VAT_LABEL, num } from '@/lib/rules/finance';
import { base } from '@/theme/theme';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default function FinSettings() {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: st } = useFinSettings(me?.org_id);
  const { data: sites = [] } = useSites();
  const { data: o } = useQuery({ queryKey: ['finOrgNums', me?.org_id], enabled: !!me, queryFn: async () => (await fdb.from('organizations').select('auto_job_numbers,job_number_prefix,next_job_number').eq('id', me?.org_id as string).maybeSingle()).data as Row | null });
  const { data: xero } = useQuery({ queryKey: ['finXeroStatus', me?.org_id], enabled: !!me, queryFn: async () => (me ? finInvoke<Row>(me, 'xero', { action: 'status' }) : null) });
  const [edit, setEdit] = useState(false);
  if (!me) return null;
  const s = (st || {}) as Row;
  const initial = { ...s, auto_job_numbers: !!o?.auto_job_numbers, job_number_prefix: o?.job_number_prefix || '', next_job_number: o?.next_job_number ?? '' };
  const xs = xero?.data, xErr = xero?.error;
  return (
    <FinPage title="Settings" section="settings" sub="general" onSub={(k) => router.push((k === 'codes' ? '/fin/directory?kind=codes' : k === 'directory' ? '/fin/directory' : '/fin/settings') as never)}>
      <SectionTitle>Numbers and defaults</SectionTitle>
      <Card>
        <FinRow title="Project numbers" right={o?.auto_job_numbers ? `Automatic · next ${o.job_number_prefix || ''}${o.next_job_number ?? ''}` : 'Typed by hand'} />
        <FinRow title="Invoice numbers" right={`${s.invoice_prefix || ''}${s.next_invoice_number ?? ''} next`} />
        <FinRow title="Retention" right={`${s.default_retention_pct ?? 5}%`} /><FinRow title="Payment terms" right={`${s.default_due_days ?? 30} days · final ${s.default_final_days ?? 14} days`} />
        <FinRow title="VAT" right={FIN_VAT_LABEL[s.default_vat] || '—'} /><FinRow title="Application date" right={s.app_reminder_day ? `${s.app_reminder_day} of each month` : 'Not set'} />
        <FinRow title="Company overheads (OHP)" right={`${s.ohp_pct ?? 0}%`} /><FinRow title="Purchase orders from Finance" right={`${s.po_enabled ? 'On' : 'Off'}${FIN_TRIAL ? ' (not changed during the trial)' : ''}`} />
      </Card>
      <SectionTitle>On your invoices</SectionTitle>
      <Card>
        <FinRow title="Company address" right={s.company_address || '—'} /><FinRow title="VAT no." right={s.company_vat_no || '—'} /><FinRow title="Company no." right={s.company_reg_no || '—'} />
        <FinRow title="Bank" right={[s.bank_name, s.bank_account_name, s.bank_sort_code, s.bank_account_no].filter(Boolean).join(' · ') || '—'} />
        <FinRow title="Contractor UTR (CIS)" right={s.contractor_utr || '—'} /><FinRow title="Employer ref" right={s.employer_ref || '—'} />
      </Card>
      <Button title="Edit settings" onPress={() => setEdit(true)} />
      <SectionTitle>Xero</SectionTitle>
      <Card>
        {xErr ? <Muted>{/not_configured|not connected/i.test(xErr) ? 'Xero isn’t connected.' : `Xero: ${xErr}`}</Muted> : xs ? <Text style={{ color: xs.connected ? '#1E7A3C' : base.slate }}>{xs.connected ? `Connected${xs.tenant_name ? ` to ${xs.tenant_name}` : ''}` : 'Not connected'}</Text> : <Muted>Checking…</Muted>}
        {FIN_TRIAL && <Muted style={{ marginTop: 6 }}>While Finance is on trial nothing is posted to Xero. Reading and adding clients and suppliers still works.</Muted>}
        {xs && !xs.connected && <View style={{ marginTop: 8 }}><Button kind="ghost" title="Connect Xero" onPress={async () => { const r = await finInvoke<Row>(me, 'xero', { action: 'connect', origin: Platform.OS === 'web' ? window.location.origin : null }); if (r.error || !r.data?.url) { toast(r.error || 'Could not start the Xero connection.'); return; } if (Platform.OS === 'web') window.location.href = r.data.url; else void Linking.openURL(r.data.url); }} /></View>}
      </Card>
      {edit && (
        <FinForm title="Finance settings" initial={initial} onClose={() => setEdit(false)}
          fields={[
            { k: 'auto_job_numbers', label: 'Number new projects automatically', kind: 'check' }, { k: 'job_number_prefix', label: 'Project number prefix', half: true }, { k: 'next_job_number', label: 'Next project number', kind: 'number', half: true },
            { k: 'invoice_prefix', label: 'Invoice prefix', half: true }, { k: 'next_invoice_number', label: 'Next invoice number', kind: 'number', half: true },
            { k: 'default_retention_pct', label: 'Default retention %', kind: 'number', half: true }, { k: 'app_reminder_day', label: 'Application date (day of month)', kind: 'number', half: true },
            { k: 'default_due_days', label: 'Payment due (days)', kind: 'number', half: true }, { k: 'default_final_days', label: 'Final date (days)', kind: 'number', half: true },
            { k: 'default_vat', label: 'Default VAT', kind: 'choice', options: Object.entries(FIN_VAT_LABEL) }, ...(me.role === 'admin' ? [{ k: 'ohp_pct', label: 'Company overheads % (OHP)', kind: 'number' as const }] : []),
            { k: 'company_address', label: 'Company address', kind: 'multiline' }, { k: 'company_vat_no', label: 'VAT number', half: true }, { k: 'company_reg_no', label: 'Company number', half: true },
            { k: 'bank_name', label: 'Bank', half: true }, { k: 'bank_account_name', label: 'Account name', half: true }, { k: 'bank_sort_code', label: 'Sort code', half: true }, { k: 'bank_account_no', label: 'Account number', half: true },
            { k: 'invoice_footer', label: 'Invoice footer', kind: 'multiline' }, { k: 'contractor_utr', label: 'Contractor UTR (CIS)', half: true }, { k: 'employer_ref', label: 'Employer reference', half: true },
          ]}
          onSave={async (v) => {
            const auto = !!v.auto_job_numbers, prefix = String(v.job_number_prefix || '').trim(), nextJob = num(v.next_job_number), invNext = num(v.next_invoice_number);
            const ret = num(v.default_retention_pct), appDay = num(v.app_reminder_day), due = num(v.default_due_days), fin = num(v.default_final_days);
            if (auto && (!nextJob || nextJob < 1)) return 'Enter the next project number.';
            if (auto) { const clash = sites.find((x) => String((x as Row).job_number || '').trim().toLowerCase() === `${prefix}${nextJob}`.toLowerCase()); if (clash) return `Project number ${prefix}${nextJob} is already used on ${clash.name}. Pick a higher number.`; }
            if (!invNext || invNext < 1) return 'Enter the next invoice number.';
            if (ret === null || isNaN(ret) || ret < 0 || ret > 100) return 'Retention must be between 0 and 100%.';
            if (appDay !== null && (isNaN(appDay) || appDay < 1 || appDay > 31)) return 'Application date must be a day of the month, 1 to 31.';
            const t = (k: string) => String(v[k] ?? '').trim() || null;
            const body: Row = { org_id: me.org_id, invoice_prefix: String(v.invoice_prefix ?? ''), default_retention_pct: ret, default_due_days: due === null || isNaN(due) ? 30 : due, default_final_days: fin === null || isNaN(fin) ? 14 : fin, default_vat: v.default_vat || 'standard', app_reminder_day: appDay, updated_at: new Date().toISOString(), updated_by: me.id, contractor_utr: t('contractor_utr'), employer_ref: t('employer_ref'), company_address: t('company_address'), company_vat_no: t('company_vat_no'), company_reg_no: t('company_reg_no'), bank_name: t('bank_name'), bank_account_name: t('bank_account_name'), bank_sort_code: t('bank_sort_code'), bank_account_no: t('bank_account_no'), invoice_footer: t('invoice_footer') };
            // Counters only when changed, so an old form can't wind them back.
            if (String(invNext) !== String(s.next_invoice_number ?? '')) body.next_invoice_number = invNext;
            if (me.role === 'admin') { const oh = num(v.ohp_pct); if (oh !== null && (isNaN(oh) || oh < 0 || oh > 100)) return 'Overheads must be between 0 and 100%.'; body.ohp_pct = oh; }
            const orgPatch: Row = {};
            if (!!o?.auto_job_numbers !== auto) orgPatch.auto_job_numbers = auto;
            if (String(o?.job_number_prefix || '') !== prefix) orgPatch.job_number_prefix = prefix;
            if (String(o?.next_job_number ?? '') !== String(nextJob ?? '')) orgPatch.next_job_number = nextJob || null;
            let orgNote = '';
            if (Object.keys(orgPatch).length) { const r = await fdb.from('organizations').update(orgPatch as never).eq('id', org?.id || (me.org_id as string)).select('id'); if (r.error || !(r.data as unknown[] | null)?.length) orgNote = ' The project number settings can only be changed by an admin.'; }
            const r = await fdb.from('fin_settings').upsert(body as never, { onConflict: 'org_id' });
            if (r.error) return `Save failed — ${r.error.message}`;
            toast(`Finance settings saved.${orgNote}`); ['finSettings', 'finOrgNums'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); return null;
          }} />
      )}
    </FinPage>
  );
}
