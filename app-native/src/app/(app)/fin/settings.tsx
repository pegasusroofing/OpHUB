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

import { FinForm, type Field } from '@/components/FinForm';
import { FinPage, finSettingsGo, FinRow } from '@/components/FinNav';
import { XeroSettings } from '@/components/FinXero';
import { OphIcon } from '@/components/OphIcon';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { fdb, finInvoke, useFinSettings } from '@/data/finance';
import { nameOf, usePeople } from '@/data/hs';
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
  const [edit, setEdit] = useState<string | null>(null); // which part is being edited
  const [openS, setOpenS] = useState<string[]>([]);
  const { data: team, refetch: refetchTeam } = useQuery({ queryKey: ['finSeeCosts', me?.org_id], enabled: !!me && openS.includes('costs'), queryFn: async () =>
    (((await fdb.from('profiles').select('*').eq('org_id', me?.org_id as string)).data as Profile[] | null) ?? [])
      .filter((p) => !p.finance_enabled && ['pm', 'site_manager', 'operative', 'admin'].includes(p.role)).sort((x, y) => String(x.name).localeCompare(String(y.name))) });
  const setSeeCosts = async (p: Profile, on: boolean) => {
    const r = await fdb.from('profiles').update({ see_costs: on } as never).eq('id', p.id).select('see_costs');
    const ok = !r.error && ((r.data as { see_costs: boolean }[] | null) ?? [])[0]?.see_costs === on;
    if (!ok) toast('Only an admin with Finance can change this.');
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
  // Expense receipts sent in from jobs go to one Finance person to book (Andy, 7 Nov 2026).
  const { data: people } = usePeople();
  const finPeople = (people || []).filter((p) => (p as Row).finance_enabled).sort((x, y) => String(x.name).localeCompare(String(y.name)));
  if (!me) return null;
  const s = (st || {}) as Row;
  const s0 = s;
  const canEditCosts = me.role === 'admin' && isFinanceUser(me, org);
  const initial = { ...s, po_enabled: !!s.po_enabled, pi_auto_approve: s.pi_auto_approve !== false, expenses_user: s.expenses_user || '', po_vat_default: String(s.po_vat_default || '20'), auto_job_numbers: !!o?.auto_job_numbers, job_number_prefix: o?.job_number_prefix || '', next_job_number: o?.next_job_number ?? '' };
  const xs = xero?.data, xErr = xero?.error;
  const EDIT_TITLE: Record<string, string> = { nums: 'Project numbers', po: 'Purchase orders', pi: 'Purchase invoices', vat: 'Default VAT (Sales And Purchases)', inv: 'Invoice numbers', def: 'Defaults for new projects', ohp: 'Company overheads (OHP)', bill: 'On your invoices' };
  const EDIT_FIELDS: Record<string, Field[]> = {
    nums: [{ k: 'auto_job_numbers', label: 'Number new projects automatically', kind: 'check' }, { k: 'job_number_prefix', label: 'Project number prefix', half: true }, { k: 'next_job_number', label: 'Next project number', kind: 'number', half: true }],
    inv: [{ k: 'invoice_prefix', label: 'Invoice prefix', half: true }, { k: 'next_invoice_number', label: 'Next invoice number', kind: 'number', half: true }],
    def: [{ k: 'default_retention_pct', label: 'Default retention %', kind: 'number', half: true }, { k: 'app_reminder_day', label: 'Application date (day of month)', kind: 'day', half: true }, { k: 'default_due_days', label: 'Payment due (days)', kind: 'number', half: true }, { k: 'default_final_days', label: 'Final date (days)', kind: 'number', half: true }],
    po: [{ k: 'po_enabled', label: 'Raise a PO for every PM’s order', kind: 'check' }, { k: 'po_vat_default', label: 'VAT on new PO lines', kind: 'choice', options: vatList(s).filter((x) => x.active || x.code === String(s.po_vat_default || '20')).map((x) => [x.code, x.name] as [string, string]) }],
    // Approve by themselves when nothing looks wrong (Andy, 5 Nov 2026). Blank counts as on.
    pi: [{ k: 'pi_auto_approve', label: 'Approve purchase invoices automatically when nothing looks wrong (filed to a project, supplier in your Directory, not over its PO, not a duplicate)', kind: 'check' },
      { k: 'expenses_user', label: 'Expense Receipts Go To', kind: 'choice', options: [['', 'Nobody Chosen (Any Finance User)'], ...finPeople.map((p) => [p.id, p.name] as [string, string])] }],
    vat: [{ k: 'default_vat', label: 'Default VAT On Sales (Invoices And Applications)', kind: 'choice', options: Object.entries(FIN_VAT_LABEL) }, { k: 'po_vat_default', label: 'Default VAT On Purchases (New PO Lines)', kind: 'choice', options: vatList(s).filter((x) => x.active || x.code === String(s.po_vat_default || '20')).map((x) => [x.code, x.name] as [string, string]) }],
    ohp: [{ k: 'ohp_pct', label: 'Company overheads %', kind: 'number' }],
    bill: [{ k: 'company_address', label: 'Company address', kind: 'multiline' }, { k: 'company_vat_no', label: 'VAT number', half: true }, { k: 'company_reg_no', label: 'Company number', half: true }, { k: 'bank_name', label: 'Bank', half: true }, { k: 'bank_account_name', label: 'Account name', half: true }, { k: 'bank_sort_code', label: 'Sort code', half: true }, { k: 'bank_account_no', label: 'Account number', half: true }, { k: 'invoice_footer', label: 'Invoice footer', kind: 'multiline' }, { k: 'contractor_utr', label: 'Contractor UTR (CIS)', half: true }, { k: 'employer_ref', label: 'Employer reference', half: true }],
  };
  // Overheads are for company admins only (as in the current app).
  const editBtn = (k: string) => (k === 'ohp' && me.role !== 'admin'
    ? <Muted style={{ marginTop: 4 }}>Only a company admin can change this.</Muted>
    : <View style={{ alignSelf: 'flex-start', marginTop: 4 }}><Button small title="Edit" onPress={() => { setEdit(k); if (!openS.includes(k)) setOpenS([...openS, k]); }} /></View>);
  const editForm = edit ? (
        <FinForm inline title={EDIT_TITLE[edit] || 'Finance settings'} initial={initial} onClose={() => setEdit(null)}
          fields={EDIT_FIELDS[edit] || []}
          onSave={async (v) => {
            // Only this part's boxes are checked and saved, so a blank elsewhere can't stop it.
            const body: Row = { org_id: me.org_id, updated_at: new Date().toISOString(), updated_by: me.id };
            const t = (k: string) => String(v[k] ?? '').trim() || null;
            const orgPatch: Row = {};
            if (edit === 'nums') {
              const auto = !!v.auto_job_numbers, prefix = String(v.job_number_prefix || '').trim(), nextJob = num(v.next_job_number);
              if (auto && (!nextJob || nextJob < 1)) return 'Enter the next project number.';
              if (auto) { const clash = sites.find((x) => String((x as Row).job_number || '').trim().toLowerCase() === `${prefix}${nextJob}`.toLowerCase()); if (clash) return `Project number ${prefix}${nextJob} is already used on ${clash.name}. Pick a higher number.`; }
              if (!!o?.auto_job_numbers !== auto) orgPatch.auto_job_numbers = auto;
              if (String(o?.job_number_prefix || '') !== prefix) orgPatch.job_number_prefix = prefix;
              if (String(o?.next_job_number ?? '') !== String(nextJob ?? '')) orgPatch.next_job_number = nextJob || null;
            }
            if (edit === 'inv') {
              const invNext = num(v.next_invoice_number);
              if (!invNext || invNext < 1) return 'Enter the next invoice number.';
              body.invoice_prefix = String(v.invoice_prefix ?? '');
              // Counters only when changed, so an old form can't wind them back.
              if (String(invNext) !== String(s.next_invoice_number ?? '')) body.next_invoice_number = invNext;
            }
            if (edit === 'def') {
              const ret = num(v.default_retention_pct), appDay = num(v.app_reminder_day), due = num(v.default_due_days), fin = num(v.default_final_days);
              if (ret === null || isNaN(ret) || ret < 0 || ret > 100) return 'Retention must be between 0 and 100%.';
              if (appDay !== null && (isNaN(appDay) || appDay < 1 || appDay > 31)) return 'Application date must be a day of the month, 1 to 31.';
              Object.assign(body, { default_retention_pct: ret, app_reminder_day: appDay, default_due_days: due === null || isNaN(due) ? 30 : due, default_final_days: fin === null || isNaN(fin) ? 14 : fin });
            }
            if (edit === 'pi') { body.pi_auto_approve = !!v.pi_auto_approve; body.expenses_user = String(v.expenses_user || '') || null; }
            if (edit === 'po') Object.assign(body, { po_enabled: !!v.po_enabled, po_vat_default: String(v.po_vat_default || '20') });
            if (edit === 'vat') { body.default_vat = v.default_vat || 'standard'; body.po_vat_default = String(v.po_vat_default || '20'); }
            if (edit === 'ohp') { const oh = num(v.ohp_pct); if (oh === null || isNaN(oh) || oh < 0 || oh > 100) return 'Overheads must be between 0 and 100%.'; body.ohp_pct = oh; }
            if (edit === 'bill') ['contractor_utr', 'employer_ref', 'company_address', 'company_vat_no', 'company_reg_no', 'bank_name', 'bank_account_name', 'bank_sort_code', 'bank_account_no', 'invoice_footer'].forEach((k) => { body[k] = t(k); });
            let orgNote = '';
            if (Object.keys(orgPatch).length) { const r = await fdb.from('organizations').update(orgPatch as never).eq('id', org?.id || (me.org_id as string)).select('id'); if (r.error || !(r.data as unknown[] | null)?.length) orgNote = ' The project number settings can only be changed by an admin.'; }
            const r = edit === 'nums' ? { error: null } : await fdb.from('fin_settings').upsert(body as never, { onConflict: 'org_id' });
            if (r.error) return `Save failed — ${r.error.message}`;
            // Receipts already waiting with nobody get the chosen person too.
            if (edit === 'pi' && body.expenses_user && body.expenses_user !== s.expenses_user) {
              const wait = (((await fdb.from('fin_inbox').select('id,extracted,assigned_pm').eq('org_id', me.org_id as string).eq('status', 'new')).data as Row[] | null) ?? []).filter((x) => x.extracted?.receipt === true && (!x.assigned_pm || x.assigned_pm === s.expenses_user));
              if (wait.length) await fdb.from('fin_inbox').update({ assigned_pm: body.expenses_user, assigned_at: new Date().toISOString() } as never).in('id', wait.map((x) => x.id));
              void qc.invalidateQueries({ queryKey: ['finPurchases'] });
            }
            toast(orgNote ? orgNote.trim() : 'Saved'); ['finSettings', 'finOrgNums'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); return null;
          }} />
  ) : null;
  return (
    <FinPage title="Finance settings" section="settings" sub="general" onSub={(k) => { if (k !== 'general') finSettingsGo(k); }}>
      {/* Each part opens on its own, with its own Edit (Andy, 2 Nov 2026). */}
      {([
        ['costs', 'Who can see material costs', 'eye', []],
        ['nums', 'Project numbers', 'hash', [['Project numbers', o?.auto_job_numbers ? `Automatic · next ${o.job_number_prefix || ''}${o.next_job_number ?? ''}` : 'Typed by hand']]],
        ['po', 'Purchase orders', 'reports', [['Raise a PO for every PM’s order', s.po_enabled ? 'On' : 'Off'], ['VAT on new PO lines', vatList(s).find((x) => x.code === String(s.po_vat_default || '20'))?.name || String(s.po_vat_default || '20')]]],
        ['pi', 'Purchase invoices', 'reports', [['Approve automatically when nothing looks wrong', s.pi_auto_approve === false ? 'Off' : 'On'], ['Expense receipts go to', s.expenses_user ? nameOf(people, s.expenses_user) : 'Nobody chosen']]],
        ['vat', 'VAT rates', 'percent', [['Default VAT On Sales', FIN_VAT_LABEL[s.default_vat] || '—'], ['Default VAT On Purchases', vatList(s).find((x) => x.code === String(s.po_vat_default || '20'))?.name || String(s.po_vat_default || '20')]]],
        ['inv', 'Invoice numbers', 'list', [['Next invoice number', `${s.invoice_prefix || ''}${s.next_invoice_number ?? ''}`]]],
        ['def', 'Defaults for new projects', 'gear', [['Retention', `${s.default_retention_pct ?? 5}%`], ['Payment terms', `${s.default_due_days ?? 30} days · final ${s.default_final_days ?? 14} days`], ['Application date', s.app_reminder_day ? `${s.app_reminder_day} of each month` : 'Not set']]],
        ['ohp', 'Company overheads (OHP)', 'chart', [['Company overheads', `${s.ohp_pct ?? 0}%`]]],
        ['bill', 'On your invoices', 'building', [['Company address', s.company_address || '—'], ['VAT no.', s.company_vat_no || '—'], ['Company no.', s.company_reg_no || '—'], ['Bank', [s.bank_name, s.bank_account_name, s.bank_sort_code, s.bank_account_no].filter(Boolean).join(' · ') || '—'], ['Contractor UTR (CIS)', s.contractor_utr || '—'], ['Employer ref', s.employer_ref || '—']]],
        ['inbox', 'Invoice inbox (email)', 'mail', []],
        ['xero', 'Xero', 'link', []],
        ['onedrive', 'OneDrive', 'cloud', []],
      ] as [string, string, string, [string, string][]][]).map(([k, title, ic, rows]) => {
        const on = openS.includes(k);
        return (
          <View key={k} style={{ marginBottom: 4 }}>
            <Pressable onPress={() => setOpenS(on ? openS.filter((x) => x !== k) : [...openS, k])} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 }}>
              <OphIcon name={ic} size={16} color={base.slate} />
              <Text style={{ flex: 1, fontWeight: '600', color: '#111827', fontSize: 13 }}>{title}</Text>
              <View style={{ transform: [{ rotate: on ? '90deg' : '0deg' }] }}><OphIcon name="chevron" size={14} color={base.slate} /></View>
            </Pressable>
            {on && (
              <Card style={{ marginTop: 4, marginBottom: 4 }}>
                {/* OneDrive (Andy, 8 Nov 2026): the same page as Admin › OneDrive in Projects. */}
                {k === 'onedrive' ? (
                  <>
                    <Muted style={{ marginBottom: 8 }}>The OneDrive connection, a folder for every new job, and where things save (applications, invoices, and everything from Projects).</Muted>
                    <View style={{ alignSelf: 'flex-start' }}><Button small title="Open OneDrive Settings ›" onPress={() => router.push('/fin/onedrive' as never)} /></View>
                  </>
                ) : k === 'costs' ? (
                  <>
                    <Muted style={{ marginBottom: 8 }}>Prices on project quotes (and in the Materials tile) are hidden from everyone except Finance users and the people switched on here.</Muted>
                    {/* By role (Andy, 11 Nov 2026): Admins, PMs, Site Managers, then Operatives, each with Select All; operatives stay
                        off unless an admin switches them on. */}
                    {!team ? <Muted>Loading…</Muted> : team.length ? ([['admin', 'Admins'], ['pm', 'Project Managers'], ['site_manager', 'Site Managers'], ['operative', 'Operatives']] as const).map(([role, label]) => {
                      const grp = team.filter((p) => p.role === role);
                      if (!grp.length) return null;
                      const onN = grp.filter((p) => p.see_costs).length, gk = `costs:${role}`, shut = !openS.includes(gk);
                      return (
                        <View key={role} style={{ borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 }}>
                            <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpenS(shut ? [...openS, gk] : openS.filter((x) => x !== gk))} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontWeight: '600', color: base.ink }}>{label}</Text>
                              <Text style={{ fontSize: 12, color: base.slate }}>{onN} Of {grp.length} Can See {shut ? '▾' : '▴'}</Text>
                            </Pressable>
                            {canEditCosts && <Button small kind="ghost" title={onN === grp.length ? 'Untick All' : 'Select All'} onPress={async () => {
                              const on = onN !== grp.length;
                              if (role === 'operative' && on && !(await confirmAsk('Let every operative see material costs?', 'Yes', 'No'))) return;
                              const r = await fdb.from('profiles').update({ see_costs: on } as never).in('id', grp.map((p) => p.id)).select('id');
                              if (r.error || !(r.data as unknown[] | null)?.length) toast('Only an admin with Finance can change this.');
                              void refetchTeam();
                            }} />}
                          </View>
                          {role === 'operative' && <Muted style={{ fontSize: 12, marginTop: -4, marginBottom: 6 }}>Always off unless an admin switches them on.</Muted>}
                          {!shut && grp.map((p) => (
                            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingLeft: 12 }}>
                              <Text style={{ flex: 1, color: base.ink }}>{p.name}</Text>
                              {canEditCosts
                                ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!p.see_costs }} accessibilityLabel={`${p.name} can see material costs`} onPress={() => void setSeeCosts(p, !p.see_costs)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ fontSize: 16, color: base.ink }}>{p.see_costs ? '☑' : '☐'}</Text>
                                    <Text style={{ fontWeight: '500', color: base.ink, minWidth: 54 }}>{p.see_costs ? 'Can See' : 'Hidden'}</Text>
                                  </Pressable>
                                : <Text style={{ fontWeight: '500', color: base.ink }}>{p.see_costs ? 'Can See' : 'Hidden'}</Text>}
                            </View>
                          ))}
                        </View>
                      );
                    }) : <Muted>Nobody else in the team yet.</Muted>}
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
                  <>{edit === 'vat' ? editForm : <>{rows.map(([l, v]) => <FinRow compact key={l} title={l} right={v} />)}{editBtn('vat')}</>}<VatRates s={s} canEdit={me.role === 'admin' && isFinanceUser(me, org)} onSaved={() => void qc.invalidateQueries({ queryKey: ['finSettings'] })} /></>
                ) : edit === k ? editForm : <>{rows.map(([l, v]) => <FinRow compact key={l} title={l} right={v} />)}{editBtn(k)}</>}
              </Card>
            )}
          </View>
        );
      })}
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
        <View key={r.code} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: '#F0F1F4', opacity: r.active ? 1 : 0.5 }}>
          <TextInput editable={canEdit} value={r.name} onChangeText={(v) => set(i, { name: v })} style={[box, { flexGrow: 1, flexBasis: 200, minWidth: 0 }]} />
          <TextInput editable={canEdit && !!r.custom} value={String(r.rate)} onChangeText={(v) => set(i, { rate: v.replace(/[^0-9.]/g, '') as never })} keyboardType="decimal-pad" style={[box, { width: 56 }]} />
          <Text style={{ color: base.slate }}>%</Text>
          <Pressable disabled={!canEdit || !r.custom} onPress={() => set(i, { rc: !r.rc })}><Text style={{ color: base.ink }}>{r.rc ? '☑' : '☐'} RC</Text></Pressable>
          <Pressable disabled={!canEdit} onPress={() => set(i, { active: !r.active })}><Text style={{ color: base.ink }}>{r.active ? '☑' : '☐'} In use</Text></Pressable>
        </View>
      ))}
      {canEdit && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Button kind="ghost" title="+ Add VAT rate" onPress={() => { setList([...list, { code: `c${Date.now().toString(36)}`, name: '', rate: 0, rc: false, active: true, custom: true }]); setDirty(true); }} />
          {dirty && <Button title="Save VAT rates" onPress={async () => {
            const out = list.filter((r) => r.name.trim() || !r.custom).map((r) => ({ ...r, name: r.name.trim() || r.code, rate: Math.max(0, Math.min(100, Number(r.rate) || 0)) }));
            if (!out.some((r) => r.active)) { toast('Keep at least one VAT rate switched on.'); return; }
            let res = await fdb.from('fin_settings').update({ vat_rates: out } as never).eq('org_id', me?.org_id as string).select('org_id');
            if (!res.error && !res.data?.length) res = await fdb.from('fin_settings').insert({ org_id: me?.org_id, vat_rates: out } as never).select('org_id');
            if (res.error || !res.data?.length) { toast('VAT rates not saved — try again.'); return; }
            toast('VAT rates saved'); setDirty(false); onSaved();
          }} />}
        </View>
      )}
    </View>
  );
}
