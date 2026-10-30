// Finance › Directory (9219j / 9219i): clients and suppliers (contact,
// VAT codes, payment terms, CIS, default cost code — and Xero, which the
// trial still allows for contacts), Labour (CIS subbies and PAYE staff: UTR,
// HMRC check, CIS rate, day rate, bank details) and cost codes.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { FinForm, type Field } from '@/components/FinForm';
import { FinChip, FinPage, FinRow } from '@/components/FinNav';
import { Cell, FinTable, FootText } from '@/components/FinTable';
import { bankOk, sortCode } from '@/components/FinSubs';
import { useToast } from '@/components/toast';
import { Button, Empty, Muted, SectionTitle } from '@/components/ui';
import { fdb, finInvoke, finStatus, selectAll, useFinSettings } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { useJobsData } from './jobs';
import { COST_CATS } from '@/lib/rules/finBook';
import { fdate, money, num, vatList } from '@/lib/rules/finance';
import { base, radius, useDesk, useTheme } from '@/theme/theme';

type Row = Record<string, any>;
type Kind = 'client' | 'supplier' | 'labour' | 'codes';
const TERMS: [string, string][] = [['', 'Not set'], ['of_following_month', 'of the following month'], ['days_after_bill', 'days after bill date'], ['days_after_month', 'days after bill month'], ['of_current_month', 'of the current month']];
const CIS: [string, string][] = [['0', 'Gross (0%)'], ['20', 'Standard (20%)'], ['30', 'Unverified (30%)']];
const SUP_CATS = ['Materials', 'Plant & hire', 'Scaffolding', 'Waste', 'Subcontractor', 'Services', 'Travel', 'Other'];
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 10 };
export function termsText(r: Row) {
  if (!r || r.terms_days == null || !r.terms_type) return '';
  const d = Number(r.terms_days), t = TERMS.find(([k]) => k === r.terms_type)?.[1] || '';
  if (r.terms_type === 'of_following_month' || r.terms_type === 'of_current_month') { const s = d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'; return `${d}${s} ${t}`; }
  return `${d} ${t}`;
}

export default function FinDirectory() {
  const { kind = 'client' } = useLocalSearchParams<{ kind?: Kind }>();
  const { me } = useAuth();
  // The company's VAT rates (Finance Settings): switched-off ones still show on records that use them.
  const { data: fst } = useFinSettings(me?.org_id);
  const vatAll = vatList(fst), VAT_SHOW: [string, string][] = vatAll.map((r) => [r.code, r.name]);
  const VAT: [string, string][] = [['', 'Not set'], ...vatAll.filter((r) => r.active).map((r) => [r.code, r.name] as [string, string])];
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Row | null>(null);
  const [ppl, setPpl] = useState('subs');
  const [busy, setBusy] = useState(false);
  const desk = useDesk();
  const th = useTheme();
  const { data: sites = [] } = useSites();
  const { data: jd } = useJobsData(kind === 'client' ? me?.org_id : null);
  const { data, isLoading } = useQuery({ queryKey: ['finDir', me?.org_id, kind], enabled: !!me, queryFn: async () => {
    const org = me?.org_id as string;
    if (kind === 'labour') {
      const [rates, people] = await Promise.all([selectAll<Row>('fin_labour_rates', '*', (x) => x.eq('org_id', org)), selectAll<Row>('profiles', 'id,name,email,role', (x) => x.eq('org_id', org))]);
      const rBy: Record<string, Row> = {}; rates.forEach((r) => { if (r.user_id) rBy[r.user_id] = r; });
      return rates.filter((r) => !r.user_id).map((r) => ({ key: `w:${r.id}`, name: r.trading_name || r.name || 'Worker', r, app: false }))
        .concat(people.filter((p) => ['operative', 'site_manager'].includes(p.role)).map((p) => ({ key: p.id, name: rBy[p.id]?.trading_name || p.name, r: rBy[p.id] || {}, app: true, email: p.email })))
        .sort((a, b) => String(a.name).localeCompare(String(b.name))) as Row[];
    }
    if (kind === 'codes') return (await selectAll<Row>('fin_cost_codes', '*', (x) => x.eq('org_id', org))).sort((a, b) => `${a.grp} ${a.name}`.localeCompare(`${b.grp} ${b.name}`));
    return (await selectAll<Row>(kind === 'client' ? 'fin_clients' : 'fin_suppliers', '*', (x) => x.eq('org_id', org))).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  } });
  // 9219j: people who filled in the sub-contractor sign-up form but aren't in the Labour directory yet.
  const { data: apps = [] } = useQuery({ queryKey: ['finDir', me?.org_id, 'apps'], enabled: !!me && kind === 'labour', queryFn: async () => ((await fdb.from('subcontractor_applications').select('id,user_id,company_name,contact_name,email,phone,status,created_at,data').eq('org_id', me?.org_id as string).neq('status', 'rejected').order('created_at', { ascending: false }).limit(300)).data as Row[] | null) ?? [] });
  // Projects suppliers (ordering), to link a Directory supplier to (9219zc) — two records, neither changes the other.
  const { data: mats = [] } = useQuery({ queryKey: ['finDir', me?.org_id, 'mats'], enabled: !!me && kind === 'supplier', queryFn: async () => ((await fdb.from('suppliers').select('id,name').eq('org_id', me?.org_id as string).order('name')).data as Row[] | null) ?? [] });
  const { data: codes = [] } = useQuery({ queryKey: ['finDir', me?.org_id, 'codes'], enabled: !!me && kind !== 'codes', queryFn: async () => selectAll<Row>('fin_cost_codes', '*', (x) => x.eq('org_id', me?.org_id as string)) });
  if (!me) return null;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['finDir'] });
  const go = (k: string) => router.setParams({ kind: k });
  const ql = q.trim().toLowerCase();
  const onSub = (k: string) => { setQ(''); go(k); };
  const pull = async () => {
    setBusy(true);
    try {
      const r = await finInvoke<{ customers?: Row[]; suppliers?: Row[] }>(me, 'xero', { action: kind === 'client' ? 'customers' : 'suppliers' });
      if (r.error) { toast(/not_configured|not connected/i.test(r.error) ? 'Xero isn’t connected yet — connect it in Finance › Settings, then try again.' : `Xero: ${r.error.slice(0, 140)}`); return; }
      const list = (kind === 'client' ? r.data?.customers : r.data?.suppliers) || [];
      const tbl = kind === 'client' ? 'fin_clients' : 'fin_suppliers', saved = (data as Row[]) || [];
      let added = 0, linked = 0;
      for (const x of list) {
        const patch: Row = { name: x.name, xero_contact_id: x.id, xero_synced_at: new Date().toISOString() };
        ['email', 'phone', 'address', 'postcode', 'sales_vat', 'purchase_vat', 'company_number'].forEach((k) => { if (x[k]) patch[k] = x[k]; });
        if (x.vat_number) { patch.vat_number = x.vat_number; patch.vat_registered = true; }
        if (x.terms_type) { patch.terms_type = x.terms_type; patch.terms_days = x.terms_days; }
        const ex = saved.find((c) => c.xero_contact_id === x.id) || saved.find((c) => String(c.name).trim().toLowerCase() === String(x.name).trim().toLowerCase());
        if (ex) { if (!!(await fdb.from(tbl).update(patch as never).eq('id', ex.id).select('id')).data?.length) linked++; }
        else if (!(await fdb.from(tbl).insert({ ...patch, org_id: me.org_id, created_by: me.id } as never)).error) added++;
      }
      toast(`From Xero: ${added} added, ${linked} updated`); refresh();
    } finally { setBusy(false); }
  };

  if (kind === 'labour') {
    const rows = (data as Row[]) || [];
    const F: Record<string, (x: Row) => boolean> = { subs: (x) => x.r.active !== false && x.r.pay_type !== 'paye', unver: (x) => x.r.active !== false && x.r.pay_type !== 'paye' && !x.r.cis_verified_at, paye: (x) => x.r.active !== false && x.r.pay_type === 'paye', left: (x) => x.r.active === false, all: () => true };
    const list = rows.filter(F[ppl]).filter((x) => !ql || `${x.name} ${x.r.name || ''} ${x.r.utr || ''}`.toLowerCase().includes(ql));
    const cur = edit;
    const linkedApps = new Set(rows.map((x) => x.r.application_id).filter(Boolean));
    const waiting = apps.filter((a) => !linkedApps.has(a.id));
    const addFromApp = async (a: Row) => {
      const d = (a.data || {}) as Row;
      const val = (v: unknown) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? Object.values(x).filter(Boolean).join(' · ') : String(x))).join('\n') : String(v ?? ''));
      const reg = (t: unknown) => { const x = String(t || ''); return /limited|ltd|company/i.test(x) ? 'company' : /partner/i.test(x) ? 'partnership' : /trust/i.test(x) ? 'trust' : /sole|self/i.test(x) ? 'sole_trader' : null; };
      let utr: string | null = String(d.utr || '').replace(/\s/g, '') || null; if (utr && !/^\d{10}$/.test(utr)) utr = null;
      const row: Row = { org_id: me?.org_id, user_id: a.user_id || null, active: true, pay_type: 'subcontractor', application_id: a.id,
        name: a.contact_name || a.company_name || 'Subcontractor', trading_name: d.trading_name || a.company_name || null, email: a.email || null, phone: a.phone || d.phone || null,
        utr, cis_rate: /gross/i.test(String(d.cis_status || '')) ? 0 : /30/.test(String(d.cis_status || '')) ? 30 : 20, vat_number: d.vat_number || null, vat_registered: !!d.vat_number,
        company_number: d.company_number || null, address: d.address || null, postcode: d.postcode || null, cis_reg_type: reg(d.company_type), cis_sub_type: reg(d.company_type),
        notes: [d.trades ? `Trades: ${val(d.trades)}` : '', d.areas ? `Areas: ${val(d.areas)}` : ''].filter(Boolean).join('\n') || null, updated_at: new Date().toISOString() };
      const r = row.user_id ? await fdb.from('fin_labour_rates').upsert(row as never, { onConflict: 'org_id,user_id' }) : await fdb.from('fin_labour_rates').insert(row as never);
      if (r.error) { toast('Save failed — try again.'); return; }
      toast('Added from the sign-up form — check their CIS status with HMRC'); refresh();
    };
    return (
      <FinPage title="Directory" section="directory" sub={kind} onSub={onSub}>
        <Muted style={{ marginBottom: 8 }}>Subcontractors who invoice you under CIS, and PAYE staff. Check each subbie&apos;s CIS status with HMRC before you pay them.</Muted>
        {waiting.length > 0 && (
          <View style={{ borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, padding: 10, marginBottom: 10, backgroundColor: base.card }}>
            <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 6 }}>{waiting.length} from the sub-contractor sign-up form, not in the directory yet</Text>
            {waiting.map((a) => (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: base.line }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: base.ink }}>{a.company_name || (a.data as Row | null)?.trading_name || a.contact_name || 'Applicant'} <Text style={{ color: a.status === 'approved' ? base.ok : base.slate, fontWeight: '400' }}>· {a.status === 'approved' ? 'Approved' : 'New'}</Text></Text>
                  <Muted>{[a.contact_name, a.email, a.phone].filter(Boolean).join(' · ')}</Muted>
                </View>
                <Button small kind="ghost" title="Add to directory" onPress={() => void addFromApp(a)} />
              </View>
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {[['subs', 'CIS subcontractors'], ['unver', 'Not verified'], ['paye', 'PAYE staff'], ['left', 'No longer working for us'], ['all', 'All']].map(([k, l]) => <FinChip key={k} on={ppl === k} label={l} n={rows.filter(F[k]).length} onPress={() => setPpl(k)} />)}
          <View style={{ marginLeft: 'auto' }}><Button title="+ Add a person" onPress={() => setEdit({ key: '', name: '', r: { pay_type: 'subcontractor', cis_rate: 20 }, app: false })} /></View>
        </View>
        <TextInput value={q} onChangeText={setQ} placeholder="Search name or UTR" style={box} />
        {isLoading ? <Muted>Loading…</Muted> : list.length ? list.map((x) => (
          <FinRow key={x.key} title={x.name} sub={[x.app ? 'Has the app' : '', x.r.pay_type === 'paye' ? 'PAYE' : CIS.find(([k]) => Number(k) === Number(x.r.cis_rate ?? 20))?.[1], x.r.pay_type === 'paye' ? '' : x.r.utr ? `UTR ${x.r.utr}` : 'UTR missing', x.r.pay_type === 'paye' ? '' : x.r.cis_verified_at ? `verified ${fdate(x.r.cis_verified_at)}` : 'unverified', bankOk(x.r) ? `${sortCode(x.r.bank_sort_code)} · ••${String(x.r.bank_account_no).replace(/\D/g, '').slice(-4)}` : x.r.pay_type === 'paye' ? 'payroll' : 'bank not saved'].filter(Boolean).join(' · ')} right={x.r.day_rate != null ? `${money(x.r.day_rate)}/day` : ''} onPress={() => setEdit(x)} />
        )) : <Empty>No one here yet.</Empty>}
        {cur && (
          <FinForm title={cur.key ? cur.name : 'Add a person'} initial={{ ...cur.r, name: cur.r.name || (cur.app ? cur.name : ''), cis_rate: String(cur.r.cis_rate ?? 20), pay_type: cur.r.pay_type || 'subcontractor', active: cur.r.active !== false }} onClose={() => setEdit(null)}
            note={cur.app ? `Has the app (${cur.email || ''}). Their name comes from their app account.` : undefined}
            fields={[
              ...(cur.app ? [] : [{ k: 'name', label: 'Name' }, { k: 'email', label: 'Email (for CIS statements)', kind: 'email', half: true }, { k: 'phone', label: 'Phone', half: true }] as Field[]),
              { k: 'trading_name', label: 'Trading / company name' }, { k: 'pay_type', label: 'How they’re paid', kind: 'choice', options: [['subcontractor', 'They invoice us (CIS)'], ['paye', 'PAYE (payroll)']] },
              { k: 'day_rate', label: 'Day rate £', kind: 'money', half: true }, { k: 'postcode', label: 'Postcode', half: true }, { k: 'address', label: 'Address', kind: 'multiline' },
              { k: 'cis_rate', label: 'CIS rate', kind: 'choice', options: CIS, half: true }, { k: 'utr', label: 'UTR (10 digits)', half: true },
              { k: 'company_number', label: 'Company number', half: true }, { k: 'vat_number', label: 'VAT number', half: true }, { k: 'vat_registered', label: 'VAT registered (reverse charge)', kind: 'check' },
              { k: 'cis_verification_no', label: 'HMRC verification number', half: true }, { k: 'cis_verified_at', label: 'Verified date', kind: 'date', half: true },
              { k: 'bank_account_name', label: 'Bank account name' }, { k: 'bank_sort_code', label: 'Sort code', half: true }, { k: 'bank_account_no', label: 'Account number', half: true },
              { k: 'notes', label: 'Notes', kind: 'multiline' }, ...(cur.key && !cur.app ? [{ k: 'active', label: 'Still working for us', kind: 'check' }] as Field[] : []),
            ]}
            onSave={async (v) => {
              const rate = num(v.day_rate); if (rate !== null && isNaN(rate)) return 'Day rate must be a number.';
              const sc = String(v.bank_sort_code || '').replace(/\D/g, ''), an = String(v.bank_account_no || '').replace(/\D/g, ''), utr = String(v.utr || '').replace(/\s/g, '');
              if (sc && sc.length !== 6) return 'Sort code should be 6 numbers.';
              if (an && an.length !== 8) return 'Account number should be 8 numbers.';
              if (utr && !/^\d{10}$/.test(utr)) return 'A UTR is 10 numbers.';
              const n = (x: unknown) => String(x ?? '').trim() || null;
              const pay = String(v.pay_type || 'subcontractor');
              const row: Row = { pay_type: pay, day_rate: rate, trading_name: n(v.trading_name), address: n(v.address), postcode: n(v.postcode)?.toUpperCase() || null, notes: n(v.notes), updated_at: new Date().toISOString() };
              if (pay !== 'paye') Object.assign(row, { cis_rate: Number(v.cis_rate || 20), utr: utr || null, vat_registered: !!v.vat_registered, vat_number: n(v.vat_number), company_number: n(v.company_number), cis_verification_no: n(v.cis_verification_no), cis_verified_at: n(v.cis_verified_at), bank_account_name: n(v.bank_account_name), bank_sort_code: sc || null, bank_account_no: an || null });
              if (!cur.app) {
                const nm = n(v.name); if (!nm) return 'Enter their name.';
                const em = n(v.email); if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return 'Check the email address.';
                Object.assign(row, { name: nm, email: em, phone: n(v.phone) });
                if (cur.key) row.active = !!v.active;
              }
              const r = !cur.key ? await fdb.from('fin_labour_rates').insert({ ...row, org_id: me.org_id, user_id: null, active: true } as never)
                : cur.app ? await fdb.from('fin_labour_rates').upsert({ ...row, org_id: me.org_id, user_id: cur.key } as never, { onConflict: 'org_id,user_id' })
                  : await fdb.from('fin_labour_rates').update(row as never).eq('id', cur.key.slice(2));
              if (r.error) return `Save failed — ${r.error.message}`;
              toast(cur.key ? 'Saved' : 'Added'); refresh(); return null;
            }} />
        )}
      </FinPage>
    );
  }
  if (kind === 'codes') {
    const list = ((data as Row[]) || []).filter((c) => !ql || `${c.name} ${c.code || ''} ${c.description || ''}`.toLowerCase().includes(ql));
    const groups: Record<string, Row[]> = {}; list.forEach((c) => { (groups[c.grp || 'No group'] = groups[c.grp || 'No group'] || []).push(c); });
    return (
      <FinPage title="Cost codes" section="directory" sub={kind} onSub={onSub}>
        <View style={{ flexDirection: 'row', marginBottom: 8 }}><Muted style={{ flex: 1 }}>The ID is the Xero account code each cost goes to. The type decides which column it adds up in on job costs and reports.</Muted><Button title="+ Add cost code" onPress={() => setEdit({ category: 'materials', grp: list[0]?.grp || '' })} /></View>
        <TextInput value={q} onChangeText={setQ} placeholder="Search cost codes" style={box} />
        {Object.keys(groups).sort().map((g) => (
          <View key={g}><SectionTitle>{g} · {groups[g].length}</SectionTitle>{groups[g].map((c) => <FinRow key={c.id} left={c.code || '—'} title={`${c.name}${c.active === false ? ' (hidden)' : ''}`} sub={[c.description, COST_CATS[c.category]].filter(Boolean).join(' · ')} onPress={() => setEdit(c)} />)}</View>
        ))}
        {!isLoading && !list.length && <Empty>No cost codes yet.</Empty>}
        {edit && (
          <FinForm title={edit.id ? 'Edit cost code' : 'New cost code'} initial={{ ...edit, hidden: edit.active === false }} onClose={() => setEdit(null)}
            fields={[{ k: 'name', label: 'Name', half: true }, { k: 'code', label: 'ID (Xero account code)', half: true }, { k: 'description', label: 'Description', kind: 'multiline' }, { k: 'category', label: 'Type', kind: 'choice', options: Object.entries(COST_CATS), half: true }, { k: 'grp', label: 'Cost group', half: true }, ...(edit.id ? [{ k: 'hidden', label: 'Hide this code (keeps old costs on it)', kind: 'check' }] as Field[] : [])]}
            onSave={async (v) => {
              const name = String(v.name).trim(); if (!name) return 'Enter a name.';
              const row: Row = { name, code: String(v.code).trim() || null, description: String(v.description).trim() || null, category: v.category || 'materials', grp: String(v.grp).trim() || null };
              if (edit.id) row.active = !v.hidden;
              const r = edit.id ? await fdb.from('fin_cost_codes').update(row as never).eq('id', edit.id) : await fdb.from('fin_cost_codes').insert({ ...row, org_id: me.org_id, created_by: me.id } as never);
              if (r.error) return 'Could not save.';
              toast(edit.id ? 'Saved' : 'Added'); refresh(); return null;
            }} />
        )}
      </FinPage>
    );
  }
  const sup = kind === 'supplier', tbl = sup ? 'fin_suppliers' : 'fin_clients';
  const list = ((data as Row[]) || []).filter((c) => !ql || `${c.name} ${c.email || ''} ${c.category || ''}`.toLowerCase().includes(ql));
  return (
    <FinPage title="Directory" section="directory" sub={kind} onSub={onSub}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Text style={{ flex: 1, minWidth: 200, fontSize: 12, color: '#6b7280' }}>{list.length} {sup ? 'supplier' : 'client'}{list.length === 1 ? '' : 's'} · {list.filter((c) => c.xero_contact_id).length} in Xero. New {sup ? 'suppliers' : 'clients'} you add here go into Xero too.</Text>
        <Pressable disabled={busy} onPress={() => void pull()} style={{ borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 }}><Text style={{ fontSize: 12, fontWeight: '700', color: base.ink }}>{busy ? 'Pulling…' : '⟳ Pull from Xero'}</Text></Pressable>
        <Pressable onPress={() => setEdit({ toX: true })} style={{ backgroundColor: th.brand1, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 }}><Text style={{ fontSize: 12, fontWeight: '800', color: th.brand1Text }}>+ New {sup ? 'supplier' : 'client'}</Text></Pressable>
      </View>
      <TextInput value={q} onChangeText={setQ} placeholder={`Search ${sup ? 'suppliers' : 'clients'}`} style={box} />
      {isLoading ? <Muted>Loading…</Muted> : desk && list.length ? (() => {
        const jobsOf = (c: Row) => sites.filter((s) => String(s.client_name || jd?.jfBy[s.id]?.billing_name || '').trim().toLowerCase() === String(c.name).trim().toLowerCase());
        const owedOf = (c: Row) => jobsOf(c).reduce((t, s) => ({ o: t.o + (jd?.m[s.id]?.owed || 0), od: t.od + (jd?.m[s.id]?.overdue || 0) }), { o: 0, od: 0 });
        return (
          <FinTable rows={list} keyOf={(c) => c.id} onRow={(c) => setEdit(c)}
            cols={[
              { k: 'n', l: sup ? 'Supplier' : 'Client', flex: 2.2, min: 220, render: (c: Row) => (
                <View style={{ alignSelf: 'stretch' }}>
                  <Text style={{ fontWeight: '800', fontSize: 13, color: '#111827' }}>{c.name}</Text>
                  <Text style={{ fontSize: 11.5, color: '#6b7280' }}>{[sup ? c.category : '', termsText(c), c.sales_vat ? `${sup ? '' : 'Sales '}VAT ${VAT_SHOW.find(([k]) => k === c.sales_vat)?.[1]}` : '', c.cis_registered ? 'CIS' : ''].filter(Boolean).join(' · ')}</Text>
                  {!!c.email && <Text style={{ fontSize: 11.5, color: '#6b7280' }}>{c.email}</Text>}
                </View>
              ) },
              ...(sup ? [] : [{ k: 'j', l: 'Jobs', render: (c: Row) => { const js = jobsOf(c); return <Cell bold>{js.length} job{js.length === 1 ? '' : 's'} · {js.filter((s) => finStatus(s) === 'live').length} live</Cell>; } }]),
              { k: 'x', l: 'Xero', render: (c: Row) => c.xero_contact_id ? <Cell>In Xero</Cell> : <Text style={{ fontSize: 12, fontWeight: '700', color: base.ink, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, paddingVertical: 5, paddingHorizontal: 10, overflow: 'hidden' }}>Add to Xero</Text> },
              ...(sup ? [] : [{ k: 'o', l: 'Owed', render: (c: Row) => { const o = owedOf(c); return <View style={{ alignItems: 'center' }}><Cell>{o.o ? money(o.o, 0) : '—'}</Cell>{o.od ? <Text style={{ fontSize: 11, color: '#c81e1e', fontWeight: '700' }}>{money(o.od, 0)} overdue</Text> : null}</View>; } }]),
            ]}
            foot={<><FootText bold>{list.length} shown</FootText>{!sup && <FootText>Owed {money(list.reduce((t, c) => t + owedOf(c).o, 0))}</FootText>}</>} />
        );
      })() : list.length ? list.map((c) => <FinRow key={c.id} title={c.name} sub={[sup ? c.category : '', c.email, termsText(c), c.sales_vat ? `VAT ${VAT_SHOW.find(([k]) => k === c.sales_vat)?.[1]}` : '', c.cis_registered ? 'CIS' : '', c.xero_contact_id ? 'In Xero' : 'Not in Xero'].filter(Boolean).join(' · ')} onPress={() => setEdit(c)} />) : <Empty>Nothing here yet.</Empty>}
      {edit && (
        <FinForm title={edit.id ? edit.name : `New ${sup ? 'supplier' : 'client'}`} initial={{ ...edit, terms_days: edit.terms_days ?? '', cis_rate: String(edit.cis_rate ?? 20), toX: !edit.xero_contact_id }} onClose={() => setEdit(null)}
          note={edit.xero_contact_id ? 'Linked to Xero.' : 'Not in Xero yet.'}
          fields={[
            { k: 'name', label: `${sup ? 'Supplier' : 'Client'} name` }, ...(sup ? [{ k: 'category', label: 'Category', kind: 'choice', options: [['', 'Not set'], ...SUP_CATS.map((x) => [x, x])] }, { k: 'supplier_id', label: 'Projects Supplier (ordering)', kind: 'choice', options: [['', 'Not linked'], ...mats.map((m) => { const other = ((data as Row[]) || []).find((x) => x.supplier_id === m.id && x.id !== edit.id); return [m.id, `${m.name}${other ? ` (linked to ${other.name})` : ''}`]; }), ['__new', '+ Add to the Projects suppliers']], note: 'Links this Directory record to the supplier you order from on projects. They stay separate — changing one never changes the other.' }] as Field[] : []),
            { k: 'email', label: sup ? 'Supplier email' : 'Accounts email', kind: 'email' }, { k: 'address', label: 'Address', kind: 'multiline' }, { k: 'postcode', label: 'Postcode', half: true }, { k: 'phone', label: 'Phone', half: true },
            { k: 'cost_code_id', label: 'Default cost code', kind: 'choice', options: [['', 'None'], ...codes.filter((x) => x.active !== false).map((x) => [x.id, `${x.code ? `${x.code} – ` : ''}${x.name}`] as [string, string])] },
            { k: 'terms_days', label: 'Payment terms (number)', kind: 'number', half: true }, { k: 'terms_type', label: 'Terms type', kind: 'choice', options: TERMS, half: true }, { k: 'terms_agreed', label: 'Terms agreed (signed)', kind: 'check' },
            { k: 'vat_registered', label: 'VAT registered', kind: 'check' }, { k: 'vat_number', label: 'VAT number', half: true }, { k: 'sales_vat', label: sup ? 'Default sales VAT' : 'Default VAT code on invoices', kind: 'choice', options: VAT, half: true },
            ...(sup ? [{ k: 'purchase_vat', label: 'Default purchase VAT', kind: 'choice', options: VAT, half: true }, { k: 'foreign_supplier', label: 'Foreign supplier (ignore VAT)', kind: 'check' }, { k: 'no_sync', label: 'Don’t send this supplier’s bills to Xero', kind: 'check' }, { k: 'utr', label: 'UTR', half: true }] as Field[] : []),
            { k: 'cis_registered', label: sup ? 'CIS subcontractor (you deduct CIS)' : 'CIS registered (they deduct CIS from you)', kind: 'check' }, { k: 'cis_rate', label: 'CIS rate', kind: 'choice', options: CIS, half: true },
            { k: 'company_number', label: 'Company number', half: true }, { k: 'notes', label: 'Notes', kind: 'multiline' }, ...(!edit.xero_contact_id ? [{ k: 'toX', label: 'Add to Xero as well', kind: 'check' }] as Field[] : []),
          ]}
          onSave={async (v) => {
            const name = String(v.name || '').trim(); if (!name) return 'Enter the name.';
            const email = String(v.email || '').trim(); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Check the email address.';
            const utr = String(v.utr || '').replace(/\s/g, ''); if (utr && !/^\d{10}$/.test(utr)) return 'A UTR is 10 numbers.';
            const t = (k: string) => String(v[k] ?? '').trim() || null;
            const row: Row = { name, email: email || null, address: t('address'), postcode: t('postcode'), phone: t('phone'), vat_registered: !!v.vat_registered, vat_number: t('vat_number'), sales_vat: t('sales_vat'), terms_days: num(v.terms_days), terms_type: t('terms_type'), terms_agreed: !!v.terms_agreed, cost_code_id: t('cost_code_id'), company_number: t('company_number'), cis_registered: !!v.cis_registered, cis_rate: Number(v.cis_rate || 20), notes: t('notes') };
            let link = sup ? String(v.supplier_id || '') || null : null;
            if (link === '__new') { const m = await fdb.from('suppliers').insert({ org_id: me.org_id, name, email: email || null, created_by: me.id } as never).select('id').single(); link = (m.data as Row | null)?.id ?? null; if (!link) return 'Could not add it to the Projects suppliers.'; }
            if (sup) Object.assign(row, { supplier_id: link, category: t('category'), purchase_vat: t('purchase_vat'), foreign_supplier: !!v.foreign_supplier, no_sync: !!v.no_sync, utr: utr || null, updated_at: new Date().toISOString() });
            const dup = ((data as Row[]) || []).find((x) => x.id !== edit.id && String(x.name).trim().toLowerCase() === name.toLowerCase());
            if (dup) return `“${dup.name}” is already in the directory.`;
            const r = edit.id ? await fdb.from(tbl).update(row as never).eq('id', edit.id).select('*').single() : await fdb.from(tbl).insert({ ...row, org_id: me.org_id, created_by: me.id } as never).select('*').single();
            const rec = r.data as Row | null; if (!rec) return 'Could not save — try again.';
            let msg = edit.id ? 'Saved' : 'Added';
            // A client's details carry to the projects billed to it (bill-to synced with the Directory).
            if (!sup && edit.id) {
              const old = String(edit.name || '').trim();
              const ids = (((await fdb.from('job_finance').select('site_id,billing_name').eq('org_id', me.org_id as string)).data as Row[] | null) ?? []).filter((j) => String(j.billing_name || '').trim().toLowerCase() === old.toLowerCase()).map((j) => j.site_id);
              if (ids.length) await fdb.from('job_finance').update({ billing_name: rec.name, billing_email: rec.email || null, billing_address: [rec.address, rec.postcode].filter(Boolean).join('\n') || null } as never).in('site_id', ids);
            }
            if (v.toX && !rec.xero_contact_id) {
              const lines = String(rec.address || '').split(/\n|,/).map((x) => x.trim()).filter(Boolean);
              const x = await finInvoke<{ contact: { id: string }; existed?: boolean }>(me, 'xero', { action: 'create_contact', name: rec.name, email: rec.email || '', phone: rec.phone || '', line1: lines[0] || '', line2: lines.slice(1, -1).join(', '), city: lines.length > 1 ? lines[lines.length - 1] : '', postcode: rec.postcode || '', supplier: sup });
              if (x.error) msg += `. Xero: ${x.error.slice(0, 100)}`;
              else if (x.data?.contact?.id) { await fdb.from(tbl).update({ xero_contact_id: x.data.contact.id, xero_synced_at: new Date().toISOString() } as never).eq('id', rec.id); msg += x.data.existed ? ' — already in Xero, linked' : ' and added to Xero'; }
            }
            toast(msg); refresh(); return null;
          }} />
      )}
    </FinPage>
  );
}
