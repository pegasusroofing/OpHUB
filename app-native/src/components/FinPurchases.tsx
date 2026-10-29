// Purchases lists (9219b renderFinPurchases): purchase orders, purchase
// invoices (unallocated / with a PM / to approve / approved not paid / paid),
// plant hire and suppliers — for the company or one project (siteId).
// Inbox items are NOT read or filed automatically here while the Finance
// trial is on (no inbox processing).
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { FinChip, FinRow, FinStat } from '@/components/FinNav';
import { pickJob } from '@/components/FinSales';
import { chooseAction } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { selectAll } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { PI_STATUS, poInvoiced } from '@/lib/rules/finBook';
import { fdate, jobTag, money, plantCost, round2 } from '@/lib/rules/finance';
import { base, radius } from '@/theme/theme';

type Row = Record<string, any>;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card };
export const PO_STATUS: Record<string, string> = { open: 'Open', invoiced: 'Invoiced', cancelled: 'Cancelled', draft: 'Draft' };

export function usePurchases(orgId: string | null | undefined, siteId?: string) {
  return useQuery({
    queryKey: ['finPurchases', orgId, siteId || ''], enabled: !!orgId,
    queryFn: async () => {
      const f = (q: Parameters<Parameters<typeof selectAll>[2]>[0]) => (siteId ? q.eq('site_id', siteId) : q.eq('org_id', orgId as string));
      const [pinvs, pos, inbox, hires, suppliers] = await Promise.all([
        selectAll<Row>('purchase_invoices', '*', f), selectAll<Row>('purchase_orders', '*', f),
        selectAll<Row>('fin_inbox', 'id,site_id,received_at,from_email,subject,extracted,stage,query_reason,comments,status,purchase_invoice_id', (q) => f(q).or('status.eq.new,and(status.eq.filed,purchase_invoice_id.is.null)')),
        selectAll<Row>('fin_plant_hires', '*', f), selectAll<Row>('suppliers', 'id,name,email', (q) => q.eq('org_id', orgId as string)),
      ]);
      return { pinvs: pinvs.sort((a, b) => String(b.invoice_date || '').localeCompare(String(a.invoice_date || ''))), pos: pos.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))), inbox, hires, suppliers };
    },
  });
}

export function PurchasesLists({ tab, siteId, f: f0 }: { tab: 'orders' | 'invoices' | 'plant' | 'suppliers'; siteId?: string; f?: string }) {
  const { me } = useAuth();
  const { data: sites = [] } = useSites();
  const { data } = usePurchases(me?.org_id, siteId);
  const [pof, setPof] = useState('open');
  const [pif, setPif] = useState<string | null>(f0 || null);
  const [sup, setSup] = useState('');
  const [job, setJob] = useState('');
  const [sort, setSort] = useState('new');
  const [q, setQ] = useState('');
  if (!data) return <Muted>Loading…</Muted>;
  const site = (id: string) => sites.find((s) => s.id === id);
  const live = data.pinvs.filter((i) => i.status !== 'rejected');
  const supKey = (n: unknown) => String(n || '').trim().toLowerCase();
  const fOK = (x: Row) => (!sup || supKey(x.supplier_name) === sup) && (!job || x.site_id === job);
  const ql = q.trim().toLowerCase();
  const hit = (...v: unknown[]) => !ql || v.join(' ').toLowerCase().includes(ql);
  const sortBy = (list: Row[], dk: string, vk: string) => list.slice().sort({ new: (a: Row, b: Row) => String(b[dk] || '').localeCompare(String(a[dk] || '')), old: (a: Row, b: Row) => String(a[dk] || '').localeCompare(String(b[dk] || '')), big: (a: Row, b: Row) => Number(b[vk] || 0) - Number(a[vk] || 0), sup: (a: Row, b: Row) => String(a.supplier_name || '').localeCompare(String(b.supplier_name || '')) }[sort]);
  const supNames: Record<string, string> = {};
  [...data.pos, ...data.pinvs, ...data.hires].forEach((x) => { const n = String(x.supplier_name || '').trim(); if (n) supNames[supKey(n)] = supNames[supKey(n)] || n; });
  const jobIds = Array.from(new Set([...data.pos, ...data.pinvs, ...data.hires].map((x) => x.site_id).filter(Boolean))) as string[];
  const bar = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
      <Pressable onPress={async () => { const k = await chooseAction('Supplier', [{ key: '*', label: 'All suppliers' }, ...Object.keys(supNames).sort().map((k2) => ({ key: k2, label: supNames[k2] }))]); if (k) setSup(k === '*' ? '' : k); }} style={box}><Text style={{ color: base.ink }}>Supplier: {sup ? supNames[sup] : 'All'} ▾</Text></Pressable>
      {!siteId && <Pressable onPress={async () => { const k = await chooseAction('Project', [{ key: '*', label: 'All projects' }, ...jobIds.map((id) => ({ key: id, label: jobTag(site(id)) }))]); if (k) setJob(k === '*' ? '' : k); }} style={box}><Text style={{ color: base.ink }}>Project: {job ? jobTag(site(job)) : 'All'} ▾</Text></Pressable>}
      <Pressable onPress={async () => { const k = await chooseAction('Sort', [['new', 'Newest first'], ['old', 'Oldest first'], ['big', 'Biggest first'], ['sup', 'Supplier A–Z']].map(([key, label]) => ({ key, label }))); if (k) setSort(k); }} style={box}><Text style={{ color: base.ink }}>Sort ▾</Text></Pressable>
      {(sup || job) && <Pressable onPress={() => { setSup(''); setJob(''); }} style={{ justifyContent: 'center' }}><Text style={{ color: base.blue }}>Clear</Text></Pressable>}
    </View>
  );
  const search = (ph: string) => <TextInput value={q} onChangeText={setQ} placeholder={ph} style={[box, { marginBottom: 10 }]} />;
  const withJob = async (title: string, path: (sid: string) => string) => { const sid = siteId || (await pickJob(title, sites.filter((s) => s.status !== 'closed'))); if (sid) router.push(path(sid) as never); };

  if (tab === 'orders') {
    const F: Record<string, (p: Row) => boolean> = { open: (p) => p.status === 'open', invoiced: (p) => p.status === 'invoiced', cancelled: (p) => p.status === 'cancelled', all: () => true };
    const list = sortBy(data.pos.filter(F[pof]).filter(fOK).filter((p) => hit(p.number, p.supplier_name, jobTag(site(p.site_id)))), 'created_at', 'value');
    const openPos = data.pos.filter((p) => p.status === 'open');
    const committed = round2(openPos.filter((p) => p.value != null).reduce((t, p) => t + Math.max(0, Number(p.value) - poInvoiced(p, live)), 0));
    return (
      <View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {[['open', 'Open'], ['invoiced', 'Invoiced'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([k, l]) => <FinChip key={k} on={pof === k} label={l} n={data.pos.filter(F[k]).filter(fOK).length} onPress={() => setPof(k)} />)}
          <View style={{ marginLeft: 'auto' }}><Button title="+ New PO" onPress={() => void withJob('New purchase order', (sid) => `/fin/po/new?site=${sid}`)} /></View>
        </View>
        {bar}{search('Search PO, supplier or project')}
        {list.length ? list.map((p) => { const inv = poInvoiced(p, live), left = p.value != null ? Math.max(0, round2(Number(p.value) - inv)) : null; return (
          <FinRow key={p.id} left={p.number} title={p.supplier_name || '—'} sub={[siteId ? '' : jobTag(site(p.site_id)), fdate(String(p.issue_date || p.created_at || '').slice(0, 10)), PO_STATUS[p.status] || p.status, `invoiced ${money(inv)}`, left != null && p.status === 'open' ? `${money(left)} left` : ''].filter(Boolean).join(' · ')} right={p.value != null ? money(p.value) : 'No value'} onPress={() => router.push(`/fin/po/${p.id}` as never)} />
        ); }) : <Empty>No purchase orders here.</Empty>}
        <Muted style={{ marginTop: 8 }}>{openPos.length} open · {money(committed, 0)} ordered but not invoiced yet. Orders sent from a project&apos;s Materials tile appear here by themselves.</Muted>
      </View>
    );
  }
  if (tab === 'invoices') {
    const needJob = data.inbox.filter((i) => i.extracted && i.stage !== 'with_pm'), withPm = data.inbox.filter((i) => i.stage === 'with_pm');
    const toApprove = data.pinvs.filter((i) => ['to_approve', 'query'].includes(i.status)), unpaid = data.pinvs.filter((i) => i.status === 'approved' && !i.paid_on);
    const F: Record<string, (i: Row) => boolean> = { approve: (i) => ['to_approve', 'query'].includes(i.status), unpaid: (i) => i.status === 'approved' && !i.paid_on, paid: (i) => !!i.paid_on, all: () => true };
    const cnt: Record<string, number> = { job: needJob.length, pm: withPm.length, approve: toApprove.length, unpaid: unpaid.length };
    const cur = pif || ['job', 'approve', 'pm', 'unpaid'].find((k) => cnt[k]) || 'all';
    const chips: [string, string, number][] = [['job', 'Unallocated', needJob.length], ['pm', 'With a PM', withPm.length], ['approve', 'To approve', toApprove.length], ['unpaid', 'Approved, not paid', unpaid.length], ['paid', 'Paid', data.pinvs.filter(F.paid).length], ['all', 'All filed', data.pinvs.length]];
    const posBy: Record<string, Row> = {}; data.pos.forEach((p) => { posBy[p.id] = p; });
    return (
      <View>
        <Muted style={{ marginBottom: 8 }}>Purchase invoices emailed to your invoice address are read and filed to the job when we can tell which one. While Finance is on trial they are not read or filed automatically — allocate them by hand.</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {chips.map(([k, l, n]) => <FinChip key={k} on={cur === k} label={l} n={n} onPress={() => setPif(k)} />)}
          <View style={{ marginLeft: 'auto' }}><Button title="+ Type one in" onPress={() => void withJob('Add a purchase invoice', (sid) => `/fin/pinv/new?site=${sid}`)} /></View>
        </View>
        {bar}
        {cur === 'job' || cur === 'pm' ? (
          <>
            {search('Search supplier, email or invoice no.')}
            {(cur === 'job' ? needJob : withPm).filter((it) => (!sup || supKey(it.extracted?.supplier) === sup) && (!job || it.site_id === job) && hit(it.extracted?.supplier, it.from_email, it.extracted?.invoice_no, it.subject)).map((it) => {
              const ex = it.extracted || {}, last = (it.comments || []).slice(-1)[0];
              return <FinRow key={it.id} title={ex.supplier || it.from_email || 'Purchase invoice'} sub={[ex.invoice_no, `received ${fdate(String(it.received_at).slice(0, 10))}`, cur === 'job' ? (it.stage === 'pm_replied' && last ? `PM replied — ${last.name}: ${last.text}` : it.query_reason) : 'Sent to a PM'].filter(Boolean).join(' · ')} right={ex.total != null ? money(ex.total) : '—'} onPress={() => router.push(`/fin/inbox/${it.id}` as never)} />;
            })}
            {!(cur === 'job' ? needJob : withPm).length && <Empty>{cur === 'job' ? 'Nothing waiting to be allocated.' : 'Nothing with a PM.'}</Empty>}
          </>
        ) : (
          <>
            {search('Search supplier, invoice no. or project')}
            {(() => {
              const list = sortBy(data.pinvs.filter(F[cur]).filter(fOK).filter((i) => hit(i.supplier_name, i.invoice_no, jobTag(site(i.site_id)), posBy[i.po_id]?.number)), 'invoice_date', 'total');
              return list.length ? (
                <>
                  {list.map((i) => <FinRow key={i.id} left={i.invoice_no || '—'} title={i.supplier_name || 'Supplier'} sub={[siteId ? '' : jobTag(site(i.site_id)), fdate(i.invoice_date), `net ${money(i.net)}`, posBy[i.po_id] ? `PO ${posBy[i.po_id].number}` : 'No PO', i.paid_on ? 'Paid' : PI_STATUS[i.status] || i.status, i.query_note ? `⚠ ${i.query_note}` : ''].filter(Boolean).join(' · ')} right={money(i.total)} tone={i.status === 'query' ? '#C0392B' : undefined} onPress={() => router.push(`/fin/pinv/${i.id}` as never)} />)}
                  {list.length > 1 && <Muted>Total ({list.length}): net {money(list.reduce((t, i) => t + Number(i.net || 0), 0))} · VAT {money(list.reduce((t, i) => t + Number(i.vat || 0), 0))} · gross {money(list.reduce((t, i) => t + Number(i.total || 0), 0))}</Muted>}
                </>
              ) : <Empty>Nothing here.</Empty>;
            })()}
          </>
        )}
      </View>
    );
  }
  if (tab === 'plant') {
    const list = sortBy(data.hires.filter(fOK).filter((h) => hit(h.item, h.supplier_name, jobTag(site(h.site_id)))), 'on_hire', 'rate');
    const onHire = data.hires.filter((h) => !h.off_hire);
    return (
      <View>
        <View style={{ flexDirection: 'row', marginBottom: 8 }}><View style={{ marginLeft: 'auto' }}><Button title="+ Plant hire" onPress={() => void withJob('Add plant hire', (sid) => `/fin/plant/new?site=${sid}`)} /></View></View>
        {bar}{search('Search item, supplier or project')}
        {list.length ? list.map((h) => { const c = plantCost(h as never), long = !h.off_hire && c.days > 28; return (
          <FinRow key={h.id} title={h.item} sub={[h.supplier_name, siteId ? '' : jobTag(site(h.site_id)), `on ${fdate(h.on_hire)}`, h.off_hire ? `off ${fdate(h.off_hire)}` : `on hire ${c.weeks} wk${long ? ' — over 4 weeks' : ''}`].filter(Boolean).join(' · ')} right={money(c.cost)} tone={long ? '#D98A00' : undefined} onPress={() => router.push(`/fin/plant/${h.id}` as never)} />
        ); }) : <Empty>No plant hire.</Empty>}
        <Muted style={{ marginTop: 8 }}>{onHire.length} on hire · {money(onHire.reduce((t, h) => t + plantCost(h as never).cost, 0), 0)} so far. Tap one to off-hire it.</Muted>
      </View>
    );
  }
  const by: Record<string, { name: string; email: string; spend: number; owed: number; n: number }> = {};
  data.suppliers.forEach((s) => { by[s.name] = { name: s.name, email: s.email || '', spend: 0, owed: 0, n: 0 }; });
  live.forEach((i) => { const k = i.supplier_name || 'Unknown', r = (by[k] = by[k] || { name: k, email: '', spend: 0, owed: 0, n: 0 }); r.n++; if (i.status === 'approved') r.spend += Number(i.net || 0); if (i.status === 'approved' && !i.paid_on) r.owed += Number(i.total || 0); });
  const list = Object.values(by).sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name)).filter((r) => hit(r.name, r.email));
  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: 8 }}><View style={{ marginLeft: 'auto' }}><Button kind="ghost" title="Edit suppliers (Directory)" onPress={() => router.push('/fin/directory?kind=supplier' as never)} /></View></View>
      {search('Search suppliers')}
      {list.length ? list.map((r) => <FinRow key={r.name} title={r.name} sub={[r.email, `${r.n} invoice${r.n === 1 ? '' : 's'}`, `spent ${money(r.spend, 0)} net`].filter(Boolean).join(' · ')} right={r.owed ? `${money(r.owed, 0)} to pay` : '—'} />) : <Empty>No suppliers yet.</Empty>}
    </View>
  );
}

export function PurchasesStats() {
  const { me } = useAuth();
  const { data } = usePurchases(me?.org_id);
  if (!data) return null;
  const live = data.pinvs.filter((i) => i.status !== 'rejected');
  const needJob = data.inbox.filter((i) => i.extracted && i.stage !== 'with_pm').length;
  const unpaid = data.pinvs.filter((i) => i.status === 'approved' && !i.paid_on).reduce((t, i) => t + Number(i.total || 0), 0);
  const toApprove = data.pinvs.filter((i) => ['to_approve', 'query'].includes(i.status)).length;
  const ordered = round2(data.pos.filter((p) => p.status === 'open' && p.value != null).reduce((t, p) => t + Math.max(0, Number(p.value) - poInvoiced(p, live)), 0));
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      <FinStat v={String(needJob)} label="Unallocated invoices" /><FinStat v={money(unpaid, 0)} label="To pay suppliers (incl. VAT)" />
      <FinStat v={String(toApprove)} label="To approve" /><FinStat v={money(ordered, 0)} label="Ordered, not invoiced" />
    </View>
  );
}
