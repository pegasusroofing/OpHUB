// Finance › Directory (9219j / 9219i): clients and suppliers (contact,
// VAT codes, payment terms, CIS, default cost code — and Xero, which the
// trial still allows for contacts), Labour (CIS subbies and PAYE staff: UTR,
// HMRC check, CIS rate, day rate, bank details) and cost codes.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { FinForm, type Field } from '@/components/FinForm';
import { FinFilterBar } from '@/components/FinFilterBar';
import { FinPage, finSettingsGo, FinRow } from '@/components/FinNav';
import { SubsStats, useSubsBadges } from '@/components/FinSubs';
import { useXeroStatus } from '@/components/FinXero';
import { XeroWorkersButton } from '@/components/FinXeroWorkers';
import { Cell, FinTable, FootText } from '@/components/FinTable';
import { PhoneTable } from '@/components/PhoneTable';
import { bankOk, sortCode } from '@/components/FinSubs';
import { chooseAction, useToast } from '@/components/toast';
import { Button, Empty, Muted, SectionTitle } from '@/components/ui';
import { fdb, finInvoke, finStatus, selectAll, useFinSettings } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { canEditFinance } from '@/lib/roles';
import { useJobsData } from './jobs';
import { COST_CATS } from '@/lib/rules/finBook';
import { fdate, jobTag, money, num, vatList } from '@/lib/rules/finance';
import { base, radius, useDesk, useTheme } from '@/theme/theme';

type Row = Record<string, any>;
type Kind = 'client' | 'estimating' | 'supplier' | 'labour' | 'codes';
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

const CIS_REG: [string, string][] = [['', 'Choose…'], ['sole_trader', 'Sole trader'], ['company', 'Company'], ['partnership', 'Partnership'], ['trust', 'Trust']];

export default function FinDirectory() {
  const { kind: kindIn = 'client', from, add } = useLocalSearchParams<{ kind?: Kind; from?: string; add?: string }>();
  // The Estimating tab is gone (21 Nov 2026): an old link opens Clients, where each client's estimating details are.
  const kind: Kind = kindIn === 'estimating' ? 'client' : kindIn;
  // Cost codes live under Settings; People & rates keeps the Subcontractors tabs when opened from there.
  const section = kind === 'codes' ? 'settings' : kind === 'labour' && from === 'subs' ? 'subs' : 'directory';
  const subTab = section === 'subs' ? 'rates' : kind;
  // People & Rates keeps the Subcontractors & Labour tiles and counts (Andy, 11 Nov 2026: "the tiles disappear").
  const subsBadges = useSubsBadges();
  const { me } = useAuth();
  // The company's VAT rates (Finance Settings): switched-off ones still show on records that use them.
  const { data: fst } = useFinSettings(me?.org_id);
  const vatAll = vatList(fst), VAT_SHOW: [string, string][] = vatAll.map((r) => [r.code, r.name]);
  const VAT: [string, string][] = [['', 'Not set'], ...vatAll.filter((r) => r.active).map((r) => [r.code, r.name] as [string, string])];
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Row | null>(null);
  const [pplSel, setPplSel] = useState<Record<string, string[]>>({ show: ['subs'] });
  const [pplSort, setPplSort] = useState('az');
  const [busy, setBusy] = useState(false);
  // + New Contact (Andy, 21 Nov 2026): a client, a supplier or a subcontractor, each with what Xero asks for.
  const openNew = (k: Kind) => setEdit(k === 'labour' ? { key: '', name: '', r: { pay_type: 'subcontractor', cis_rate: 20 }, app: false } : { toX: true });
  const newContact = async () => {
    const k = await chooseAction('What Is This Contact?', [{ key: 'client', label: 'Client · We Invoice Them' }, { key: 'supplier', label: 'Supplier · We Buy From Them' }, { key: 'labour', label: 'Subcontractor · They Work For Us (CIS)' }]);
    if (!k) return;
    if (k === kind) openNew(k as Kind); else router.setParams({ kind: k, add: '1' } as never);
  };
  useEffect(() => { if (add === '1') { openNew(kind); router.setParams({ add: undefined } as never); } }, [add, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const desk = useDesk();
  const { data: xst } = useXeroStatus();
  const xeroOn = !!(xst?.data as Row | null | undefined)?.connected;
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
  const { data: mats = [] } = useQuery({ queryKey: ['finDir', me?.org_id, 'mats'], enabled: !!me && kind === 'supplier', queryFn: async () => ((await fdb.from('suppliers').select('id,name,email').eq('org_id', me?.org_id as string).order('name')).data as Row[] | null) ?? [] });
  // 9219j finSuppliersHtml: invoices, spend and what's still to pay per supplier.
  const { data: supInvs = [] } = useQuery({ queryKey: ['finDir', me?.org_id, 'supInvs'], enabled: !!me && kind === 'supplier', queryFn: async () => selectAll<Row>('purchase_invoices', 'id,supplier_id,supplier_name,status,net,total,paid_on', (x) => x.eq('org_id', me?.org_id as string)) });
  const { data: codes = [] } = useQuery({ queryKey: ['finDir', me?.org_id, 'codes'], enabled: !!me && kind !== 'codes', queryFn: async () => selectAll<Row>('fin_cost_codes', '*', (x) => x.eq('org_id', me?.org_id as string)) });
  if (!me) return null;
  // Without Finance – Edit (Admin › People › Invites & Roles) the Directory is shown, not changed: rows don't open their edit form.
  const canEdit = canEditFinance(me);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['finDir'] });
  const go = (k: string) => router.setParams({ kind: k });
  const ql = q.trim().toLowerCase();
  const onSub = (k: string) => {
    setQ('');
    if (section === 'settings') { if (k !== 'codes') finSettingsGo(k); return; }
    if (section === 'subs') { if (k !== 'rates') router.replace(`/fin/subs?tab=${k}` as never); return; }
    go(k);
  };
  /** A contact that's both a client and a supplier is one Xero contact: when one is saved, the other's shared details
   *  (name, contact, address, VAT, company and account numbers, Xero link) follow it. Matched by Xero link, else name. */
  const syncTwin = async (sup: boolean, rec: Row, oldName: string) => {
    const other = sup ? 'fin_clients' : 'fin_suppliers';
    const rows = (((await fdb.from(other).select('id,name,xero_contact_id').eq('org_id', me?.org_id as string)).data as Row[] | null) ?? []);
    const k = (n: unknown) => String(n || '').trim().toLowerCase();
    const twin = (rec.xero_contact_id && rows.find((r) => r.xero_contact_id === rec.xero_contact_id)) || rows.find((r) => k(r.name) === k(oldName) || k(r.name) === k(rec.name));
    if (!twin) return;
    const keys = ['name', 'email', 'phone', 'mobile', 'address', 'postcode', 'country', 'website', 'account_number', 'first_name', 'last_name', 'vat_registered', 'vat_number', 'company_number', 'xero_contact_id'];
    const patch: Row = {}; keys.forEach((x) => { if (rec[x] !== undefined && rec[x] !== null && rec[x] !== '') patch[x] = rec[x]; });
    if (Object.keys(patch).length) await fdb.from(other).update(patch as never).eq('id', twin.id);
  };
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
        ['email', 'phone', 'address', 'postcode', 'sales_vat', 'purchase_vat', 'company_number', 'mobile', 'account_number', 'first_name', 'last_name', 'website', 'country', ...(kind === 'client' ? [] : ['bank_sort_code', 'bank_account_number'])].forEach((k) => { if (x[k]) patch[k] = x[k]; });
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
    const list = rows.filter((x) => !pplSel.show.length || pplSel.show.some((k) => F[k](x))).filter((x) => !ql || `${x.name} ${x.r.name || ''} ${x.r.utr || ''}`.toLowerCase().includes(ql)).slice().sort((a, b) => (pplSort === 'za' ? -1 : 1) * String(a.name || '').localeCompare(String(b.name || '')));
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
      <FinPage title="Directory" section={section} sub={subTab} onSub={onSub} badges={section === 'subs' ? subsBadges : undefined} top={section === 'subs' ? <SubsStats /> : undefined}>
        <Muted style={{ marginBottom: 10 }}>Subcontractors who invoice you under CIS, and PAYE staff. Check each subbie&apos;s CIS status with HMRC before you pay them.</Muted>
        {waiting.length > 0 && canEdit && (
          <View style={{ borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, padding: 10, marginBottom: 10, backgroundColor: base.card }}>
            <Text style={{ fontWeight: '600', color: base.ink, marginBottom: 10 }}>{waiting.length} from the sub-contractor sign-up form, not in the directory yet</Text>
            {waiting.map((a) => (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: base.line }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '500', color: base.ink }}>{a.company_name || (a.data as Row | null)?.trading_name || a.contact_name || 'Applicant'} <Text style={{ color: a.status === 'approved' ? base.ok : base.slate, fontWeight: '400' }}>· {a.status === 'approved' ? 'Approved' : 'New'}</Text></Text>
                  <Muted>{[a.contact_name, a.email, a.phone].filter(Boolean).join(' · ')}</Muted>
                </View>
                <Button small kind="ghost" title="Add To Directory" onPress={() => void addFromApp(a)} />
              </View>
            ))}
          </View>
        )}
        {canEdit && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: desk ? 'flex-end' : 'center', marginBottom: 10 }}>{xeroOn && <XeroWorkersButton />}<Button title="+ New Contact" onPress={() => void newContact()} /></View>}
        {desk && <FinFilterBar search={{ value: q, onChange: setQ, placeholder: 'Search name or UTR' }} sel={pplSel} onChange={setPplSel} onClear={() => setPplSel({ show: [] })} sorts={[['az', 'Name A to Z'], ['za', 'Name Z to A']]} sort={pplSort} onSort={setPplSort}
          parts={[{ key: 'show', label: 'Show', items: [['subs', 'CIS subcontractors'], ['unver', 'Not verified'], ['paye', 'PAYE staff'], ['left', 'No longer working for us']].map(([v, l]) => ({ v, l, n: rows.filter(F[v]).length })) }]} />}
        {/* A laptop gets the current app's table: Name, CIS, UTR, HMRC Check, Day Rate, Bank and a day-rate total (9219j; cmp-fin 5 Nov 2026). */}
        {isLoading ? <Muted>Loading…</Muted> : desk && list.length ? (() => {
          const pill = (txt: string, bad: boolean) => <Text style={{ fontSize: 11, fontWeight: '600', color: bad ? '#92400E' : '#1E7A43', backgroundColor: bad ? '#FEF3C7' : '#E7F6EC', borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, overflow: 'hidden' }}>{txt}</Text>;
          const paye = (x: Row) => x.r.pay_type === 'paye';
          return (
            <FinTable rows={list} keyOf={(x) => x.key} onRow={canEdit ? (x) => setEdit(x) : undefined}
              cols={[
                { k: 'n', l: 'Name', flex: 1.6, min: 180, sort: (x: Row) => String(x.name || ''), render: (x: Row) => <View style={{ alignSelf: 'stretch' }}><Text style={{ fontWeight: '600', fontSize: 13, color: '#111827' }}>{x.name}</Text>{x.app ? <Text style={{ fontSize: 11.5, color: '#6b7280' }}>Has the app</Text> : null}</View> },
                { k: 'c', l: 'CIS', render: (x: Row) => <Cell>{paye(x) ? 'PAYE' : CIS.find(([k]) => Number(k) === Number(x.r.cis_rate ?? 20))?.[1]}</Cell> },
                { k: 'u', l: 'UTR', render: (x: Row) => (paye(x) ? <Cell>—</Cell> : x.r.utr ? <Cell>{x.r.utr}</Cell> : pill('Missing', true)) },
                { k: 'h', l: 'HMRC Check', render: (x: Row) => (paye(x) ? <Cell>—</Cell> : x.r.cis_verified_at ? pill(`Verified ${fdate(x.r.cis_verified_at)}`, false) : pill('Unverified', true)) },
                { k: 'd', l: 'Day Rate', sort: (x: Row) => Number(x.r.day_rate || 0), render: (x: Row) => <Cell>{x.r.day_rate ? money(x.r.day_rate) : '—'}</Cell> },
                { k: 'b', l: 'Bank', render: (x: Row) => (bankOk(x.r) ? <Cell>{`${sortCode(x.r.bank_sort_code)} · ••${String(x.r.bank_account_no).replace(/\D/g, '').slice(-4)}`}</Cell> : paye(x) ? <Cell>Payroll</Cell> : pill('Not saved', true)) },
              ]}
              foot={(left) => <><FootText bold>{left.length} shown</FootText><FootText>Day rates {money(left.reduce((t, x) => t + Number(x.r.day_rate || 0), 0))}</FootText></>} />
          );
        })() : !desk && rows.length ? (
          // A phone: a table like the rest of Finance (Andy, 14 Nov 2026); ▾ CIS / Not Verified / PAYE / Left under Pay.
          <PhoneTable key="labour" label="People And Rates" rows={rows.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))} keyOf={(x) => x.key} onRow={canEdit ? (x) => setEdit(x) : undefined}
            cols={[
              { k: 'n', l: 'Name', lines: 2, main: (x) => x.name, sub: (x) => (x.r.pay_type === 'paye' ? 'PAYE' : x.r.utr ? `UTR ${x.r.utr}` : 'UTR Missing'), find: (x) => `${x.name} ${x.r.name || ''} ${x.r.utr || ''}`, sort: (x) => String(x.name || '').toLowerCase() },
              { k: 'p', l: 'Pay', w: 96, center: true, main: (x) => (x.r.pay_type === 'paye' ? 'PAYE' : CIS.find(([k]) => Number(k) === Number(x.r.cis_rate ?? 20))?.[1] || ''), sub: (x) => (x.r.pay_type === 'paye' ? (bankOk(x.r) ? '' : 'Payroll') : x.r.cis_verified_at ? 'Verified' : 'Unverified'), tone: (x) => (x.r.pay_type !== 'paye' && !x.r.cis_verified_at ? '#B45309' : undefined),
                choose: { opts: [['', 'All'], ['subs', 'CIS'], ['unver', 'Not Verified'], ['paye', 'PAYE'], ['left', 'Left']], test: (x, v) => (F[v] ? F[v](x) : true), start: 'subs' } },
              { k: 'd', l: 'Day Rate', w: 76, right: true, bold: true, bigFirst: true, main: (x) => (x.r.day_rate != null ? money(x.r.day_rate) : '—'), sub: (x) => (bankOk(x.r) ? `••${String(x.r.bank_account_no).replace(/\D/g, '').slice(-4)}` : x.r.pay_type === 'paye' ? '' : 'No Bank'), sort: (x) => Number(x.r.day_rate || 0) },
            ]} />
        ) : list.length ? list.map((x) => (
          <FinRow compact key={x.key} title={x.name} sub={[x.app ? 'Has the app' : '', x.r.pay_type === 'paye' ? 'PAYE' : CIS.find(([k]) => Number(k) === Number(x.r.cis_rate ?? 20))?.[1], x.r.pay_type === 'paye' ? '' : x.r.utr ? `UTR ${x.r.utr}` : 'UTR missing', x.r.pay_type === 'paye' ? '' : x.r.cis_verified_at ? `verified ${fdate(x.r.cis_verified_at)}` : 'unverified', bankOk(x.r) ? `${sortCode(x.r.bank_sort_code)} · ••${String(x.r.bank_account_no).replace(/\D/g, '').slice(-4)}` : x.r.pay_type === 'paye' ? 'payroll' : 'bank not saved'].filter(Boolean).join(' · ')} right={x.r.day_rate != null ? `${money(x.r.day_rate)}/day` : ''} onPress={canEdit ? () => setEdit(x) : undefined} />
        )) : <Empty>No one here yet.</Empty>}
        {cur && (
          <FinForm title={cur.key ? cur.name : 'New Subcontractor'} initial={{ ...cur.r, name: cur.r.name || (cur.app ? cur.name : ''), cis_rate: String(cur.r.cis_rate ?? 20), pay_type: cur.r.pay_type || 'subcontractor', active: cur.r.active !== false, country: cur.r.country || 'United Kingdom', toX: true }} onClose={() => setEdit(null)}
            note={[cur.app ? `Has the app (${cur.email || ''}). Their name comes from their app account.` : '', cur.r.xero_contact_id ? 'Linked to Xero: saving sends what you change to Xero too.' : ''].filter(Boolean).join(' ') || undefined}
            // What Xero holds for a contact, plus CIS (Andy, 21 Nov 2026: "see what xero asks for and copy it"). Xero's CIS
            // settings can't be set from outside Xero, so the CIS rate and UTR are kept here.
            fields={(v) => [
              { k: 'h_contact', label: 'Contact', kind: 'heading' },
              ...(cur.app ? [] : [{ k: 'name', label: 'Name' }] as Field[]),
              { k: 'trading_name', label: 'Trading / Company Name' }, { k: 'pay_type', label: 'How They’re Paid', kind: 'choice', options: [['subcontractor', 'They Invoice Us (CIS)'], ['paye', 'PAYE (Payroll)']] },
              { k: 'first_name', label: 'Main Contact First Name', half: true }, { k: 'last_name', label: 'Main Contact Last Name', half: true },
              ...(cur.app ? [] : [{ k: 'email', label: 'Email (For CIS Statements)', kind: 'email' }, { k: 'phone', label: 'Phone', half: true }] as Field[]),
              { k: 'mobile', label: 'Mobile', half: true }, { k: 'website', label: 'Website', half: true }, { k: 'account_number', label: 'Account Number (Your Reference)', half: true },
              { k: 'h_address', label: 'Address', kind: 'heading' },
              { k: 'address', label: 'Address', kind: 'multiline', note: 'One line each: street, area, town.' }, { k: 'postcode', label: 'Postcode', half: true }, { k: 'country', label: 'Country', half: true },
              ...(v.pay_type === 'paye' ? [] : [
                { k: 'h_cis', label: 'CIS And Tax', kind: 'heading' },
                { k: 'cis_rate', label: 'CIS Rate', kind: 'choice', options: CIS, half: true }, { k: 'utr', label: 'UTR (10 Numbers)', half: true },
                { k: 'cis_reg_type', label: 'Registration Type', kind: 'choice', options: CIS_REG, half: true }, { k: 'cis_sub_type', label: 'Subcontractor Type', kind: 'choice', options: CIS_REG, half: true },
                { k: 'cis_verification_no', label: 'HMRC Verification Number', half: true }, { k: 'cis_verified_at', label: 'Verified Date', kind: 'date', half: true },
                { k: 'vat_registered', label: 'VAT Registered (Reverse Charge)', kind: 'check' }, { k: 'vat_number', label: 'VAT Number', half: true }, { k: 'company_number', label: 'Company Number', half: true },
              ] as Field[]),
              { k: 'h_bank', label: 'Bank Details And Rate', kind: 'heading' },
              { k: 'bank_account_name', label: 'Bank Account Name' }, { k: 'bank_sort_code', label: 'Sort Code', half: true }, { k: 'bank_account_no', label: 'Bank Account Number', half: true },
              { k: 'day_rate', label: 'Day Rate £', kind: 'money', half: true },
              { k: 'notes', label: 'Notes', kind: 'multiline' }, ...(cur.key && !cur.app ? [{ k: 'active', label: 'Still Working For Us', kind: 'check' }] as Field[] : []),
              ...(v.pay_type === 'paye' ? [] : [{ k: 'toX', label: cur.r.xero_contact_id ? 'Update Xero As Well' : 'Add To Xero As Well', kind: 'check' }] as Field[]),
            ]}
            onSave={async (v) => {
              const rate = num(v.day_rate); if (rate !== null && isNaN(rate)) return 'Day rate must be a number.';
              const sc = String(v.bank_sort_code || '').replace(/\D/g, ''), an = String(v.bank_account_no || '').replace(/\D/g, ''), utr = String(v.utr || '').replace(/\s/g, '');
              if (sc && sc.length !== 6) return 'Sort code should be 6 numbers.';
              if (an && an.length !== 8) return 'Account number should be 8 numbers.';
              if (utr && !/^\d{10}$/.test(utr)) return 'A UTR is 10 numbers.';
              const n = (x: unknown) => String(x ?? '').trim() || null;
              const pay = String(v.pay_type || 'subcontractor');
              const row: Row = { pay_type: pay, day_rate: rate, trading_name: n(v.trading_name), address: n(v.address), postcode: n(v.postcode)?.toUpperCase() || null, notes: n(v.notes), updated_at: new Date().toISOString(),
                first_name: n(v.first_name), last_name: n(v.last_name), mobile: n(v.mobile), website: n(v.website), account_number: n(v.account_number), country: n(v.country),
                bank_account_name: n(v.bank_account_name), bank_sort_code: sc ? `${sc.slice(0, 2)}-${sc.slice(2, 4)}-${sc.slice(4)}` : null, bank_account_no: an || null };
              if (pay !== 'paye') Object.assign(row, { cis_reg_type: v.cis_reg_type || null, cis_sub_type: v.cis_sub_type || null, cis_rate: Number(v.cis_rate || 20), utr: utr || null, vat_registered: !!v.vat_registered, vat_number: n(v.vat_number), company_number: n(v.company_number), cis_verification_no: n(v.cis_verification_no), cis_verified_at: n(v.cis_verified_at) });
              if (!cur.app) {
                const nm = n(v.name); if (!nm) return 'Enter their name.';
                const em = n(v.email); if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return 'Check the email address.';
                Object.assign(row, { name: nm, email: em, phone: n(v.phone) });
                if (cur.key) row.active = !!v.active;
              }
              const r = !cur.key ? await fdb.from('fin_labour_rates').insert({ ...row, org_id: me.org_id, user_id: null, active: true } as never).select('*').single()
                : cur.app ? await fdb.from('fin_labour_rates').upsert({ ...row, org_id: me.org_id, user_id: cur.key } as never, { onConflict: 'org_id,user_id' }).select('*').single()
                  : await fdb.from('fin_labour_rates').update(row as never).eq('id', cur.key.slice(2)).select('*').single();
              if (r.error) return `Save failed — ${r.error.message}`;
              const rec = r.data as Row;
              let msg = cur.key ? 'Saved' : 'Added';
              // Xero: a subcontractor is a supplier contact there, with their bank details (not for PAYE staff).
              if (v.toX && pay !== 'paye' && rec?.id) {
                const fields = { name: rec.trading_name || rec.name || cur.name, email: rec.email || cur.email || '', phone: rec.phone || '', mobile: rec.mobile || '', first_name: rec.first_name || '', last_name: rec.last_name || '',
                  account_number: rec.account_number || '', company_number: rec.company_number || '', vat_number: rec.vat_registered ? rec.vat_number || '' : '', address: rec.address || '', postcode: rec.postcode || '', country: rec.country || '',
                  bank_sort_code: rec.bank_sort_code || '', bank_account_number: rec.bank_account_no || '', supplier: true };
                let xid = rec.xero_contact_id as string | null, existed = false;
                const wasLinked = !!xid;
                if (!xid) {
                  const x = await finInvoke<{ contact: { id: string }; existed?: boolean }>(me, 'xero', { action: 'create_contact', ...fields });
                  if (x.error) msg += `. Xero: ${x.error.slice(0, 100)}`;
                  else if (x.data?.contact?.id) { xid = x.data.contact.id; existed = !!x.data.existed; await fdb.from('fin_labour_rates').update({ xero_contact_id: xid, xero_synced_at: new Date().toISOString() } as never).eq('id', rec.id); msg += existed ? ' — already in Xero, linked and updated' : ' and added to Xero'; }
                }
                if (xid && (wasLinked || existed)) {
                  const u = await finInvoke<{ ok: boolean }>(me, 'xero', { action: 'update_contact', id: xid, ...fields });
                  if (u.error) msg += `. Xero: ${u.error.slice(0, 100)}`;
                  else { await fdb.from('fin_labour_rates').update({ xero_synced_at: new Date().toISOString() } as never).eq('id', rec.id); if (wasLinked) msg += ' and Xero updated'; }
                }
              }
              toast(msg); refresh(); return null;
            }} />
        )}
      </FinPage>
    );
  }
  if (kind === 'codes') {
    const list = ((data as Row[]) || []).filter((c) => !ql || `${c.name} ${c.code || ''} ${c.description || ''}`.toLowerCase().includes(ql));
    const groups: Record<string, Row[]> = {}; list.forEach((c) => { (groups[c.grp || 'No group'] = groups[c.grp || 'No group'] || []).push(c); });
    return (
      <FinPage title="Cost codes" section={section} sub={subTab} onSub={onSub}>
        <View style={{ flexDirection: 'row', marginBottom: 10 }}><Muted style={{ flex: 1 }}>The ID is the Xero account code each cost goes to. The type decides which column it adds up in on job costs and reports.</Muted>{canEdit && <Button title="+ Add Cost Code" onPress={() => setEdit({ category: 'materials', grp: list[0]?.grp || '' })} />}</View>
        {desk && <TextInput value={q} onChangeText={setQ} placeholder="Search cost codes" style={box} />}
        {Object.keys(groups).sort().map((g) => (
          <View key={g}><SectionTitle>{g} · {groups[g].length} Cost Code{groups[g].length === 1 ? '' : 's'}</SectionTitle>{desk ? (
            // A laptop gets the current app's table: Name, ID, Description, Type (9219j; cmp-fin 5 Nov 2026).
            <FinTable rows={groups[g]} keyOf={(c) => c.id} onRow={canEdit ? (c) => setEdit(c) : undefined}
              cols={[
                { k: 'n', l: 'Name', flex: 1.4, render: (c: Row) => <Cell bold>{c.name}{c.active === false ? ' (hidden)' : ''}</Cell> },
                { k: 'id', l: 'ID', render: (c: Row) => <Cell>{c.code || '—'}</Cell> },
                { k: 'd', l: 'Description', flex: 2, render: (c: Row) => <Cell>{c.description || '—'}</Cell> },
                { k: 't', l: 'Type', render: (c: Row) => <Cell>{COST_CATS[c.category] || '—'}</Cell> },
              ]} />
          ) : (
            // A phone: a table like the rest of Finance (Andy, 14 Nov 2026).
            <PhoneTable key={`codes${g}`} label={`Cost codes ${g}`} rows={groups[g]} keyOf={(c) => c.id} onRow={canEdit ? (c) => setEdit(c) : undefined}
              cols={[
                { k: 'id', l: 'ID', w: 60, main: (c) => c.code || '—' },
                { k: 'n', l: 'Name', lines: 2, main: (c) => `${c.name}${c.active === false ? ' (Hidden)' : ''}`, sub: (c) => c.description || '', find: (c) => `${c.name} ${c.code || ''} ${c.description || ''}` },
                { k: 't', l: 'Type', w: 92, center: true, main: (c) => COST_CATS[c.category] || '—' },
              ]} />
          )}</View>
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
  // Suppliers (9219j finSuppliersHtml): the Directory's own, the Projects (ordering) suppliers and any name on a purchase invoice, one row
  // per name, with invoices, spend and what's left to pay. A row not in the Directory yet opens a new Directory supplier linked to it.
  const merged = (() => {
    if (!sup) return (data as Row[]) || [];
    const fin = (data as Row[]) || [], key = (n: unknown) => String(n || '').trim().toLowerCase(), rows: Record<string, Row> = {};
    fin.forEach((x) => { rows[key(x.name)] = { ...x, _mat: null, _n: 0, _spend: 0, _owed: 0 }; });
    mats.forEach((m) => { const fx = fin.find((x) => x.supplier_id === m.id); const k = key(fx ? fx.name : m.name); const r = (rows[k] = rows[k] || { name: m.name, email: m.email || '', supplier_id: m.id, toX: true, _mat: null, _n: 0, _spend: 0, _owed: 0 }); r._mat = m; if (!r.email) r.email = m.email || ''; });
    supInvs.filter((i) => !['void', 'rejected'].includes(String(i.status))).forEach((i) => {
      const m = i.supplier_id && mats.find((x) => x.id === i.supplier_id); const k = key(m ? (fin.find((x) => x.supplier_id === m.id)?.name || m.name) : i.supplier_name); if (!k) return;
      const r = (rows[k] = rows[k] || { name: i.supplier_name, email: '', toX: true, _mat: null, _n: 0, _spend: 0, _owed: 0 });
      r._n++; if (i.status === 'approved') { r._spend += Number(i.net || 0); if (!i.paid_on) r._owed += Number(i.total || 0); }
    });
    return Object.values(rows).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  })();
  const list = merged.filter((c) => !ql || `${c.name} ${c.email || ''} ${c.category || ''}`.toLowerCase().includes(ql));
  return (
    <FinPage title="Directory" section={section} sub={subTab} onSub={onSub} badges={section === 'subs' ? subsBadges : undefined} top={section === 'subs' ? <SubsStats /> : undefined}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Text style={{ flex: 1, minWidth: 200, fontSize: 12, color: '#6b7280' }}>{list.length} {sup ? 'supplier' : 'client'}{list.length === 1 ? '' : 's'} · {list.filter((c) => c.xero_contact_id).length} in Xero.{!canEdit ? '' : sup ? ' Tap one to set VAT, payment terms and a default cost code.' : ' New clients you add here go into Xero too.'}</Text>
        {canEdit && <Pressable disabled={busy} onPress={() => void pull()} style={{ borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 }}><Text style={{ fontSize: 12, fontWeight: '500', color: base.ink }}>{busy ? 'Pulling…' : '⟳ Pull from Xero'}</Text></Pressable>}
        {canEdit && <Pressable onPress={() => void newContact()} style={{ backgroundColor: th.brand1, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 }}><Text style={{ fontSize: 12, fontWeight: '600', color: th.brand1Text }}>+ New Contact</Text></Pressable>}
      </View>
      {/* A phone's table has a search box under each heading (Andy, 14 Nov 2026); a laptop keeps the search bar. */}
      {desk && <TextInput value={q} onChangeText={setQ} placeholder={`Search ${sup ? 'suppliers' : 'clients'}`} style={box} />}
      {isLoading ? <Muted>Loading…</Muted> : desk && list.length ? (() => {
        const jobsOf = (c: Row) => sites.filter((s) => String(s.client_name || jd?.jfBy[s.id]?.billing_name || '').trim().toLowerCase() === String(c.name).trim().toLowerCase());
        const owedOf = (c: Row) => jobsOf(c).reduce((t, s) => ({ o: t.o + (jd?.m[s.id]?.owed || 0), od: t.od + (jd?.m[s.id]?.overdue || 0) }), { o: 0, od: 0 });
        return (
          <FinTable rows={list} keyOf={(c) => c.id || `n:${c.name}`} onRow={canEdit ? (c) => setEdit(c) : undefined}
            cols={[
              { k: 'n', l: sup ? 'Supplier' : 'Client', flex: 2.2, min: 220, render: (c: Row) => (
                <View style={{ alignSelf: 'stretch' }}>
                  <Text style={{ fontWeight: '600', fontSize: 13, color: '#111827' }}>{c.name}</Text>
                  <Text style={{ fontSize: 11.5, color: '#6b7280' }}>{[sup ? c.category : '', termsText(c), c.sales_vat ? `${sup ? '' : 'Sales '}VAT ${VAT_SHOW.find(([k]) => k === c.sales_vat)?.[1]}` : '', c.cis_registered ? 'CIS' : ''].filter(Boolean).join(' · ')}</Text>
                  {!!c.email && <Text style={{ fontSize: 11.5, color: '#6b7280' }}>{c.email}</Text>}
                  {!sup && c.onedrive_folders === false && <Text style={{ fontSize: 10.5, fontWeight: '600', color: base.ink }}>No OneDrive Folders</Text>}
                  {sup && !!c._mat && <Text style={{ fontSize: 10.5, fontWeight: '600', color: '#1e40af' }}>Materials</Text>}
                </View>
              ) },
              ...(sup ? [{ k: 'pv', l: 'Purchase VAT', render: (c: Row) => <Cell tone={c.foreign_supplier || c.purchase_vat ? undefined : base.slate}>{c.foreign_supplier ? 'Foreign (no VAT)' : c.purchase_vat ? VAT_SHOW.find(([k]) => k === c.purchase_vat)?.[1] || c.purchase_vat : 'Not set'}</Cell> },
                { k: 'tm', l: 'Terms', render: (c: Row) => <Cell tone={termsText(c) ? undefined : base.slate}>{termsText(c) || 'Not set'}</Cell> }] : []),
              ...(sup ? [] : [{ k: 'j', l: 'Jobs', render: (c: Row) => { const js = jobsOf(c); return <Cell bold>{js.length} job{js.length === 1 ? '' : 's'} · {js.filter((s) => finStatus(s) === 'live').length} live</Cell>; } }]),
              { k: 'x', l: 'Xero', render: (c: Row) => c.xero_contact_id ? <Cell>In Xero</Cell> : <Text style={{ fontSize: 12, fontWeight: '500', color: base.ink, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, paddingVertical: 5, paddingHorizontal: 10, overflow: 'hidden' }}>Add to Xero</Text> },
              ...(sup ? [{ k: 'ni', l: 'Invoices', sort: (c: Row) => c._n, render: (c: Row) => <Cell>{c._n}</Cell> }, { k: 'sp', l: 'Spent (Net)', sort: (c: Row) => c._spend, render: (c: Row) => <Cell>{money(c._spend)}</Cell> }, { k: 'tp', l: 'To Pay', sort: (c: Row) => c._owed, render: (c: Row) => <Cell>{c._owed ? money(c._owed) : '—'}</Cell> }] : []),
              ...(sup ? [] : [{ k: 'o', l: 'Owed', render: (c: Row) => { const o = owedOf(c); return <View style={{ alignItems: 'center' }}><Cell>{o.o ? money(o.o, 0) : '—'}</Cell>{o.od ? <Text style={{ fontSize: 11, color: '#c81e1e', fontWeight: '500' }}>{money(o.od, 0)} overdue</Text> : null}</View>; } }]),
            ]}
            foot={(list) => <><FootText bold>{list.length} shown</FootText>{!sup && <FootText>Owed {money(list.reduce((t, c) => t + owedOf(c).o, 0))}</FootText>}{sup && <FootText>To pay {money(list.reduce((t, c) => t + Number(c._owed || 0), 0))}</FootText>}</>} />
        );
      })() : list.length ? (
        <PhoneTable key={sup ? 'suppliers' : 'clients'} label="Directory" rows={list} keyOf={(c) => c.id || `n:${c.name}`} onRow={canEdit ? (c) => setEdit(c) : undefined}
          cols={[
            { l: sup ? 'Supplier' : 'Client', main: (c) => c.name, sub: (c) => c.email || (sup ? c.category : '') || '', find: (c) => `${c.name} ${c.email || ''} ${c.category || ''}` },
            { l: sup ? 'Owed' : 'Terms', w: 92, right: !!sup, bold: !!sup, bigFirst: !!sup, main: (c) => (sup ? (c._owed ? money(c._owed) : '—') : termsText(c) || '—'), sub: (c) => (sup && c._n ? `${c._n} Invoice${c._n === 1 ? '' : 's'}` : ''), sort: (c) => (sup ? Number(c._owed || 0) : termsText(c) || '') },
            { l: 'Xero', w: 52, main: (c) => (c.xero_contact_id ? 'Yes' : 'No') },
          ]} />
      ) : <Empty>Nothing here yet.</Empty>}
      {!sup && !!jd && sites.some((s) => !(s.client_name || jd.jfBy[s.id]?.billing_name)) && <Muted style={{ marginTop: 10 }}>Jobs with no client set: {sites.filter((s) => !(s.client_name || jd.jfBy[s.id]?.billing_name)).map(jobTag).join(', ')}</Muted>}
      {edit && (
        <FinForm title={edit.id ? edit.name : `New ${sup ? 'supplier' : 'client'}`} initial={{ ...edit, estimating_markup_pct: edit.estimating_markup_pct ?? '', terms_days: edit.terms_days ?? '', cis_rate: String(edit.cis_rate ?? 20), toX: true, od_folders: edit.onedrive_folders === false ? 'no' : 'yes', quote_chase: edit.quote_chase === false ? 'no' : 'yes', country: edit.country || 'United Kingdom' }} onClose={() => setEdit(null)}
          note={edit.xero_contact_id ? 'Linked to Xero: saving sends what you change to Xero too.' : 'Not in Xero yet.'}
          // Everything a Xero contact holds, in one record (Andy, 21 Nov 2026: "whatever Xero needs for suppliers, clients etc
          // we need to make sure we have in the directory to fill in and issue to Xero"). A client's estimating details are
          // here too (the Estimating tab was "a duplicate of the clients").
          fields={[
            { k: 'h_contact', label: 'Contact', kind: 'heading' },
            { k: 'name', label: `${sup ? 'Supplier' : 'Client'} Name` }, ...(sup ? [{ k: 'category', label: 'Category', kind: 'choice', options: [['', 'Not set'], ...SUP_CATS.map((x) => [x, x])], half: true }, { k: 'supplier_id', label: 'Projects Supplier (Ordering)', kind: 'choice', half: true, options: [['', 'Not linked'], ...mats.map((m) => { const other = ((data as Row[]) || []).find((x) => x.supplier_id === m.id && x.id !== edit.id); return [m.id, `${m.name}${other ? ` (linked to ${other.name})` : ''}`]; }), ['__new', '+ Add to the Projects suppliers']], note: 'Links this record to the supplier you order from on projects.' }] as Field[] : []),
            { k: 'first_name', label: 'Main Contact First Name', half: true }, { k: 'last_name', label: 'Main Contact Last Name', half: true },
            { k: 'email', label: sup ? 'Supplier Email' : 'Accounts Email', kind: 'email' }, { k: 'phone', label: 'Phone', half: true }, { k: 'mobile', label: 'Mobile', half: true },
            { k: 'website', label: 'Website', half: true }, { k: 'account_number', label: 'Account Number (Your Reference)', half: true, note: 'Your reference for them in Xero.' },
            { k: 'h_address', label: 'Address', kind: 'heading' },
            { k: 'address', label: 'Address', kind: 'multiline', note: 'One line each: street, area, town.' }, { k: 'postcode', label: 'Postcode', half: true }, { k: 'country', label: 'Country', half: true },
            { k: 'h_tax', label: 'VAT, CIS And Payment Terms', kind: 'heading' },
            { k: 'vat_registered', label: 'VAT Registered', kind: 'check' }, { k: 'vat_number', label: 'VAT Number', half: true }, { k: 'company_number', label: 'Company Number', half: true },
            { k: 'sales_vat', label: sup ? 'Default Sales VAT' : 'Default VAT Code On Invoices', kind: 'choice', options: VAT, half: true },
            ...(sup ? [{ k: 'purchase_vat', label: 'Default Purchase VAT', kind: 'choice', options: VAT, half: true }, { k: 'foreign_supplier', label: 'Foreign Supplier (Ignore VAT)', kind: 'check' }, { k: 'utr', label: 'UTR', half: true }] as Field[] : []),
            { k: 'cis_registered', label: sup ? 'CIS Subcontractor (You Deduct CIS)' : 'CIS Registered (They Deduct CIS From You)', kind: 'check' }, { k: 'cis_rate', label: 'CIS Rate', kind: 'choice', options: CIS, half: true },
            { k: 'terms_days', label: 'Payment Terms (Number)', kind: 'number', half: true }, { k: 'terms_type', label: 'Terms Type', kind: 'choice', options: TERMS, half: true }, { k: 'terms_agreed', label: 'Terms Agreed (Signed)', kind: 'check' },
            { k: 'cost_code_id', label: sup ? 'Default Cost Code (Xero Purchases Account)' : 'Default Cost Code (Xero Sales Account)', kind: 'choice', options: [['', 'None'], ...codes.filter((x) => x.active !== false).map((x) => [x.id, `${x.code ? `${x.code} – ` : ''}${x.name}`] as [string, string])] },
            ...(sup ? [
              { k: 'h_bank', label: 'Bank Details (For Paying Them)', kind: 'heading' },
              { k: 'bank_account_name', label: 'Bank Account Name' }, { k: 'bank_sort_code', label: 'Sort Code', half: true, ph: '12-34-56' }, { k: 'bank_account_number', label: 'Bank Account Number', half: true, ph: '8 numbers' },
              { k: 'no_sync', label: 'Don’t Send This Supplier’s Bills To Xero', kind: 'check' },
            ] as Field[] : [
              { k: 'h_est', label: 'Estimating', kind: 'heading' },
              { k: 'estimator_name', label: 'Estimator Name', note: 'Fills in the contact on a new enquiry; the chaser emails them.' },
              { k: 'estimator_email', label: 'Estimator Email', kind: 'email', half: true }, { k: 'estimator_phone', label: 'Estimator Phone', half: true },
              { k: 'estimating_markup_pct', label: 'Estimating Mark-Up %', kind: 'number', half: true, note: 'The guide mark-up new quotes for this client start with.' },
              { k: 'quote_chase', label: 'Auto Chase New Quotes?', kind: 'choice', options: [['yes', 'Yes'], ['no', 'No']], half: true },
              // Some clients never want OneDrive folders (Andy, 8 Nov 2026): their new jobs start with the tick off. Jobs already made keep theirs.
              { k: 'od_folders', label: 'Create OneDrive Folders For This Client’s Jobs?', kind: 'choice', options: [['yes', 'Yes'], ['no', 'No']], half: true, note: 'No: their new jobs start without one. Jobs already made keep theirs.' },
            ] as Field[]),
            { k: 'notes', label: 'Notes', kind: 'multiline' },
            { k: 'toX', label: edit.xero_contact_id ? 'Update Xero As Well' : 'Add To Xero As Well', kind: 'check' },
          ]}
          onSave={async (v) => {
            const name = String(v.name || '').trim(); if (!name) return 'Enter the name.';
            const email = String(v.email || '').trim(); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Check the email address.';
            const utr = String(v.utr || '').replace(/\s/g, ''); if (utr && !/^\d{10}$/.test(utr)) return 'A UTR is 10 numbers.';
            const sort = String(v.bank_sort_code || '').replace(/[^0-9]/g, ''), acct = String(v.bank_account_number || '').replace(/[^0-9]/g, '');
            if (sup && sort && sort.length !== 6) return 'A sort code is 6 numbers.';
            if (sup && acct && acct.length !== 8) return 'A bank account number is 8 numbers.';
            const estEmail = String(v.estimator_email || '').trim(); if (!sup && estEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(estEmail)) return 'Check the estimator’s email address.';
            const t = (k: string) => String(v[k] ?? '').trim() || null;
            const row: Row = { name, email: email || null, address: t('address'), postcode: t('postcode'), phone: t('phone'), vat_registered: !!v.vat_registered, vat_number: t('vat_number'), sales_vat: t('sales_vat'), terms_days: num(v.terms_days), terms_type: t('terms_type'), terms_agreed: !!v.terms_agreed, cost_code_id: t('cost_code_id'), company_number: t('company_number'), cis_registered: !!v.cis_registered, cis_rate: Number(v.cis_rate || 20), notes: t('notes'),
              account_number: t('account_number'), first_name: t('first_name'), last_name: t('last_name'), mobile: t('mobile'), website: t('website'), country: t('country') };
            if (sup) Object.assign(row, { bank_account_name: t('bank_account_name'), bank_sort_code: sort ? `${sort.slice(0, 2)}-${sort.slice(2, 4)}-${sort.slice(4)}` : null, bank_account_number: acct || null });
            else Object.assign(row, { estimator_name: t('estimator_name'), estimator_email: estEmail || null, estimator_phone: t('estimator_phone'), estimating_markup_pct: num(v.estimating_markup_pct), quote_chase: v.quote_chase !== 'no' });
            let link = sup ? String(v.supplier_id || '') || null : null;
            if (link === '__new') { const m = await fdb.from('suppliers').insert({ org_id: me.org_id, name, email: email || '', created_by: me.id } as never).select('id').single(); link = (m.data as Row | null)?.id ?? null; if (!link) return 'Could not add it to the Projects suppliers.'; }
            if (!sup) row.onedrive_folders = v.od_folders !== 'no';
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
            // Xero: what's filled in goes there, as a new contact or to the one it's linked to.
            if (v.toX) {
              const code = codes.find((c) => c.id === rec.cost_code_id)?.code;
              const fields = { name: rec.name, email: rec.email || '', phone: rec.phone || '', mobile: rec.mobile || '', first_name: rec.first_name || '', last_name: rec.last_name || '', account_number: rec.account_number || '',
                company_number: rec.company_number || '', vat_number: rec.vat_registered ? rec.vat_number || '' : '', address: rec.address || '', postcode: rec.postcode || '', country: rec.country || '',
                sales_vat: rec.sales_vat || '', purchase_vat: sup ? rec.purchase_vat || '' : '', terms_days: rec.terms_days, terms_type: rec.terms_type || '', account_code: code || '',
                bank_sort_code: sup ? rec.bank_sort_code || '' : '', bank_account_number: sup ? rec.bank_account_number || '' : '', estimator_name: sup ? '' : rec.estimator_name || '', estimator_email: sup ? '' : rec.estimator_email || '', supplier: sup };
              let xid = rec.xero_contact_id as string | null, existed = false;
              const wasLinked = !!xid;
              if (!xid) {
                const x = await finInvoke<{ contact: { id: string }; existed?: boolean }>(me, 'xero', { action: 'create_contact', ...fields });
                if (x.error) msg += `. Xero: ${x.error.slice(0, 100)}`;
                else if (x.data?.contact?.id) { xid = x.data.contact.id; existed = !!x.data.existed; rec.xero_contact_id = xid; await fdb.from(tbl).update({ xero_contact_id: xid, xero_synced_at: new Date().toISOString() } as never).eq('id', rec.id); msg += existed ? ' — already in Xero, linked and updated' : ' and added to Xero'; }
              }
              if (xid && (wasLinked || existed)) {
                const u = await finInvoke<{ ok: boolean }>(me, 'xero', { action: 'update_contact', id: xid, ...fields });
                if (u.error) msg += `. Xero: ${u.error.slice(0, 100)}`;
                else { await fdb.from(tbl).update({ xero_synced_at: new Date().toISOString() } as never).eq('id', rec.id); if (wasLinked) msg += ' and Xero updated'; }
              }
            }
            // The same contact as a supplier and a client (one Xero contact): its details, and its Xero link, stay the same in
            // both (21 Nov 2026).
            await syncTwin(sup, rec, String(edit.name || rec.name));
            toast(msg); refresh(); return null;
          }} />
      )}
    </FinPage>
  );
}
