// Subcontractors & Labour (9219c / 905 / 9218): operative invoices, the
// Friday pay run, subcontractor POs, their applications & certificates, and
// the CIS month — for the company or one project (siteId).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { FinChip, FinRow, FinSeg, FinStat } from '@/components/FinNav';
import { pickJob } from '@/components/FinSales';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { fdb, selectAll, useFinSettings } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { addDays, fdate, jobTag, money, round2, today } from '@/lib/rules/finance';
import { base, radius } from '@/theme/theme';

type Row = Record<string, any>;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 10 };
export const monday = (d: string) => { const x = new Date(`${d}T12:00:00`); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x.toISOString().slice(0, 10); };
export const payCfg = (s: Row | undefined) => ({ wd: s?.pay_weekday != null ? Number(s.pay_weekday) : 5, wih: s?.pay_weeks_in_hand != null ? Number(s.pay_weeks_in_hand) : 1 });
export function nextPayDay(s: Row | undefined, now = today()) { const { wd } = payCfg(s); const d = new Date(`${now}T12:00:00`); while (d.getDay() !== wd) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
export const bankOk = (r: Row | undefined) => !!(r && String(r.bank_sort_code || '').replace(/\D/g, '').length === 6 && /^\d{8}$/.test(String(r.bank_account_no || '').replace(/\D/g, '')));
export const sortCode = (s: unknown) => { const d = String(s || '').replace(/\D/g, ''); return d.length === 6 ? `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}` : String(s || ''); };
export function taxMonthStart(d: string) { const x = new Date(`${d}T12:00:00`); if (x.getDate() < 6) x.setMonth(x.getMonth() - 1); x.setDate(6); return x.toISOString().slice(0, 10); }
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function useSubsData(orgId: string | null | undefined, siteId?: string) {
  return useQuery({
    queryKey: ['finSubs', orgId, siteId || ''], enabled: !!orgId,
    queryFn: async () => {
      const f = (q: Parameters<Parameters<typeof selectAll>[2]>[0]) => (siteId ? q.eq('site_id', siteId) : q.eq('org_id', orgId as string));
      const [scs, sapps, ops, rates] = await Promise.all([
        selectAll<Row>('fin_subcontracts', '*', f), selectAll<Row>('fin_sub_apps', '*', f),
        selectAll<Row>('fin_sub_payments', '*', (q) => q.eq('org_id', orgId as string).is('sub_app_id', null).neq('status', 'void')),
        selectAll<Row>('fin_labour_rates', '*', (q) => q.eq('org_id', orgId as string)),
      ]);
      const rateBy: Record<string, Row> = {}; rates.forEach((r) => { rateBy[r.user_id || `w:${r.id}`] = r; });
      const opsHere = siteId ? ops.filter((p) => (p.lines || []).some((l: Row) => l.site_id === siteId)) : ops;
      return { scs: scs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), sapps: sapps.sort((a, b) => String(b.app_date || '').localeCompare(String(a.app_date || ''))), ops: opsHere.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), allOps: ops, rateBy };
    },
  });
}

export function SubsLists({ tab, siteId }: { tab: 'opinv' | 'payrun' | 'orders' | 'apps' | 'cis'; siteId?: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const { data: st } = useFinSettings(me?.org_id);
  const { data } = useSubsData(me?.org_id, siteId);
  const [opf, setOpf] = useState('topay');
  const [scf, setScf] = useState('active');
  const [saf, setSaf] = useState('open');
  const [q, setQ] = useState('');
  const [runDay, setRunDay] = useState<string | null>(null);
  const [cisMonth, setCisMonth] = useState(() => taxMonthStart(addDays(today(), -30)));
  const { data: cisPays } = useQuery({ queryKey: ['finCis', me?.org_id, cisMonth], enabled: !!me && tab === 'cis', queryFn: async () => {
    const e = new Date(`${cisMonth}T12:00:00`); e.setMonth(e.getMonth() + 1); e.setDate(5);
    return selectAll<Row>('fin_sub_payments', '*', (x) => x.eq('org_id', me?.org_id as string).eq('status', 'paid').gte('paid_on', cisMonth).lte('paid_on', e.toISOString().slice(0, 10)));
  } });
  if (!data || !me) return <Muted>Loading…</Muted>;
  const site = (id: string) => sites.find((s) => s.id === id);
  const ql = q.trim().toLowerCase(), hit = (...v: unknown[]) => !ql || v.join(' ').toLowerCase().includes(ql);
  const opJobs = (p: Row) => Array.from(new Set((p.lines || []).map((l: Row) => l.site_id).filter(Boolean) as string[])).map((id) => jobTag(site(id))).join(', ');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['finSubs'] });
  const search = (ph: string) => <TextInput value={q} onChangeText={setQ} placeholder={ph} style={box} />;

  if (tab === 'opinv') {
    const F: Record<string, (p: Row) => boolean> = { topay: (p) => p.status === 'approved' || p.status === 'draft', paid: (p) => p.status === 'paid', all: () => true };
    const list = data.ops.filter(F[opf]).filter((p) => hit(p.name, p.invoice_no, opJobs(p)));
    return (
      <View>
        <Muted style={{ marginBottom: 8 }}>When an operative sends their invoice, put it in here with the amount for each job. CIS is worked out for you and it&apos;s paid in the pay run. (Sending it to the job&apos;s PM is off while Finance is on trial.)</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          <FinSeg value={opf} onChange={setOpf} items={[['topay', 'To Pay'], ['paid', 'Paid'], ['all', 'All']].map(([k, l]) => [k, l, data.ops.filter(F[k]).length] as [string, string, number])} />
          <View style={{ marginLeft: 'auto' }}><Button title="+ Operative invoice" onPress={() => router.push('/fin/labour/new' as never)} /></View>
        </View>
        {search('Search name, invoice no. or job')}
        {list.length ? list.map((p) => <FinRow key={p.id} title={p.name || 'Operative'} sub={[p.invoice_no ? `inv ${p.invoice_no}` : '', `w/c ${fdate(p.period_start)}`, opJobs(p), `gross ${money(p.gross)} · CIS −${money(p.cis_deduction)}`, p.status === 'paid' ? `Paid ${fdate(p.paid_on)}` : p.status === 'approved' ? 'To pay' : 'Draft'].filter(Boolean).join(' · ')} right={money(p.net_pay)} onPress={() => router.push(`/fin/labour/${p.id}` as never)} />)
          : <Empty>No operative invoices here.</Empty>}
      </View>
    );
  }
  if (tab === 'payrun') {
    const day = runDay || nextPayDay(st);
    const upTo = addDays(addDays(monday(day), -7 * payCfg(st).wih), 6);
    const keyOf = (p: Row) => (p.worker_id ? `w:${p.worker_id}` : p.user_id || '');
    const due = data.allOps.filter((p) => p.status === 'approved' && p.period_start <= upTo), later = data.allOps.filter((p) => p.status === 'approved' && p.period_start > upTo);
    const paidHere = data.allOps.filter((p) => p.status === 'paid' && (p.pay_date === day || p.paid_on === day));
    const tot = (k: string) => round2(due.reduce((t, p) => t + Number(p[k] || 0), 0));
    const noBank = due.filter((p) => !bankOk(data.rateBy[keyOf(p)])).length;
    const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const cfgSave = async (k: string, v: number) => { if ((await fdb.from('fin_settings').upsert({ org_id: me.org_id, [k]: v } as never, { onConflict: 'org_id' })).error) toast('Could not save — admins only'); else void qc.invalidateQueries({ queryKey: ['finSettings'] }); };
    return (
      <View>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Button kind="ghost" title="‹" onPress={() => setRunDay(addDays(day, -7))} />
            <View style={{ flex: 1, alignItems: 'center' }}><Muted>Pay day</Muted><Text style={{ fontWeight: '800', fontSize: 17, color: base.ink }}>{fmt(day)}</Text><Muted>Pays operative invoices for work up to {fmt(upTo)}</Muted></View>
            <Button kind="ghost" title="›" onPress={() => setRunDay(addDays(day, 7))} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {WEEKDAYS.map((n, i) => <FinChip key={n} on={payCfg(st).wd === i} label={`${n.slice(0, 3)}s`} onPress={() => void cfgSave('pay_weekday', i)} />)}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {[[0, 'Same week'], [1, 'A week in hand'], [2, 'Two weeks behind']].map(([n, l]) => <FinChip key={l as string} on={payCfg(st).wih === n} label={l as string} onPress={() => void cfgSave('pay_weeks_in_hand', n as number)} />)}
          </View>
        </Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <FinStat v={money(tot('gross'))} label="Invoices" /><FinStat v={money(tot('cis_deduction'))} label="CIS to pay HMRC" /><FinStat v={money(tot('net_pay'))} label="To transfer" />
        </View>
        <Button title={`Mark ${due.length || ''} paid once you’ve sent the money`} disabled={!due.length} onPress={async () => {
          if (!(await confirmAsk(`Mark ${due.length} operative invoice${due.length === 1 ? '' : 's'} (${money(tot('net_pay'))}) as paid on ${fdate(day)}?`, 'Mark paid'))) return;
          let n = 0; for (const p of due) if (!!(await fdb.from('fin_sub_payments').update({ status: 'paid', paid_on: day, pay_date: day } as never).eq('id', p.id).select('id')).data?.length) n++;
          toast(`${n} marked paid`); refresh();
        }} />
        {noBank > 0 && <Text style={{ color: '#C0392B', marginVertical: 8 }}>{noBank} {noBank === 1 ? 'person has' : 'people have'} no bank details saved — add them in People &amp; rates.</Text>}
        <View style={{ marginTop: 8 }}>
          {due.concat(paidHere).length ? due.concat(paidHere).map((p) => { const r = data.rateBy[keyOf(p)]; return (
            <FinRow key={p.id} title={p.name || 'Operative'} sub={[p.invoice_no ? `inv ${p.invoice_no}` : '', `w/c ${fdate(p.period_start)}`, `gross ${money(p.gross)} · CIS −${money(p.cis_deduction)}`, bankOk(r) ? `${r.bank_account_name || ''} ${sortCode(r.bank_sort_code)} · ${String(r.bank_account_no).replace(/\D/g, '')}` : 'No bank details', p.status === 'paid' ? 'Paid' : 'To pay'].filter(Boolean).join(' · ')} right={money(p.net_pay)} onPress={() => router.push(`/fin/labour/${p.id}` as never)} />
          ); }) : <Empty>Nothing to pay on this day.</Empty>}
        </View>
        {later.length > 0 && <Muted style={{ marginTop: 8 }}>{later.length} later invoice{later.length === 1 ? '' : 's'} ({money(later.reduce((t, p) => t + Number(p.net_pay || 0), 0))}) will be in a later pay run.</Muted>}
      </View>
    );
  }
  if (tab === 'orders') {
    const F: Record<string, (s: Row) => boolean> = { active: (s) => s.status !== 'complete', complete: (s) => s.status === 'complete', all: () => true };
    const lastCert = (id: string) => data.sapps.filter((a) => a.subcontract_id === id && a.certified_gross != null).sort((x, y) => y.number - x.number)[0];
    const list = data.scs.filter(F[scf]).filter((sc) => hit(sc.name, sc.number, sc.description, jobTag(site(sc.site_id))));
    return (
      <View>
        <Muted style={{ marginBottom: 8 }}>For subcontractors on a fixed price who apply for payment (e.g. leadwork, scaffolding).</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          <FinSeg value={scf} onChange={setScf} items={[['active', 'Active'], ['complete', 'Complete'], ['all', 'All']].map(([k, l]) => [k, l, data.scs.filter(F[k]).length] as [string, string, number])} />
          <View style={{ marginLeft: 'auto' }}><Button title="+ Subcontractor PO" onPress={async () => { const sid = siteId || (await pickJob('New subcontractor PO', sites.filter((s) => s.status !== 'closed'))); if (sid) router.push(`/fin/sub/new?site=${sid}` as never); }} /></View>
        </View>
        {search('Search subcontractor or project')}
        {list.length ? list.map((sc) => <FinRow key={sc.id} left={sc.number} title={sc.name} sub={[siteId ? '' : jobTag(site(sc.site_id)), sc.description, `certified ${money(lastCert(sc.id)?.certified_gross || 0)}`, sc.status === 'complete' ? 'Complete' : 'Active'].filter(Boolean).join(' · ')} right={sc.order_value != null ? money(sc.order_value) : '—'} onPress={() => router.push(`/fin/sub/${sc.id}` as never)} />)
          : <Empty>No subcontract orders here.</Empty>}
      </View>
    );
  }
  if (tab === 'apps') {
    const scBy: Record<string, Row> = {}; data.scs.forEach((s) => { scBy[s.id] = s; });
    const F: Record<string, (a: Row) => boolean> = { open: (a) => a.status === 'received', certified: (a) => a.status === 'certified', paid: (a) => a.status === 'paid', all: () => true };
    const list = data.sapps.filter(F[saf]).filter((a) => hit(scBy[a.subcontract_id]?.name, scBy[a.subcontract_id]?.number, jobTag(site(a.site_id))));
    return (
      <View>
        <Muted style={{ marginBottom: 8 }}>A subcontractor applies → you certify it and send the payment or pay-less notice before the final date → mark it paid.</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          <FinSeg value={saf} onChange={setSaf} items={[['open', 'To Certify'], ['certified', 'Certified — To Pay'], ['paid', 'Paid'], ['all', 'All']].map(([k, l]) => [k, l, data.sapps.filter(F[k]).length] as [string, string, number])} />
        </View>
        {search('Search subcontractor or project')}
        {list.length ? list.map((a) => { const sc = scBy[a.subcontract_id] || {}, late = a.status !== 'paid' && a.final_date && a.final_date < today(); return (
          <FinRow key={a.id} title={`${sc.name || ''} — application ${a.number}`} sub={[sc.number, siteId ? '' : jobTag(site(a.site_id)), fdate(a.app_date), a.final_date ? `pay by ${fdate(a.final_date)}` : '', `applied ${money(a.applied_gross)}`, a.certified_gross != null ? `certified ${money(a.certified_gross)}` : '', a.status === 'paid' ? 'Paid' : a.status === 'certified' ? 'Certified' : 'To certify', a.payless ? 'Pay less' : ''].filter(Boolean).join(' · ')} right={a.certified_gross != null ? money(a.pay_amount) : '—'} tone={late ? '#C0392B' : undefined} onPress={() => router.push(`/fin/sub/${a.subcontract_id}?app=${a.id}` as never)} />
        ); }) : <Empty>Nothing here.</Empty>}
      </View>
    );
  }
  // CIS month
  const e = new Date(`${cisMonth}T12:00:00`); e.setMonth(e.getMonth() + 1); e.setDate(5);
  const shift = (n: number) => { const d = new Date(`${cisMonth}T12:00:00`); d.setMonth(d.getMonth() + n); setCisMonth(d.toISOString().slice(0, 10)); };
  const by: Record<string, Row> = {};
  (cisPays || []).forEach((p) => { const k = p.user_id || (p.worker_id ? `w:${p.worker_id}` : `n:${p.name || ''}`); const b = (by[k] = by[k] || { name: p.name, key: k, utr: p.utr, gross: 0, materials: 0, cis: 0, n: 0 }); b.gross += Number(p.gross || 0); b.materials += Number(p.materials || 0); b.cis += Number(p.cis_deduction || 0); b.n++; });
  const rows = Object.values(by), tg = rows.reduce((t, r) => t + r.gross, 0), tc = rows.reduce((t, r) => t + r.cis, 0);
  return (
    <View>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Button kind="ghost" title="‹" onPress={() => shift(-1)} />
          <View style={{ flex: 1, alignItems: 'center' }}><Muted>Tax month</Muted><Text style={{ fontWeight: '800', color: base.ink }}>{fdate(cisMonth)} – {fdate(e.toISOString().slice(0, 10))}</Text></View>
          <Button kind="ghost" title="›" onPress={() => shift(1)} />
        </View>
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}><FinStat v={money(tg)} label="Paid to subcontractors" /><FinStat v={money(tc)} label="CIS deducted (to pay HMRC)" /></View>
      <SectionTitle>For the monthly CIS return</SectionTitle>
      {rows.length ? rows.map((r) => <FinRow key={r.key} title={r.name} sub={`UTR ${data.rateBy[r.key]?.utr || r.utr || 'missing'} · ${r.n} payment${r.n === 1 ? '' : 's'} · materials ${money(r.materials)} · CIS ${money(r.cis)}`} right={money(r.gross)} />) : <Empty>No subcontractor payments marked paid in this tax month.</Empty>}
      <Muted style={{ marginTop: 8 }}>When Xero is linked, the CIS return is made from Xero. Until then use these figures; the HMRC deadline is the 19th.</Muted>
      <Pressable onPress={() => router.push('/fin/directory?kind=labour' as never)} style={{ marginTop: 8 }}><Text style={{ color: base.blue }}>People &amp; rates (UTRs, CIS rates, bank details) ›</Text></Pressable>
    </View>
  );
}

export function SubsStats() {
  const { me } = useAuth();
  const { data: st } = useFinSettings(me?.org_id);
  const { data } = useSubsData(me?.org_id);
  if (!data) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
      <FinStat tone="blue" v={money(data.ops.filter((p) => p.status === 'approved').reduce((t, p) => t + Number(p.net_pay || 0), 0), 0)} label="Operative Invoices To Pay" />
      <FinStat tone="green" v={fdate(nextPayDay(st))} label="Next Pay Day" />
      <FinStat tone="red" v={String(data.sapps.filter((a) => a.status === 'received').length)} label="Applications To Certify" />
      <FinStat tone="amber" v={money(data.sapps.filter((a) => a.status === 'certified').reduce((t, a) => t + Number(a.pay_amount || 0), 0), 0)} label="Certified, To Pay" />
    </View>
  );
}
