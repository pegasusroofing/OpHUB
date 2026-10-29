// Purchases lists (9219b renderFinPurchases): purchase orders, purchase
// invoices (unallocated / with a PM / to approve / approved not paid / paid),
// plant hire and suppliers — for the company or one project (siteId).
// Inbox items are NOT read or filed automatically here while the Finance
// trial is on (no inbox processing).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { FinRow, FinSeg, FinStat } from '@/components/FinNav';
import { Cell, FinTable, FootText } from '@/components/FinTable';
import { pickJob } from '@/components/FinSales';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { askDate } from '@/components/DateField';
import * as DocumentPicker from 'expo-document-picker';
import { fdb, selectAll } from '@/data/finance';
import { supabase } from '@/lib/supabase';
import { setPinvPaid, setPinvStatus } from '@/data/finPurchase';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { PI_STATUS, poInvoiced } from '@/lib/rules/finBook';
import { fdate, jobTag, money, plantCost, round2, today } from '@/lib/rules/finance';
import { base, radius, useDesk } from '@/theme/theme';

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
        selectAll<Row>('fin_inbox', 'id,site_id,received_at,from_email,subject,extracted,stage,query_reason,comments,status,purchase_invoice_id,file_name', (q) => f(q).or('status.eq.new,and(status.eq.filed,purchase_invoice_id.is.null)')),
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
  const desk = useDesk();
  // Tick several to approve, or to mark paid (9219g finPiBulkApprove / finPiBulkPaid).
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toast = useToast();
  const qc = useQueryClient();
  const [upBusy, setUpBusy] = useState(false);
  // Add invoices by hand (9219b finInboxUpload): each PDF / photo goes into the inbox to be read or filed.
  const uploadInvoices = async () => {
    if (!me) return;
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true }); if (r.canceled) return;
    setUpBusy(true); let n = 0;
    try {
      for (const f of r.assets) {
        if ((f.size || 0) > 20 * 1024 * 1024) { toast(`${f.name} is over 20 MB — skipped.`); continue; }
        const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
        const up = await supabase.storage.from('finance-docs').upload(`${me.org_id}/inbox/${rid}-${(f.name || 'invoice').replace(/[^a-z0-9.-]+/gi, '_').slice(-80)}`, await (await fetch(f.uri)).arrayBuffer(), { contentType: f.mimeType || 'application/octet-stream' });
        if (up.error) continue;
        const ins = await fdb.from('fin_inbox').insert({ org_id: me.org_id, source: 'upload', status: 'new', received_at: new Date().toISOString(), file_path: up.data.path, file_name: f.name, content_type: f.mimeType || null, created_by: me.id } as never);
        if (!ins.error) n++;
      }
    } finally { setUpBusy(false); }
    toast(`${n} invoice${n === 1 ? '' : 's'} added`); setPif('job'); void qc.invalidateQueries({ queryKey: ['finPurchases'] });
  };
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
      {!!(sup || job) && <Pressable onPress={() => { setSup(''); setJob(''); }} style={{ justifyContent: 'center' }}><Text style={{ color: base.blue }}>Clear</Text></Pressable>}
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <FinSeg value={pof} onChange={setPof} items={[['open', 'Open'], ['invoiced', 'Invoiced'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([k, l]) => [k, l, data.pos.filter(F[k]).filter(fOK).length] as [string, string, number])} />
          <View style={{ marginLeft: 'auto' }}><Button title="+ New PO" onPress={() => void withJob('New purchase order', (sid) => `/fin/po/new?site=${sid}`)} /></View>
        </View>
        {bar}{search('Search PO, supplier or project')}
        {desk && list.length ? (
          <FinTable rows={list} keyOf={(p) => p.id} onRow={(p) => router.push(`/fin/po/${p.id}` as never)}
            cols={[
              { k: 'no', l: 'PO', render: (p: Row) => <Cell bold>{p.number}</Cell> },
              { k: 'sup', l: 'Supplier', flex: 1.3, min: 130, render: (p: Row) => <Cell>{p.supplier_name || '—'}</Cell> },
              ...(siteId ? [] : [{ k: 'p', l: 'Project', flex: 1.6, min: 160, render: (p: Row) => <Cell>{jobTag(site(p.site_id))}</Cell> }]),
              { k: 'd', l: 'Date', render: (p: Row) => <Cell>{fdate(String(p.issue_date || p.created_at || '').slice(0, 10))}</Cell> },
              { k: 'v', l: 'Value', render: (p: Row) => <Cell>{p.value != null ? money(p.value) : '—'}</Cell> },
              { k: 'i', l: 'Invoiced', render: (p: Row) => <Cell>{money(poInvoiced(p, live))}</Cell> },
              { k: 'l', l: 'Left To Invoice', render: (p: Row) => <Cell>{p.value != null ? money(Math.max(0, round2(Number(p.value) - poInvoiced(p, live)))) : '—'}</Cell> },
              { k: 's', l: 'Status', render: (p: Row) => <Text style={{ fontSize: 10.5, fontWeight: '800', color: p.status === 'open' ? '#1d4ed8' : '#6b7280', backgroundColor: p.status === 'open' ? '#EEF3FD' : '#EEF0F2', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9, overflow: 'hidden' }}>● {PO_STATUS[p.status] || p.status}</Text> },
            ]}
            foot={<><FootText bold>{list.length} shown</FootText><FootText>Value {money(list.reduce((t, p) => t + Number(p.value || 0), 0))}</FootText><FootText>Invoiced {money(list.reduce((t, p) => t + poInvoiced(p, live), 0))}</FootText></>} />
        ) : list.length ? list.map((p) => { const inv = poInvoiced(p, live), left = p.value != null ? Math.max(0, round2(Number(p.value) - inv)) : null; return (
          <FinRow key={p.id} left={p.number} title={p.supplier_name || '—'} sub={[siteId ? '' : jobTag(site(p.site_id)), fdate(String(p.issue_date || p.created_at || '').slice(0, 10)), PO_STATUS[p.status] || p.status, `invoiced ${money(inv)}`, left != null && p.status === 'open' ? `${money(left)} left` : ''].filter(Boolean).join(' · ')} right={p.value != null ? money(p.value) : 'No value'} onPress={() => router.push(`/fin/po/${p.id}` as never)} />
        ); }) : <Empty>No purchase orders here.</Empty>}
        <Muted style={{ marginTop: 8 }}>{openPos.length} open · {money(committed, 0)} ordered but not invoiced yet. Orders sent from a project&apos;s Materials tile appear here by themselves.</Muted>
      </View>
    );
  }
  if (tab === 'invoices') {
    // Not read yet (uploaded or emailed, and while Finance is on trial nothing is read) count as unallocated too, to file by hand.
    const needJob = data.inbox.filter((i) => i.stage !== 'with_pm'), withPm = data.inbox.filter((i) => i.stage === 'with_pm');
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
          <FinSeg value={cur} onChange={setPif} items={chips.map(([k, l, n]) => [k, l, n] as [string, string, number])} />
          <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 6 }}>
            <Button kind="ghost" busy={upBusy} title="+ Add invoices" onPress={() => void uploadInvoices()} />
            <Button title="+ Type one in" onPress={() => void withJob('Add a purchase invoice', (sid) => `/fin/pinv/new?site=${sid}`)} />
          </View>
        </View>
        {bar}
        {cur === 'job' || cur === 'pm' ? (
          <>
            {search('Search supplier, email or invoice no.')}
            {(cur === 'job' ? needJob : withPm).filter((it) => (!sup || supKey(it.extracted?.supplier) === sup) && (!job || it.site_id === job) && hit(it.extracted?.supplier, it.from_email, it.extracted?.invoice_no, it.subject)).map((it) => {
              const ex = it.extracted || {}, last = (it.comments || []).slice(-1)[0];
              return <FinRow key={it.id} title={ex.supplier || it.from_email || it.file_name || 'Purchase invoice'} sub={[ex.invoice_no, `received ${fdate(String(it.received_at).slice(0, 10))}`, cur === 'job' ? (!it.extracted ? 'Not read yet — open it to file by hand' : it.stage === 'pm_replied' && last ? `PM replied — ${last.name}: ${last.text}` : it.query_reason) : 'Sent to a PM'].filter(Boolean).join(' · ')} right={ex.total != null ? money(ex.total) : '—'} onPress={() => router.push(`/fin/inbox/${it.id}` as never)} />;
            })}
            {!(cur === 'job' ? needJob : withPm).length && <Empty>{cur === 'job' ? 'Nothing waiting to be allocated.' : 'Nothing with a PM.'}</Empty>}
          </>
        ) : (
          <>
            {search('Search supplier, invoice no. or project')}
            {(() => {
              const list = sortBy(data.pinvs.filter(F[cur]).filter(fOK).filter((i) => hit(i.supplier_name, i.invoice_no, jobTag(site(i.site_id)), posBy[i.po_id]?.number)), 'invoice_date', 'total');
              const bulk = cur === 'approve' || cur === 'unpaid', picked = list.filter((i) => sel.has(i.id));
              const tick = (i: Row) => <Pressable hitSlop={8} onPress={() => setSel((x) => { const n = new Set(x); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })}><Text style={{ fontSize: 18 }}>{sel.has(i.id) ? '☑' : '☐'}</Text></Pressable>;
              const refresh = () => { setSel(new Set()); ['finPurchases', 'finBook', 'finOverview', 'finPo'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
              const approveAll = async () => {
                const rows = picked.filter((i) => ['to_approve', 'query'].includes(i.status)); if (!rows.length || !me) { toast('None of those are waiting for approval.'); return; }
                const qn = rows.filter((i) => i.status === 'query').length;
                if (!(await confirmAsk(`Approve ${rows.length} purchase invoice${rows.length === 1 ? '' : 's'}?${qn ? `\n\n${qn} ${qn === 1 ? 'is' : 'are'} on query — approving clears the query.` : ''}`, 'Approve'))) return;
                let ok = 0; for (const i of rows) if ((await setPinvStatus(me, i.id, 'approved')).ok) ok++;
                toast(ok === rows.length ? `${ok} approved` : `${ok} of ${rows.length} approved`); refresh();
              };
              const paidAll = async () => {
                const d = await askDate(`Paid on which date? (${picked.length} invoice${picked.length === 1 ? '' : 's'})`); if (d == null) return;
                const date = d || today();
                const rows = picked.filter((i) => i.status === 'approved'); if (!rows.length) { toast('Only approved invoices can be marked paid.'); return; }
                let ok = 0; for (const i of rows) if (await setPinvPaid(i.id, date)) ok++;
                toast(`${ok} marked paid`); refresh();
              };
              const bulkBar = bulk && picked.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Text style={{ fontWeight: '800', color: base.ink }}>{picked.length} selected · {money(picked.reduce((t, i) => t + Number(i.total || 0), 0))}</Text>
                  {cur === 'approve' ? <Button title={`✓ Approve ${picked.length}`} onPress={() => void approveAll()} /> : <Button title={`Mark ${picked.length} paid`} onPress={() => void paidAll()} />}
                  <Pressable onPress={() => setSel(new Set())}><Text style={{ color: base.slate }}>Clear</Text></Pressable>
                </View>
              ) : bulk && list.length > 1 ? <Pressable onPress={() => setSel(new Set(list.map((i) => i.id)))} style={{ marginBottom: 8 }}><Text style={{ color: base.blue, fontWeight: '700' }}>☐ Tick all</Text></Pressable> : null;
              if (desk && list.length) return (
                <>{bulkBar}<FinTable rows={list} keyOf={(i) => i.id} onRow={(i) => router.push(`/fin/pinv/${i.id}` as never)}
                  cols={[
                    ...(bulk ? [{ k: 'tick', l: '', flex: 0.3, min: 36, render: (i: Row) => tick(i) }] : []),
                    { k: 'no', l: 'Invoice', render: (i: Row) => <Cell bold>{i.invoice_no || '—'}</Cell> },
                    { k: 'sup', l: 'Supplier', flex: 1.3, min: 130, render: (i: Row) => <Cell>{i.supplier_name || 'Supplier'}</Cell> },
                    ...(siteId ? [] : [{ k: 'p', l: 'Project', flex: 1.6, min: 160, render: (i: Row) => <Cell>{jobTag(site(i.site_id))}</Cell> }]),
                    { k: 'd', l: 'Date', render: (i: Row) => <Cell>{fdate(i.invoice_date)}</Cell> },
                    { k: 'po', l: 'PO', render: (i: Row) => posBy[i.po_id] ? <Cell>{posBy[i.po_id].number}</Cell> : <Cell tone="#D97706">No PO</Cell> },
                    { k: 'n', l: 'Net', render: (i: Row) => <Cell>{money(i.net)}</Cell> },
                    { k: 't', l: 'Total', render: (i: Row) => <Cell bold>{money(i.total)}</Cell> },
                    { k: 's', l: 'Status', render: (i: Row) => <Cell tone={i.status === 'query' ? '#C0392B' : undefined}>{i.paid_on ? 'Paid' : PI_STATUS[i.status] || i.status}</Cell> },
                  ]}
                  foot={<><FootText bold>{list.length} shown</FootText><FootText>Net {money(list.reduce((t, i) => t + Number(i.net || 0), 0))}</FootText><FootText>VAT {money(list.reduce((t, i) => t + Number(i.vat || 0), 0))}</FootText><FootText>Gross {money(list.reduce((t, i) => t + Number(i.total || 0), 0))}</FootText></>} /></>
              );
              return list.length ? (
                <>
                  {bulkBar}
                  {list.map((i) => <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{bulk && tick(i)}<View style={{ flex: 1 }}><FinRow left={i.invoice_no || '—'} title={i.supplier_name || 'Supplier'} sub={[siteId ? '' : jobTag(site(i.site_id)), fdate(i.invoice_date), `net ${money(i.net)}`, posBy[i.po_id] ? `PO ${posBy[i.po_id].number}` : 'No PO', i.paid_on ? 'Paid' : PI_STATUS[i.status] || i.status, i.query_note ? `⚠ ${i.query_note}` : ''].filter(Boolean).join(' · ')} right={money(i.total)} tone={i.status === 'query' ? '#C0392B' : undefined} onPress={() => router.push(`/fin/pinv/${i.id}` as never)} /></View></View>)}
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
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
      <FinStat tone="blue" v={String(needJob)} label="Unallocated Invoices · all time" /><FinStat tone="green" v={money(unpaid, 0)} label="To Pay Suppliers (Incl. VAT) · all time" />
      <FinStat tone="red" v={String(toApprove)} label="To Approve · all time" /><FinStat tone="amber" v={money(ordered, 0)} label="Ordered, Not Invoiced · all time" />
    </View>
  );
}
