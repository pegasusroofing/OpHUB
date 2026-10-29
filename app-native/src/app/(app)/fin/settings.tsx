// Finance › Settings (900 renderFinanceSettings / saveFinanceSettings):
// project and invoice numbering, default retention / terms / VAT /
// application date, company overheads (admins), company and bank details
// for invoices, CIS references — plus Xero's connection status. The counters
// are only written back when they were changed, so a form left open can't
// wind them back. The purchase-order switch isn't changed here during the trial.
// Also: who can see material costs (916: profiles.see_costs — admins with
// Finance switch people on) and the invoice inbox address (906: a private key
// in fin_settings; while Finance is on trial nothing that arrives is read or filed).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { FinPage, FinRow } from '@/components/FinNav';
import { XeroSettings } from '@/components/FinXero';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, TINTS } from '@/components/ui';
import { fdb, finInvoke, useFinSettings } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { isFinanceUser, roleLabel } from '@/lib/roles';
import { SUPABASE_URL } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { FIN_TRIAL, FIN_VAT_LABEL, num, vatList, type VatRate } from '@/lib/rules/finance';
import { base, radius } from '@/theme/theme';

type Row = Record<string, any>;

export default function FinSettings() {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: st } = useFinSettings(me?.org_id);
  const { data: sites = [] } = useSites();
  const { data: o } = useQuery({ queryKey: ['finOrgNums', me?.org_id], enabled: !!me, queryFn: async () => (await fdb.from('organizations').select('auto_job_numbers,job_number_prefix,next_job_number').eq('id', me?.org_id as string).maybeSingle()).data as Row | null });
  const { data: xero } = useQuery({ queryKey: ['finXeroStatus', me?.org_id], enabled: !!me, queryFn: async () => (me ? finInvoke<Row>(me, 'xero', { action: 'status' }) : null) });
  const [edit, setEdit] = useState(false);
  const [openS, setOpenS] = useState<string[]>([]);
  const { data: team, refetch: refetchTeam } = useQuery({ queryKey: ['finSeeCosts', me?.org_id], enabled: !!me && openS.includes('costs'), queryFn: async () =>
    (((await fdb.from('profiles').select('*').eq('org_id', me?.org_id as string)).data as Profile[] | null) ?? [])
      .filter((p) => !p.finance_enabled && ['pm', 'site_manager', 'operative', 'admin'].includes(p.role)).sort((x, y) => String(x.name).localeCompare(String(y.name))) });
  const setSeeCosts = async (p: Profile, on: boolean) => {
    const r = await fdb.from('profiles').update({ see_costs: on } as never).eq('id', p.id).select('see_costs');
    const ok = !r.error && ((r.data as { see_costs: boolean }[] | null) ?? [])[0]?.see_costs === on;
    toast(!ok ? 'Only an admin with Finance can change this.' : on ? 'They can now see material costs' : 'Material costs hidden from them');
    void refetchTeam();
  };
  const newInboxKey = async () => {
    if (!me) return;
    if (s0.inbox_key && !(await confirmAsk('Make a new inbox key? The old address stops working, so update your email forwarding afterwards.', 'Make a new key'))) return;
    const bytes = new Uint8Array(24); globalThis.crypto.getRandomValues(bytes);
    const key = Array.from(bytes, (b) => `0${b.toString(16)}`.slice(-2)).join('');
    const r = await fdb.from('fin_settings').upsert({ org_id: me.org_id, inbox_key: key, updated_at: new Date().toISOString(), updated_by: me.id } as never, { onConflict: 'org_id' });
    if (r.error) { toast(`Could not make a key — ${r.error.message}`); return; }
    toast('New inbox key made — update it in your email forwarding'); void qc.invalidateQueries({ queryKey: ['finSettings'] });
  };
  if (!me) return null;
  const s = (st || {}) as Row;
  const s0 = s;
  const canEditCosts = me.role === 'admin' && isFinanceUser(me, org);
  const initial = { ...s, auto_job_numbers: !!o?.auto_job_numbers, job_number_prefix: o?.job_number_prefix || '', next_job_number: o?.next_job_number ?? '' };
  const xs = xero?.data, xErr = xero?.error;
  return (
    <FinPage title="Finance settings" section="settings" sub="general" onSub={(k) => router.push((k === 'codes' ? '/fin/directory?kind=codes' : '/fin/settings') as never)}>
      {/* Each part opens on its own (the current app's settings list); Edit settings changes them all. */}
      {([
        ['costs', 'Who can see material costs', '👁', 'blue', []],
        ['nums', 'Project numbers', '#', 'red', [['Project numbers', o?.auto_job_numbers ? `Automatic · next ${o.job_number_prefix || ''}${o.next_job_number ?? ''}` : 'Typed by hand']]],
        ['po', 'Purchase orders', '📄', 'orange', [['Purchase orders from Finance', `${s.po_enabled ? 'On' : 'Off'}${FIN_TRIAL ? ' (not changed during the trial)' : ''}`]]],
        ['vat', 'VAT rates', '%', 'green', [['Default VAT', FIN_VAT_LABEL[s.default_vat] || '—']]],
        ['inv', 'Invoice numbers', 'Nº', 'green', [['Next invoice number', `${s.invoice_prefix || ''}${s.next_invoice_number ?? ''}`]]],
        ['def', 'Defaults for new projects', '⚙', 'grey', [['Retention', `${s.default_retention_pct ?? 5}%`], ['Payment terms', `${s.default_due_days ?? 30} days · final ${s.default_final_days ?? 14} days`], ['Application date', s.app_reminder_day ? `${s.app_reminder_day} of each month` : 'Not set']]],
        ['ohp', 'Company overheads (OHP)', '%', 'orange', [['Company overheads', `${s.ohp_pct ?? 0}%`]]],
        ['bill', 'On your invoices', '🏛', 'grey', [['Company address', s.company_address || '—'], ['VAT no.', s.company_vat_no || '—'], ['Company no.', s.company_reg_no || '—'], ['Bank', [s.bank_name, s.bank_account_name, s.bank_sort_code, s.bank_account_no].filter(Boolean).join(' · ') || '—'], ['Contractor UTR (CIS)', s.contractor_utr || '—'], ['Employer ref', s.employer_ref || '—']]],
        ['inbox', 'Invoice inbox (email)', '✉', 'purple', []],
        ['xero', 'Xero', '🔗', 'blue', []],
      ] as [string, string, string, keyof typeof TINTS, [string, string][]][]).map(([k, title, ic, tn, rows]) => {
        const on = openS.includes(k);
        return (
          <View key={k} style={{ marginBottom: 8 }}>
            <Pressable onPress={() => setOpenS(on ? openS.filter((x) => x !== k) : [...openS, k])} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: TINTS[tn][0], alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 12, fontWeight: '800', color: TINTS[tn][1] }}>{ic}</Text></View>
              <Text style={{ flex: 1, fontWeight: '800', color: '#111827', fontSize: 13 }}>{title}</Text>
              <Text style={{ fontSize: 10, color: '#111827' }}>{on ? '▼' : '▶'}</Text>
            </Pressable>
            {on && (
              <Card style={{ marginTop: 6, marginBottom: 0 }}>
                {k === 'costs' ? (
                  <>
                    <Muted style={{ marginBottom: 8 }}>Prices on project quotes (and in the Materials tile) are hidden from everyone except Finance users and the people switched on here.</Muted>
                    {!team ? <Muted>Loading…</Muted> : team.length ? team.map((p) => (
                      <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
                        <Text style={{ flex: 1, color: base.ink }}>{p.name} <Text style={{ fontSize: 12, color: base.slate, fontStyle: 'italic' }}>{roleLabel(p)}</Text></Text>
                        {canEditCosts
                          ? <Pressable onPress={() => void setSeeCosts(p, !p.see_costs)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <View style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: p.see_costs ? '#15803d' : '#d1d5db', padding: 2, alignItems: p.see_costs ? 'flex-end' : 'flex-start' }}><View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff' }} /></View>
                              <Text style={{ fontWeight: '700', color: base.ink, minWidth: 54 }}>{p.see_costs ? 'Can see' : 'Hidden'}</Text>
                            </Pressable>
                          : <Text style={{ fontWeight: '700', color: base.ink }}>{p.see_costs ? 'Can see' : 'Hidden'}</Text>}
                      </View>
                    )) : <Muted>Nobody else in the team yet.</Muted>}
                    {!canEditCosts && <Muted style={{ marginTop: 6 }}>Only an admin with Finance can change these.</Muted>}
                  </>
                ) : k === 'inbox' ? (
                  <>
                    <Muted style={{ marginBottom: 8 }}>Set up a shared mailbox such as invoices@ in Microsoft 365, and have its attachments sent to the address below — Power Automate (“When a new email arrives in a shared mailbox” → HTTP POST), Zapier or Make can all do this. Purchase invoices then appear in Finance › Purchases › Purchase invoices, already read. Keep this address private: anyone with it can add invoices to your inbox.</Muted>
                    {FIN_TRIAL && <Muted style={{ marginBottom: 8, color: '#b45309' }}>While Finance is on trial, invoices that arrive are kept but not read or filed automatically — allocate them by hand.</Muted>}
                    {!!s.inbox_key && (
                      <>
                        <Text selectable style={{ fontSize: 12, color: base.ink, backgroundColor: '#F6F7F9', borderRadius: 6, padding: 8 }}>{`${SUPABASE_URL}/functions/v1/finance-inbox?key=${s.inbox_key}`}</Text>
                        <Muted style={{ marginTop: 6, fontSize: 12 }}>Send JSON: {'{"from": "...", "subject": "...", "attachments": [{"filename": "...", "content_type": "application/pdf", "content_base64": "..."}]}'}. Power Automate’s own attachment format (Name, ContentType, ContentBytes) also works.</Muted>
                      </>
                    )}
                    {me.role === 'admin' && <View style={{ marginTop: 8 }}><Button kind="ghost" title={s.inbox_key ? 'Make a new key (stops the old one)' : 'Make an inbox key'} onPress={() => void newInboxKey()} /></View>}
                  </>
                ) : k === 'xero' ? (
                  <>
                    {xErr ? <Muted>{/not_configured|not connected/i.test(xErr) ? 'Xero isn’t connected.' : `Xero: ${xErr}`}</Muted> : xs ? <Text style={{ color: xs.connected ? '#1E7A3C' : base.slate }}>{xs.connected ? `Connected${xs.tenant_name ? ` to ${xs.tenant_name}` : ''}` : 'Not connected'}</Text> : <Muted>Checking…</Muted>}
                    {FIN_TRIAL && <Muted style={{ marginTop: 6 }}>While Finance is on trial nothing is posted to Xero. Reading and adding clients and suppliers still works.</Muted>}
                    {xs?.connected && me.role === 'admin' && <XeroSettings s={s} />}
                    {xs && !xs.connected && <View style={{ marginTop: 8 }}><Button kind="ghost" title="Connect Xero" onPress={async () => { const r = await finInvoke<Row>(me, 'xero', { action: 'connect', origin: Platform.OS === 'web' ? window.location.origin : null }); if (r.error || !r.data?.url) { toast(r.error || 'Could not start the Xero connection.'); return; } if (Platform.OS === 'web') window.location.href = r.data.url; else void Linking.openURL(r.data.url); }} /></View>}
                  </>
                ) : k === 'vat' ? (
                  <>{rows.map(([l, v]) => <FinRow key={l} title={l} right={v} />)}<VatRates s={s} canEdit={me.role === 'admin' && isFinanceUser(me, org)} onSaved={() => void qc.invalidateQueries({ queryKey: ['finSettings'] })} /></>
                ) : rows.map(([l, v]) => <FinRow key={l} title={l} right={v} />)}
              </Card>
            )}
          </View>
        );
      })}
      <View style={{ alignSelf: 'flex-start', marginTop: 6 }}><Button title="Edit settings" onPress={() => setEdit(true)} /></View>
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

// The company's VAT rates (9219o): the rates you can pick on purchase orders and as a client's or supplier's
// default in the Directory. Built-in rates keep their rate; switch one off to hide it (anything already using
// it keeps it). Kept in fin_settings.vat_rates.
function VatRates({ s, canEdit, onSaved }: { s: Row; canEdit: boolean; onSaved: () => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const [list, setList] = useState<VatRate[]>(() => vatList(s));
  const [dirty, setDirty] = useState(false);
  const set = (i: number, p: Partial<VatRate>) => { setList(list.map((r, j) => (j === i ? { ...r, ...p } : r))); setDirty(true); };
  const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 6, color: base.ink, backgroundColor: base.card };
  return (
    <View style={{ marginTop: 8 }}>
      <Muted style={{ marginBottom: 8 }}>The rates you can pick on purchase orders and as a client’s or supplier’s default in the Directory. Switch one off to hide it; anything already using it keeps it. Reverse charge: no VAT goes on the invoice — the customer accounts for it.</Muted>
      {list.map((r, i) => (
        <View key={r.code} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, opacity: r.active ? 1 : 0.5 }}>
          <TextInput editable={canEdit} value={r.name} onChangeText={(v) => set(i, { name: v })} style={[box, { flex: 1 }]} />
          <TextInput editable={canEdit && !!r.custom} value={String(r.rate)} onChangeText={(v) => set(i, { rate: Math.max(0, Math.min(100, Number(v) || 0)) })} keyboardType="decimal-pad" style={[box, { width: 56 }]} />
          <Text style={{ color: base.slate }}>%</Text>
          <Pressable disabled={!canEdit || !r.custom} onPress={() => set(i, { rc: !r.rc })}><Text style={{ color: base.ink }}>{r.rc ? '☑' : '☐'} RC</Text></Pressable>
          <Pressable disabled={!canEdit} onPress={() => set(i, { active: !r.active })}><Text style={{ color: base.ink }}>{r.active ? '☑' : '☐'} In use</Text></Pressable>
        </View>
      ))}
      {canEdit && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Button kind="ghost" title="+ Add VAT rate" onPress={() => { setList([...list, { code: `c${Date.now().toString(36)}`, name: '', rate: 0, rc: false, active: true, custom: true }]); setDirty(true); }} />
          {dirty && <Button title="Save VAT rates" onPress={async () => {
            const out = list.filter((r) => r.name.trim() || !r.custom).map((r) => ({ ...r, name: r.name.trim() || r.code }));
            if (!out.some((r) => r.active)) { toast('Keep at least one VAT rate switched on.'); return; }
            const res = await fdb.from('fin_settings').update({ vat_rates: out } as never).eq('org_id', me?.org_id as string);
            if (res.error) { toast('VAT rates not saved — try again.'); return; }
            toast('VAT rates saved'); setDirty(false); onSaved();
          }} />}
        </View>
      )}
    </View>
  );
}
