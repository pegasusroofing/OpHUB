// Purchases lists (9219b renderFinPurchases): purchase orders, purchase
// invoices (unallocated / with a PM / needs checking / to pay / all filed; paid shows in Status),
// plant hire and suppliers — for the company or one project (siteId).
// Inbox items are NOT read or filed automatically here while the Finance
// trial is on (no inbox processing).
import { nameOf, usePeople } from '@/data/hs';
import { readNewInvoices } from '@/data/invoiceRead';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { inPeriod, useStatPeriods } from '@/lib/useStatPeriods';
import { Pressable, Text, TextInput, View } from 'react-native';

import { FinFilterBar, ThinExportBar, type FilterPart, type FilterSel } from '@/components/FinFilterBar';
import { exportTableExcel, exportTablePdf, type TCol } from '@/lib/tableExport';
import { FinRow, FinStat, FinTabs } from '@/components/FinNav';
import { Cell, FinChoicePop, FinInfoPop, FinTable, FootPick } from '@/components/FinTable';
import { SelectBox } from '@/components/SelectBox';
import { TypePick } from '@/components/TypePick';
import { pickJob } from '@/components/FinSales';
import { SubRight } from '@/components/FinSlot';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { askDate } from '@/components/DateField';
import { fdb, selectAll, useFinSettings } from '@/data/finance';
import { piLabel, setPinvPaid, setPinvStatus, tellPmOfPi } from '@/data/finPurchase';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { setPendingAct } from '@/lib/pendingAct';
import { COST_CATS, PI_STATUS, poInvoiced } from '@/lib/rules/finBook';
import { fdate, FIN_TRIAL_MSG, finBlocked, jobTag, money, plantCost, round2, today, vatList } from '@/lib/rules/finance';
import { monthLabel, monthOf, monthsIn, valueTest } from '@/lib/rules/finFilters';
import { base, radius, useDesk } from '@/theme/theme';

type Row = Record<string, any>;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card };
/** Why an invoice is waiting, in plain words: the reader's own error messages aren't for the office. */
const plainReason = (r: unknown) => { const t = String(r || ''); return /^couldn.t read it/i.test(t) ? 'Couldn’t be read — open it to file by hand' : t; };
/** The actions at the end of a row (Andy, 6 Nov 2026): the same keyboard drop-down as the Status column (type, arrows,
 *  Tab / Enter, or click); a click in it doesn't open the row. */
function ActionsCell({ items }: { items: { key: string; label: string; run: () => void | Promise<void> }[] }) {
  return (
    <View onStartShouldSetResponder={() => true} onResponderTerminationRequest={() => false} {...({ onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() } as object)} style={{ width: 100, alignSelf: 'center' }}>
      <TypePick label="Actions" value="" placeholder="Actions" options={items.map((x) => ({ v: x.key, label: x.label }))} listWidth={190}
        onChange={(v) => { const it = items.find((x) => x.key === v); if (it) void it.run(); }}
        style={{ borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, fontSize: 13, color: base.ink }} />
    </View>
  );
}
/** How long ago, in short: Just now, 5h ago, 3d ago. */
function ageOf(ts: string) { const h = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 36e5)); return h < 1 ? 'Just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`; }
/** An invoice waiting to be filed (Andy, 3 Nov 2026): its number, status and age; Total, VAT and the project as chips
 *  (tap the project to choose it); then supplier, dates, why it's waiting and where it came from. */
function InboxRow({ it, pm, why, job, onJob, onPm }: { it: Row; pm: boolean; why: string; job: string; onJob: () => void; onPm: () => void }) {
  const ex = it.extracted || {};
  const ago = ageOf(it.received_at);
  const chip = (label: string, v: string, onPress?: () => void, warn?: boolean) => (
    <Pressable key={label || v} onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', gap: 4, alignItems: 'center', borderWidth: 1, borderColor: warn ? '#f8e7c2' : '#e5e7eb', backgroundColor: warn ? '#fffaf0' : '#fff', borderRadius: 7, paddingHorizontal: 9, height: 28 }}>
      {!!label && <Text style={{ fontSize: 12, color: '#6b7280' }}>{label}</Text>}<Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '600', color: warn ? '#b45309' : '#111827', maxWidth: 220 }}>{v}</Text>
    </Pressable>
  );
  const meta = [it.supplier_override || ex.supplier || it.from_email || '', ex.date ? `Issued ${fdate(ex.date)}` : '', ex.due ? `Due ${fdate(ex.due)}` : '', why, it.from_email && (it.supplier_override || ex.supplier) ? it.from_email : ''].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={() => router.push(`/fin/inbox/${it.id}` as never)} style={({ pressed }) => ({ backgroundColor: pressed ? '#f9fafb' : base.card, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' }}>{ex.invoice_no || it.file_name || 'Purchase invoice'}</Text>
        <Text style={{ fontSize: 11.5, fontWeight: '600', color: pm ? '#1d4ed8' : '#b45309', backgroundColor: pm ? '#f3f7ff' : '#fffaf0', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' }}>{pm ? 'With A PM' : 'Received'}</Text>
        <Text style={{ fontSize: 12, color: '#6b7280' }}>{ago}</Text>
        <Text style={{ fontSize: 14, color: '#9ca3af' }}>›</Text>
      </View>
      {Array.isArray(ex.lines) && ex.lines.length > 0 && (
        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#f0f1f3', paddingTop: 6, gap: 2 }}>
          {(ex.lines as Row[]).slice(0, 4).map((l, k) => (
            <View key={k} style={{ flexDirection: 'row', gap: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 12.5, color: '#111827' }}>{l.description || 'Line'}</Text>
              <Text style={{ fontSize: 12.5, color: '#6b7280' }}>{l.qty != null ? `${l.qty} × ` : ''}{l.unit_price != null ? money(Number(l.unit_price)) : ''}</Text>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#111827', minWidth: 72, textAlign: 'right' }}>{money(l.amount != null ? Number(l.amount) : Number(l.qty || 0) * Number(l.unit_price || 0))}</Text>
            </View>
          ))}
          {ex.lines.length > 4 && <Text style={{ fontSize: 12, color: '#6b7280' }}>+ {ex.lines.length - 4} more line{ex.lines.length - 4 === 1 ? '' : 's'}</Text>}
        </View>
      )}
      {!!meta && <Text numberOfLines={2} style={{ fontSize: 12.5, color: '#6b7280', marginTop: 8 }}>{meta}</Text>}
      {/* Total, VAT, the job and the PM at the bottom of the box (Andy, 7 Nov 2026). */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {chip('Total', ex.total != null ? money(ex.total) : '—')}
        {chip('VAT', ex.vat != null ? money(ex.vat) : '—')}
        {chip('', job || 'Select Project ▾', onJob, !job)}
        {chip('', pm ? 'With A PM ▾' : 'Assign To PM ▾', onPm)}
      </View>
    </Pressable>
  );
}
export const PO_STATUS: Record<string, string> = { open: 'Open', invoiced: 'Invoiced', cancelled: 'Cancelled', draft: 'Draft' };

export function usePurchases(orgId: string | null | undefined, siteId?: string) {
  return useQuery({
    queryKey: ['finPurchases', orgId, siteId || ''], enabled: !!orgId,
    queryFn: async () => {
      const f = (q: Parameters<Parameters<typeof selectAll>[2]>[0]) => (siteId ? q.eq('site_id', siteId) : q.eq('org_id', orgId as string));
      const [pinvs, pos, inbox, hires, suppliers, stmts] = await Promise.all([
        selectAll<Row>('purchase_invoices', '*', f), selectAll<Row>('purchase_orders', '*', f),
        selectAll<Row>('fin_inbox', 'id,site_id,received_at,from_email,subject,extracted,stage,query_reason,comments,status,purchase_invoice_id,file_name,assigned_pm,supplier_override', (q) => f(q).or('status.eq.new,and(status.eq.filed,purchase_invoice_id.is.null)')),
        selectAll<Row>('fin_plant_hires', '*', f), selectAll<Row>('suppliers', 'id,name,email', (q) => q.eq('org_id', orgId as string)),
        selectAll<Row>('fin_statements', 'id,status,statement_date,reconciled_at,lines', (q) => q.eq('org_id', orgId as string)),
      ]);
      // Paid when the supplier's statement it is on has been reconciled (Andy, 5 Nov 2026): no need to mark each one paid.
      const onStmt: Record<string, string> = {};
      // A line counts once it's allocated (ticked on the statement), or the whole statement is reconciled.
      stmts.forEach((st) => ((st.lines as Row[] | null) || []).forEach((l) => { if (l.match && !l.ignore && !String(l.match).startsWith('in:') && (l.allocated || st.status === 'reconciled')) onStmt[l.match] = String(st.statement_date || String(st.reconciled_at || '').slice(0, 10)); }));
      pinvs.forEach((p) => { if (!p.paid_on && onStmt[p.id]) p.stmt_paid = onStmt[p.id]; });
      return { pinvs: pinvs.sort((a, b) => String(b.invoice_date || '').localeCompare(String(a.invoice_date || ''))), pos: pos.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))), inbox, hires, suppliers };
    },
  });
}

/** Paid by hand, or on a supplier statement that has been reconciled (Andy, 5 Nov 2026). */
const isPaid = (i: Row) => !!i.paid_on || !!i.stmt_paid;
/** The Status words (Andy, 5 Nov 2026): Needs Checking, Query, Approved (Auto when it approved itself), Paid. */
const piWord = (i: Row) => (isPaid(i) ? (i.paid_on ? 'Paid' : 'Paid (Statement)') : i.status === 'to_approve' ? 'Needs Checking' : i.status === 'approved' && i.auto_approved ? 'Approved (Auto)' : PI_STATUS[i.status] || i.status);
const piTone = (i: Row) => (isPaid(i) ? '#1E7A43' : i.status === 'query' ? '#C0392B' : i.status === 'to_approve' ? '#B35A00' : undefined);
/** + New PO in the Purchases tab row (Andy, 5 Nov 2026): pick the project, then the new PO. */
export function NewPoButton() {
  return <Button small title="+ New PO" onPress={() => router.push('/fin/po/new' as never)} />;
}
// Put on hire from Projects (Andy, 8 Nov 2026): no rate yet, so Finance is told to add it.
const noRate = (h: Row) => !Number(h.rate) && h.cost_from !== 'invoices';
export function PurchasesLists({ tab, siteId, f: f0 }: { tab: 'orders' | 'invoices' | 'plant' | 'suppliers' | 'all'; siteId?: string; f?: string }) {
  const { me, org } = useAuth();
  const { data: sites = [] } = useSites();
  const { data } = usePurchases(me?.org_id, siteId);
  // Filter: status, supplier, project and month, tick as many as you like. Purchase invoices keep one view at a time, as each shows a different list.
  const desk = useDesk();
  const [sel, setFilt] = useState<FilterSel>({ status: tab === 'orders' ? (desk ? [] : ['open']) : tab === 'invoices' && f0 ? [f0] : [], sup: [], job: [], mon: [] });
  const [sort, setSort] = useState('new');
  const [val, setVal] = useState('');
  const [q, setQ] = useState('');
  const [monAt, setMonAt] = useState<{ x: number; y: number } | null>(null);
  const [info, setInfo] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null); // the bubble by a PO's ✓ / ✕
  const [pmF, setPmF] = useState(''); // With A PM: just one PM's (Andy, 6 Nov 2026)
  const { data: asked } = useQuery({ queryKey: ['finPiAskedAll', me?.org_id], enabled: !!me && tab === 'invoices', queryFn: async () => {
    const m = ((await fdb.from('messages').select('related_id,recipient_id,created_at').eq('kind', 'pi_query').order('created_at', { ascending: false }).limit(2000)).data as Row[] | null) ?? [];
    const by: Record<string, string> = {}; m.forEach((x) => { if (x.related_id && !by[x.related_id]) by[x.related_id] = x.recipient_id; }); return by;
  } });
  const { data: everyone } = usePeople(); // who an expense receipt is for (7 Nov 2026)
  const { data: pmPeople = [] } = useQuery({ queryKey: ['finPmPeople', me?.org_id], enabled: !!me && tab === 'invoices', queryFn: async () => ((await fdb.from('profiles').select('id,name,role').eq('org_id', me?.org_id as string).in('role', ['pm', 'admin']).order('name')).data as Row[] | null) ?? [] }); // the laptop's "All months" picker on the totals bar
  const { data: grn = {} } = useQuery({
    queryKey: ['finPoGrn', me?.org_id], enabled: !!me && tab === 'invoices',
    queryFn: async () => {
      const pos = await selectAll<Row>('purchase_orders', 'id,material_ids', (q) => q.eq('org_id', me?.org_id as string));
      const ids = [...new Set(pos.flatMap((p) => (p.material_ids as string[] | null) || []))];
      const mats: Record<string, Row> = {};
      for (let k = 0; k < ids.length; k += 150) ((await fdb.from('materials').select('id,grn').in('id', ids.slice(k, k + 150))).data as Row[] | null)?.forEach((m) => { mats[m.id] = m; });
      const next: Record<string, string> = {};
      pos.forEach((p) => {
        const ms = ((p.material_ids as string[] | null) || []).map((id) => mats[id]).filter(Boolean);
        next[p.id] = !ms.length ? 'na' : ms.some((m) => m.grn && m.grn.ok === false) ? 'problem' : ms.every((m) => m.grn) ? 'all' : ms.some((m) => m.grn) ? 'some' : 'none';
      });
      return next;
    },
  });
  // Tick several to approve, or to mark paid (9219g finPiBulkApprove / finPiBulkPaid).
  const [picks, setSel] = useState<Set<string>>(new Set());
  const { data: fset } = useFinSettings(me?.org_id);
  const toast = useToast();
  const qc = useQueryClient();
  // Anything new goes through the reader when this list opens, and after an upload.
  const runReader = async () => {
    if (!me) return;
    const r = await readNewInvoices(me);
    if (r.read || r.filed) { toast(`${r.read} invoice${r.read === 1 ? '' : 's'} read, ${r.filed} filed by itself`); ['finPurchases', 'finBook', 'finOverview'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); }
  };
  useEffect(() => { if (tab === 'invoices') void runReader(); }, [tab, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Add invoices by hand (9219b finInboxUpload): each PDF / photo goes into the inbox to be read or filed.
  if (!data) return <Muted>Loading…</Muted>;
  const site = (id: string) => sites.find((s) => s.id === id);
  const live = data.pinvs.filter((i) => i.status !== 'rejected');
  const supKey = (n: unknown) => String(n || '').trim().toLowerCase();
  const mOf = (x: Row) => monthOf(x.invoice_date || x.on_hire || x.created_at), vt = valueTest(val);
  const fOK = (x: Row) => (!sel.sup.length || sel.sup.includes(supKey(x.supplier_name))) && (!sel.job.length || sel.job.includes(x.site_id)) && (!sel.mon.length || sel.mon.includes(mOf(x))) && (!vt || vt(Number(x.total ?? x.value ?? x.rate ?? 0)));
  const ql = q.trim().toLowerCase();
  const hit = (...v: unknown[]) => !ql || v.join(' ').toLowerCase().includes(ql);
  const sortBy = (list: Row[], dk: string, vk: string) => list.slice().sort({ new: (a: Row, b: Row) => String(b[dk] || '').localeCompare(String(a[dk] || '')), old: (a: Row, b: Row) => String(a[dk] || '').localeCompare(String(b[dk] || '')), big: (a: Row, b: Row) => Number(b[vk] || 0) - Number(a[vk] || 0), sup: (a: Row, b: Row) => String(a.supplier_name || '').localeCompare(String(b.supplier_name || '')) }[sort]);
  const supNames: Record<string, string> = {};
  [...data.pos, ...data.pinvs, ...data.hires].forEach((x) => { const n = String(x.supplier_name || '').trim(); if (n) supNames[supKey(n)] = supNames[supKey(n)] || n; });
  const jobIds = Array.from(new Set([...data.pos, ...data.pinvs, ...data.hires].map((x) => x.site_id).filter(Boolean))) as string[];
  const commonParts: FilterPart[] = [
    { key: 'sup', label: 'Supplier', items: Object.keys(supNames).sort().map((k) => ({ v: k, l: supNames[k] })) },
    ...(siteId ? [] : [{ key: 'job', label: 'Project', items: jobIds.map((id) => ({ v: id, l: jobTag(site(id)) })) }]),
    { key: 'mon', label: 'Month', items: monthsIn([...data.pos, ...data.pinvs, ...data.hires], mOf).map((m) => ({ v: m, l: monthLabel(m) })) },
  ];
  // Laptop: the current app's "All months" picker on the totals bar (9219b; cmp-fin 5 Nov 2026).
  const allMonths = monthsIn([...data.pos, ...data.pinvs, ...data.hires], mOf);
  const monthPick = siteId ? undefined : (
    <>
      <FootPick label={sel.mon[0] ? monthLabel(sel.mon[0]) : 'All months'} onPress={(x, y) => setMonAt({ x, y })} />
      <FinChoicePop at={monAt} value={sel.mon[0] || ''} options={[['', 'All months'], ...allMonths.map((m) => [m, monthLabel(m)] as [string, string])]} onPick={(m) => setFilt({ ...sel, mon: m ? [m] : [] })} onClose={() => setMonAt(null)} />
    </>
  );
  const bar = (ph: string, parts: FilterPart[] = [], cur?: FilterSel) => desk ? (() => {
    const show = parts.find((p) => p.single);
    // Lists drawn as cards have no headings to search by, so they keep a slim search box.
    const cards = tab === 'plant' || (tab === 'invoices' && ['job', 'pm'].includes(String((cur || sel).status[0] || '')));
    const on = (cur || sel).status[0];
    return (
      <>
        {/* Underlined tabs like the Overview / Sales / Purchases row above (Andy, 5 Nov 2026), not chips. */}
        {!!show && <FinTabs items={show.items.map((it) => [it.v, it.l, it.n ?? undefined] as [string, string, number?])} value={String(on || '')} onChange={(v) => setFilt({ ...sel, status: [v] })} />}
        {cards && <TextInput value={q} onChangeText={setQ} placeholder={ph} style={[box, { minWidth: 220, maxWidth: 360, marginBottom: 10, paddingVertical: 6, fontSize: 13 }]} />}
      </>
    );
  })() : (
    <FinFilterBar search={{ value: q, onChange: setQ, placeholder: ph }} parts={[...parts, ...commonParts]} sel={cur || sel} onChange={setFilt} moreOn={!!val}
      onClear={() => { setFilt({ status: tab === 'invoices' ? ['all'] : [], sup: [], job: [], mon: [] }); setVal(''); }}
      sorts={[['new', 'Newest first'], ['old', 'Oldest first'], ['big', 'Biggest first'], ['sup', 'Supplier A to Z']]} sort={sort} onSort={setSort}
      more={<TextInput value={val} onChangeText={setVal} placeholder="Value e.g. >1k" style={[box, { fontSize: 16, marginBottom: 0 }, val && !vt ? { borderColor: '#C0392B' } : null]} />} />
  );
  // Send an unallocated invoice to a PM to book (as on the invoice itself). Off while Finance is on trial.
  const assignPm = async (it: Row) => {
    if (!me) return;
    if (finBlocked('wage-push', undefined, me.org_id)) { toast(FIN_TRIAL_MSG); return; }
    const pms = ((await fdb.from('profiles').select('id,name,role,finance_only').eq('org_id', me.org_id as string).in('role', ['pm', 'admin'])).data as { id: string; name: string; finance_only?: boolean }[] | null ?? []).filter((x) => !x.finance_only);
    const k = await chooseAction('Which PM?', pms.map((x) => ({ key: x.id, label: `${x.id === it.assigned_pm ? '✓ ' : ''}${x.name}` }))); if (!k) return;
    const ok = await fdb.from('fin_inbox').update({ stage: 'with_pm', assigned_pm: k, assigned_at: new Date().toISOString() } as never).eq('id', it.id).select('id');
    toast(ok.data?.length ? `Sent to ${pms.find((x) => x.id === k)?.name}` : 'Not sent. Try again.'); void qc.invalidateQueries({ queryKey: ['finPurchases'] });
  };
  // Export To Excel / Export To PDF at the foot of each list (Andy, 6 Nov 2026), as on the job pages.
  const exportBar = (title: string, cols: TCol[], rows: (string | number | null | undefined)[][]) => {
    if (!rows.length) return null;
    const t = { title, sub: siteId ? jobTag(site(siteId)) : '', site: siteId ? site(siteId)?.name || '' : '', cols, rows };
    return (
      <View style={{ marginTop: 10, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: base.line }}>
        <ThinExportBar onExcel={() => void exportTableExcel(t, org ?? null)} onPdf={async () => { if (!(await exportTablePdf(t, org ?? null).catch(() => false))) toast('Could not build the PDF.'); }} />
      </View>
    );
  };
  const withJob = async (title: string, path: (sid: string) => string) => { const sid = siteId || (await pickJob(title, sites.filter((s) => s.status !== 'closed'))); if (sid) router.push(path(sid) as never); };

  if (tab === 'orders') {
    const F: Record<string, (p: Row) => boolean> = { draft: (p) => p.status === 'open' && !!p.is_draft, open: (p) => p.status === 'open' && !p.is_draft, invoiced: (p) => p.status === 'invoiced', cancelled: (p) => p.status === 'cancelled', all: () => true };
    const list = sortBy(data.pos.filter((p) => !sel.status.length || sel.status.some((k) => F[k](p))).filter(fOK).filter((p) => hit(p.number, p.supplier_name, jobTag(site(p.site_id)))), 'created_at', 'value');
    const openPos = data.pos.filter((p) => p.status === 'open' && !p.is_draft);
    const committed = round2(openPos.filter((p) => p.value != null).reduce((t, p) => t + Math.max(0, Number(p.value) - poInvoiced(p, live)), 0));
    return (
      <View>
        {!!siteId && <View style={desk ? { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 } : { marginBottom: 10 }}><Button title="+ New PO" onPress={() => void withJob('New purchase order', (sid) => `/fin/po/new?site=${sid}`)} /></View>}
        {bar('Search PO, supplier or project', [{ key: 'status', label: 'Status', items: [['open', 'Open'], ['invoiced', 'Invoiced'], ['cancelled', 'Cancelled']].map(([v, l]) => ({ v, l, n: data.pos.filter(F[v]).filter(fOK).length })) }])}
        {desk && list.length ? (
          <FinTable startFilter={{ s: ['Open'] }} rows={list} keyOf={(p) => p.id} onRow={(p) => router.push(`/fin/po/${p.id}` as never)}
            cols={[
              { k: 'no', l: 'PO', render: (p: Row) => <Cell bold>{p.number}</Cell> },
              { k: 'sup', l: 'Supplier', flex: 1.3, min: 130, render: (p: Row) => <Cell>{p.supplier_name || '—'}</Cell> },
              ...(siteId ? [] : [{ k: 'p', l: 'Project', flex: 1.6, min: 160, render: (p: Row) => <Cell>{jobTag(site(p.site_id))}</Cell> }]),
              { k: 'd', l: 'Date', sort: (p: Row) => String(p.issue_date || p.created_at || ''), render: (p: Row) => <Cell>{fdate(String(p.issue_date || p.created_at || '').slice(0, 10))}</Cell> },
              { k: 'v', l: 'Value', total: (l: Row[]) => money(l.reduce((t, p) => t + Number(p.value || 0), 0)), render: (p: Row) => <Cell>{p.value != null ? money(p.value) : '—'}</Cell> },
              { k: 'i', l: 'Invoiced', total: (l: Row[]) => money(l.reduce((t, p) => t + poInvoiced(p, live), 0)), render: (p: Row) => <Cell>{money(poInvoiced(p, live))}</Cell> },
              { k: 'l', l: 'Left To Invoice', total: (l: Row[]) => money(l.reduce((t, p) => t + (p.value != null ? Math.max(0, round2(Number(p.value) - poInvoiced(p, live))) : 0), 0)), render: (p: Row) => <Cell>{p.value != null ? money(Math.max(0, round2(Number(p.value) - poInvoiced(p, live)))) : '—'}</Cell> },
              { k: 's', l: 'Status', noSort: true, choices: ['Open', 'Invoiced', 'Cancelled', 'Draft'], render: (p: Row) => <Text style={{ fontSize: 10.5, fontWeight: '600', color: p.status === 'open' ? '#1d4ed8' : '#6b7280', backgroundColor: p.status === 'open' ? '#EEF3FD' : '#EEF0F2', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9, overflow: 'hidden' }}>● {p.is_draft && p.status === 'open' ? 'Draft' : PO_STATUS[p.status] || p.status}</Text> },
            ]}
            footLabel={(list) => `${list.length} shown`} footRight={monthPick} />
        ) : list.length ? list.map((p) => { const inv = poInvoiced(p, live), left = p.value != null ? Math.max(0, round2(Number(p.value) - inv)) : null; return (
          <FinRow compact key={p.id} left={p.number} title={p.supplier_name || '—'} sub={[siteId ? '' : jobTag(site(p.site_id)), fdate(String(p.issue_date || p.created_at || '').slice(0, 10)), p.is_draft && p.status === 'open' ? 'Draft' : PO_STATUS[p.status] || p.status, `invoiced ${money(inv)}`, left != null && p.status === 'open' ? `${money(left)} left` : ''].filter(Boolean).join(' · ')} right={p.value != null ? money(p.value) : 'No value'} onPress={() => router.push(`/fin/po/${p.id}` as never)} />
        ); }) : <Empty>No purchase orders here.</Empty>}
        {desk && exportBar('Purchase orders', [{ l: 'PO', w: 80 }, { l: 'Supplier', w: 140 }, { l: 'Project', w: 160 }, { l: 'Date', w: 70 }, { l: 'Value £', w: 75, money: true }, { l: 'Invoiced £', w: 75, money: true }, { l: 'Status', w: 70 }],
          list.map((p) => [p.number, p.supplier_name || '', jobTag(site(p.site_id)), fdate(String(p.issue_date || p.created_at || '').slice(0, 10)), p.value != null ? round2(Number(p.value)) : '', round2(poInvoiced(p, live)), p.is_draft && p.status === 'open' ? 'Draft' : PO_STATUS[p.status] || p.status]))}
        <Muted style={{ marginTop: 10 }}>{openPos.length} open · {money(committed, 0)} ordered but not invoiced yet. Orders sent from a project&apos;s Materials tile appear here by themselves.</Muted>
      </View>
    );
  }
  if (tab === 'invoices') {
    const askedOf = asked ?? {};
    // Not read yet (uploaded or emailed, and while Finance is on trial nothing is read) count as unallocated too, to file by hand.
    const needJob = data.inbox.filter((i) => i.stage !== 'with_pm'), withPm = data.inbox.filter((i) => i.stage === 'with_pm');
    // The tabs follow the steps on each invoice (Andy, 6 Nov 2026): Received (no job yet), With A PM (to allocate, or
    // queried), Needs Checking, Approved (paid ones stay here: their status changes to Paid once on a statement).
    const withSomeone = (i: Row) => i.status === 'query' && (!!askedOf[i.id] || (Array.isArray(i.query_thread) && i.query_thread.length > 0) || /^Queried with the supplier/.test(String(i.query_note || '')));
    const F: Record<string, (i: Row) => boolean> = { pm: withSomeone, approve: (i) => i.status === 'to_approve' || (i.status === 'query' && !withSomeone(i)), unpaid: (i) => i.status === 'approved', all: () => true };
    const cnt: Record<string, number> = { job: needJob.length, pm: withPm.length + data.pinvs.filter(F.pm).length, approve: data.pinvs.filter(F.approve).length, unpaid: data.pinvs.filter(F.unpaid).length };
    const cur = (sel.status[0] === 'paid' ? 'unpaid' : sel.status[0]) || ['job', 'approve', 'pm', 'unpaid'].find((k) => cnt[k]) || 'all';
    const chips: [string, string, number][] = [['job', 'Received', cnt.job], ['pm', 'With A PM', cnt.pm], ['approve', 'Needs Checking', cnt.approve], ['unpaid', 'Approved', cnt.unpaid], ['all', 'All', data.pinvs.length]];
    const posBy: Record<string, Row> = {}; data.pos.forEach((p) => { posBy[p.id] = p; });
    // The PO with a ✓ (matches, received) or ✕ (differs, not received, a delivery problem); tap for why (Andy, 6 Nov 2026).
    const poCell = (i: Row) => {
      const po = posBy[i.po_id];
      if (!po) return <Cell>No PO</Cell>;
      const g = grn[po.id], bad = !!i.match_notes || g === 'none' || g === 'some' || g === 'problem';
      const why = [
        i.match_notes ? String(i.match_notes) : i.lines?.length ? `Every line matches ${po.number}.` : `Linked to ${po.number}.`,
        g === 'all' ? 'Everything on it has been received.' : g === 'some' ? 'Only part of it has been marked received.' : g === 'none' ? 'Nothing on it has been marked received yet.' : g === 'problem' ? 'A delivery on it was marked with a problem.' : '',
        Array.isArray(i.split) && i.split.length > 1 ? `Split across ${i.split.length} projects.` : '',
      ].filter(Boolean);
      return (
        <Pressable accessibilityRole="button" accessibilityLabel={`${po.number} ${bad ? 'doesn’t match' : 'matches'}`} onPress={(e) => { const n = e.nativeEvent as unknown as { pageX: number; pageY: number }; setInfo({ x: n.pageX, y: n.pageY, title: `${po.number}: ${bad ? 'check this' : 'all good'}`, lines: why }); }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Text style={{ fontSize: 13, color: base.ink }}>{po.number}</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: bad ? '#C0392B' : '#1E7A3C' }}>{bad ? '✕' : '✓'}</Text>
        </Pressable>
      );
    };
    return (
      <View>
        <Muted style={{ marginBottom: 10, fontSize: 12.5 }}>Each invoice goes Received → With A PM (if needed) → Needs Checking → Approved, then shows Paid once it’s on a statement. Ones typed in by hand go straight to Approved.</Muted>
        <View style={{ flexDirection: desk ? 'row' : 'column-reverse', alignItems: desk ? 'flex-start' : 'stretch', gap: desk ? 12 : 0 }}>
          <View style={{ flex: desk ? 1 : undefined, minWidth: 0 }}>{bar(cur === 'job' || cur === 'pm' ? 'Search supplier, email or invoice no.' : 'Search supplier, invoice no. or project', [{ key: 'status', label: 'Show', single: true, items: chips.map(([v, l, n]) => ({ v, l, n })) }], { ...sel, status: [cur] })}</View>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            {/* One Add Invoices page: upload one or many, or type one in (Andy, 7 Nov 2026). */}
            <View style={{ flex: desk ? undefined : 1 }}><Button small={desk} grow={!desk} title="Add Invoices" onPress={() => router.push((siteId ? `/fin/pinv/add?site=${siteId}` : '/fin/pinv/add') as never)} /></View>
          </View>
        </View>
        {cur === 'pm' && (
          <View style={{ width: 220, marginBottom: 8 }}>
            <SelectBox compact title="Which PM?" value={pmF} options={[['', 'PM: All'], ...pmPeople.map((p) => [p.id, p.name] as [string, string])]} onChange={setPmF} style={{ marginBottom: 0 }} />
          </View>
        )}
        <FinInfoPop at={info} title={info?.title || ''} lines={info?.lines || []} onClose={() => setInfo(null)} />
        {cur === 'job' || (cur === 'pm' && withPm.length > 0) ? (
          <>
            {(() => {
              const items = (cur === 'job' ? needJob : withPm).filter((it) => (!sel.sup.length || sel.sup.includes(supKey(it.extracted?.supplier))) && (!sel.job.length || sel.job.includes(it.site_id)) && (cur !== 'pm' || !pmF || it.assigned_pm === pmF) && hit(it.extracted?.supplier, it.from_email, it.extracted?.invoice_no, it.subject));
              // Expense receipts sent in from a job (7 Nov 2026) are typed in from the photo, so they aren't "unable to read".
              const rcpt = (it: Row) => it.extracted?.receipt === true && !(Array.isArray(it.extracted.lines) && it.extracted.lines.length);
              const unread = (it: Row) => !rcpt(it) && (!it.extracted || !(Array.isArray(it.extracted.lines) && it.extracted.lines.length) && it.extracted.total == null);
              // Why it's waiting, in a few words.
              // Choose the job right here on the list (Andy, 6 Nov 2026), with the keyboard drop-down; it then says Check and save.
              const jobPickOpts = sites.filter((x) => x.status !== 'closed').slice().sort((x, y) => String(y.job_number || '').localeCompare(String(x.job_number || ''), 'en-GB', { numeric: true })).map((x) => ({ v: x.id, label: jobTag(x), short: x.job_number || x.name || '' }));
              const setJob = async (it: Row, sid: string) => { const r = await fdb.from('fin_inbox').update({ site_id: sid } as never).eq('id', it.id).select('id'); if (!r.data?.length) { toast('Could not save — try again.'); return; } toast(`Job set: ${jobTag(site(sid))}`, { confirm: true }); void qc.invalidateQueries({ queryKey: ['finPurchases'] }); void qc.invalidateQueries({ queryKey: ['finInbox'] }); };
              const notInvoice = async (it: Row) => { if (!(await confirmAsk('Delete this? Use it for emails that aren’t a supplier’s invoice: a statement, a remittance, an advert or a duplicate. It comes off the list; the email is still kept in the background in case it’s ever needed.', 'Delete'))) return; if (!(await fdb.from('fin_inbox').update({ status: 'ignored', stage: 'ignored' } as never).eq('id', it.id).select('id')).data?.length) { toast('Could not save — try again.'); return; } void qc.invalidateQueries({ queryKey: ['finPurchases'] }); };
              const whyOf = (it: Row) => {
                if (cur === 'pm') return `With ${(pmPeople.find((p) => p.id === it.assigned_pm)?.name || 'a PM').split(' ')[0]}`;
                if (rcpt(it)) { const who = it.assigned_pm ? nameOf(everyone, it.assigned_pm).split(' ')[0] : ''; return who ? `Receipt For ${who}` : 'Receipt'; }
                if (unread(it)) return 'Unable to read';
                if (it.stage === 'pm_replied') return 'PM replied';
                const r = String(it.query_reason || '');
                return /po/i.test(r) && /not found|isn.t|unknown/i.test(r) ? 'PO not found' : !it.site_id ? 'Needs a job' : 'Check and save';
              };
              if (desk && items.length) return (<>
                <FinTable rows={items} keyOf={(it) => it.id} onRow={(it) => router.push(`/fin/inbox/${it.id}` as never)}
                  cols={[
                    { k: 'sup', l: 'Supplier', flex: 1.5, min: 150, sort: (it: Row) => String(it.supplier_override || it.extracted?.supplier || it.from_email || ''), render: (it: Row) => <Cell>{it.supplier_override || it.extracted?.supplier || it.from_email || it.file_name || 'Unknown'}</Cell> },
                    { k: 'no', l: 'Invoice No.', render: (it: Row) => <Cell>{it.extracted?.invoice_no || '—'}</Cell> },
                    { k: 'd', l: 'Date', sort: (it: Row) => String(it.extracted?.date || it.received_at || ''), render: (it: Row) => <Cell>{it.extracted?.date ? fdate(it.extracted.date) : rcpt(it) && it.received_at ? fdate(it.received_at) : '—'}</Cell> },
                    { k: 'g', l: 'Gross', sort: (it: Row) => Number(it.extracted?.total || 0), total: (l: Row[]) => money(l.reduce((t, it) => t + Number(it.extracted?.total || 0), 0)), render: (it: Row) => <Cell>{it.extracted?.total != null ? money(it.extracted.total) : '—'}</Cell> },
                    { k: 'w', l: 'Status', flex: 1.1, min: 120, text: (it: Row) => whyOf(it), choices: Array.from(new Set(items.map(whyOf))), render: (it: Row) => (cur !== 'pm' && !it.site_id && !unread(it) && !rcpt(it)
                      ? <View onStartShouldSetResponder={() => true} onResponderTerminationRequest={() => false} {...({ onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() } as object)} style={{ width: 150, alignSelf: 'center' }}><TypePick label={`Choose the job for ${it.extracted?.invoice_no || 'this invoice'}`} value="" placeholder="Needs a job" options={jobPickOpts} listWidth={300} onChange={(v) => void setJob(it, v)} style={{ borderWidth: 1, borderColor: '#f8e7c2', backgroundColor: '#fffaf0', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, fontSize: 13, color: '#B35A00' }} /></View>
                      : <Text numberOfLines={1} style={{ fontSize: 13, color: '#B35A00', textAlign: 'center' }}>{whyOf(it)}</Text>) },
                    { k: 'a', l: 'Actions', min: 108, noSort: true, render: (it: Row) => <ActionsCell items={[
                      ...(!unread(it) && !rcpt(it) ? [{ key: 'ok', label: 'Approve', run: () => { setPendingAct(it.id, 'approve'); router.push(`/fin/inbox/${it.id}` as never); } }] : []),
                      { key: 'edit', label: unread(it) || rcpt(it) ? 'Fill In' : 'Edit', run: () => router.push(`/fin/inbox/${it.id}` as never) },
                      { key: 'pm', label: cur === 'pm' ? 'Change PM' : 'Send To PM', run: () => assignPm(it) },
                      ...(cur === 'pm' && it.site_id ? [{ key: 'sup', label: 'Query Supplier', run: () => { setPendingAct(it.id, 'supplier'); router.push(`/fin/inbox/${it.id}` as never); } }] : []),
                      { key: 'not', label: 'Delete', run: () => notInvoice(it) },
                    ]} /> },
                  ]}
                  footLabel={(l) => `${l.length} waiting`} />
                {exportBar(cur === 'pm' ? 'Purchase invoices with a PM' : 'Purchase invoices received', [{ l: 'Supplier', w: 160 }, { l: 'Invoice no.', w: 80 }, { l: 'Date', w: 70 }, { l: 'Gross £', w: 75, money: true }, { l: 'Status', w: 120 }],
                  items.map((it) => [it.supplier_override || it.extracted?.supplier || it.from_email || it.file_name || '', it.extracted?.invoice_no || '', it.extracted?.date ? fdate(it.extracted.date) : rcpt(it) && it.received_at ? fdate(it.received_at) : '', it.extracted?.total != null ? round2(Number(it.extracted.total)) : '', whyOf(it)]))}
              </>);
              return items.map((it) => {
              const last = (it.comments || []).slice(-1)[0];
              return <InboxRow key={it.id} it={it} pm={cur === 'pm'} why={cur === 'job' ? (!it.extracted ? 'Not read yet — open it to file by hand' : it.stage === 'pm_replied' && last ? `PM replied — ${last.name}: ${last.text}` : plainReason(it.query_reason)) : 'Sent to a PM'} job={it.site_id ? jobTag(site(it.site_id)) : ''} onPm={() => void assignPm(it)} onJob={async () => { const sid = await pickJob('Which project is it for?', sites.filter((x) => x.status !== 'closed')); if (!sid) return; const r = await fdb.from('fin_inbox').update({ site_id: sid } as never).eq('id', it.id).select('id'); if (!r.data?.length) { toast('Could not save — try again.'); return; } void qc.invalidateQueries({ queryKey: ['finPurchases'] }); }} />;
              });
            })()}
            {!(cur === 'job' ? needJob : withPm).length && <Empty>{cur === 'job' ? 'Nothing waiting to be allocated.' : 'Nothing with a PM.'}</Empty>}
          </>
        ) : null}
        {cur !== 'job' && (cur !== 'pm' || data.pinvs.some(F.pm) || !withPm.length) && (
          <>
            {(() => {
              const list = sortBy(data.pinvs.filter(F[cur]).filter(fOK).filter((i) => cur !== 'pm' || !pmF || askedOf[i.id] === pmF).filter((i) => hit(i.supplier_name, i.invoice_no, jobTag(site(i.site_id)), posBy[i.po_id]?.number)), 'invoice_date', 'total');
              const bulk = true, picked = list.filter((i) => picks.has(i.id));
              const tick = (i: Row) => <Pressable hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: picks.has(i.id) }} onPress={() => setSel((x) => { const n = new Set(x); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} style={{ width: 13, height: 13, borderRadius: 3, borderWidth: 1.5, borderColor: picks.has(i.id) ? base.blue : '#c3c8d0', backgroundColor: picks.has(i.id) ? base.blue : '#fff', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>{picks.has(i.id) && <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700', lineHeight: 11 }}>✓</Text>}</Pressable>;
              const refresh = () => { setSel(new Set()); ['finPurchases', 'finBook', 'finOverview', 'finPo'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
              const queryPm = async (i: Row) => {
                if (!me) return;
                const jobPm = (site(i.site_id) as Row | undefined)?.responsible_pm_id;
                const order = (x: Row) => (x.id === jobPm ? 0 : x.role === 'pm' ? 1 : 2);
                const list = pmPeople.slice().sort((a, b) => order(a) - order(b) || String(a.name).localeCompare(String(b.name)));
                const k = await chooseAction('Send it to which PM?', list.map((x) => ({ key: x.id, label: `${x.name}${x.id === jobPm ? ' (this job’s PM)' : x.role === 'admin' ? ' (admin)' : ''}` }))); if (!k) return;
                const pm = list.find((x) => x.id === k);
                const n = await promptText(`What does ${pm?.name || 'the PM'} need to check?`, ''); if (n === null) return;
                const note = n.trim() || 'Please check this invoice';
                if (!(await setPinvStatus(me, i.id, 'query', note)).ok) { toast('Couldn’t mark it as a query — try again.'); return; }
                const t = await tellPmOfPi(me, i, `Query on ${piLabel(i)}: ${note}`, k);
                toast(t.sent ? `Sent to ${pm?.name} to check` : 'Marked as a query', { confirm: true }); refresh();
              };
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
                const rows = picked.filter((i) => i.status === 'approved' && !isPaid(i)); if (!rows.length) { toast('Only approved invoices that aren’t paid yet can be marked paid.'); return; }
                let ok = 0; for (const i of rows) if (await setPinvPaid(i.id, date)) ok++;
                toast(`${ok} marked paid`); refresh();
              };
              // Change several at once (Andy, 5 Nov 2026): VAT and cost type. Anything already in Xero is left alone.
              const editable = (rows: Row[]) => { const ok = rows.filter((i) => !i.xero_id), skip = rows.length - ok.length; if (skip) toast(`${skip} already in Xero — change ${skip === 1 ? 'it' : 'them'} in Xero.`); return ok; };
              const vatAll = async () => {
                const rates = vatList(fset).filter((r) => r.active);
                const k = await chooseAction(`VAT for ${picked.length} invoice${picked.length === 1 ? '' : 's'}`, rates.map((r) => ({ key: r.code, label: r.name })));
                const r = rates.find((x) => x.code === k); if (!r) return;
                let ok = 0; const rows = editable(picked);
                for (const i of rows) {
                  const vat = r.rc ? 0 : round2(Number(i.net || 0) * Number(r.rate || 0) / 100);
                  if ((await fdb.from('purchase_invoices').update({ vat, total: round2(Number(i.net || 0) + vat) } as never).eq('id', i.id).select('id')).data?.length) ok++;
                }
                toast(ok === rows.length ? `VAT changed on ${ok}` : `VAT changed on ${ok} of ${rows.length}`); refresh();
              };
              const costAll = async () => {
                const k = await chooseAction(`Cost type for ${picked.length} invoice${picked.length === 1 ? '' : 's'}`, Object.entries(COST_CATS).filter(([c]) => c !== 'labour').map(([key, label]) => ({ key, label }))); if (!k) return;
                let ok = 0; const rows = editable(picked);
                for (const i of rows) if ((await fdb.from('purchase_invoices').update({ cost_code: k } as never).eq('id', i.id).select('id')).data?.length) ok++;
                toast(ok === rows.length ? `Cost type changed on ${ok}` : `Cost type changed on ${ok} of ${rows.length}`); refresh();
              };
              const waiting = picked.filter((i) => ['to_approve', 'query'].includes(i.status)).length, payable = picked.filter((i) => i.status === 'approved' && !isPaid(i)).length;
              // The bulk edit bar sits under the list and only shows once something is ticked; Select All is in it.
              const bulkBar = picked.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10, padding: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10 }}>
                  <Text style={{ fontWeight: '600', color: base.ink, fontSize: 13 }}>{picked.length} Selected · {money(picked.reduce((t, i) => t + Number(i.total || 0), 0))}</Text>
                  {picked.length < list.length && <Pressable onPress={() => setSel(new Set(list.map((i) => i.id)))}><Text style={{ color: base.blue, fontWeight: '500', fontSize: 13 }}>Select All ({list.length})</Text></Pressable>}
                  <Pressable onPress={() => setSel(new Set())}><Text style={{ color: base.slate, fontSize: 13 }}>Clear</Text></Pressable>
                  <View style={{ flex: 1 }} />
                  {waiting > 0 && <Button small title={`Approve ${waiting}`} onPress={() => void approveAll()} />}
                  <Button small kind="ghost" title="Change VAT" onPress={() => void vatAll()} />
                  <Button small kind="ghost" title="Change Cost Type" onPress={() => void costAll()} />
                  {payable > 0 && <Button small kind="ghost" title={`Mark ${payable} Paid`} onPress={() => void paidAll()} />}
                </View>
              ) : null;
              if (desk && list.length) return (
                <><FinTable rows={list} keyOf={(i) => i.id} onRow={(i) => router.push(`/fin/pinv/${i.id}` as never)}
                  cols={[
                    ...(bulk ? [{ k: 'tick', l: '', flex: 0.2, min: 28, noSort: true, render: (i: Row) => tick(i) }] : []),
                    { k: 'sup', l: 'Supplier', flex: 1.3, min: 110, render: (i: Row) => <Cell bold>{i.supplier_name || 'Supplier'}</Cell> },
                    { k: 'no', l: 'Invoice No.', min: 76, render: (i: Row) => <Cell>{i.invoice_no || '—'}</Cell> },
                    ...(siteId ? [] : [{ k: 'p', l: 'Project', flex: 1.5, min: 120, render: (i: Row) => <Cell>{jobTag(site(i.site_id))}</Cell> }]),
                    { k: 'd', l: 'Date', min: 72, sort: (i: Row) => String(i.invoice_date || ''), render: (i: Row) => <Cell>{fdate(i.invoice_date)}</Cell> },
                    { k: 'n', l: 'Net', min: 72, total: (l: Row[]) => money(l.reduce((t, i) => t + Number(i.net || 0), 0)), render: (i: Row) => <Cell>{money(i.net)}</Cell> },
                    { k: 'v', l: 'VAT', min: 64, total: (l: Row[]) => money(l.reduce((t, i) => t + Number(i.vat || 0), 0)), render: (i: Row) => <Cell>{money(i.vat)}</Cell> },
                    { k: 't', l: 'Gross', min: 72, total: (l: Row[]) => money(l.reduce((t, i) => t + Number(i.total || 0), 0)), render: (i: Row) => <Cell bold>{money(i.total)}</Cell> },
                    ...(cur === 'unpaid' ? [] : [{ k: 'po', l: 'PO', min: 96, sort: (i: Row) => posBy[i.po_id]?.number || '', render: (i: Row) => poCell(i) }]),
                    { k: 's', l: 'Status', min: 84, noSort: true, choices: ['Needs Checking', 'Query', 'Approved', 'Paid', 'Rejected'], render: (i: Row) => <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Cell tone={piTone(i)}>{piWord(i)}</Cell>{!!i.xero_id && <View accessibilityLabel="Posted to Xero" style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#13B5EA', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 7, fontWeight: '700', color: '#fff', letterSpacing: 0.1 }}>xero</Text></View>}</View> },
                    { k: 'a', l: 'Actions', min: 108, noSort: true, render: (i: Row) => <ActionsCell items={[
                                            ...(['to_approve', 'query', 'rejected'].includes(i.status) && me ? [{ key: 'ok', label: 'Approve', run: async () => { if (!(await confirmAsk(`Approve ${i.supplier_name || ''} ${i.invoice_no || ''} (${money(i.total)})?`, 'Approve'))) return; const r = await setPinvStatus(me, i.id, 'approved'); toast(r.ok ? 'Approved' : 'Couldn’t approve — try again.', { confirm: r.ok }); refresh(); } }] : []),
                      ...(i.status !== 'approved' && !isPaid(i) ? [{ key: 'pm', label: 'Send To PM', run: () => queryPm(i) }] : []),
                      ...(cur === 'pm' ? [{ key: 'sup', label: 'Query Supplier', run: () => { setPendingAct(i.id, 'supplier'); router.push(`/fin/pinv/${i.id}` as never); } }] : []),
                      { key: 'edit', label: 'Edit', run: () => router.push(`/fin/pinv/${i.id}?edit=1` as never) },
                      ...(i.status === 'approved' && !isPaid(i) ? [{ key: 'paid', label: 'Mark Paid', run: async () => { if (await setPinvPaid(i.id, today())) { toast('Marked paid', { confirm: true }); refresh(); } } }] : []),
                      ...(i.status !== 'rejected' && !isPaid(i) && me ? [{ key: 'rej', label: 'Reject', run: async () => { const inX = !!i.xero_id; if (!(await confirmAsk(`Reject this purchase invoice?${inX ? '\n\nIt’s already in Xero. Rejecting it here won’t change Xero — change it in Xero too.' : ''}`, 'Reject'))) return; const r = await setPinvStatus(me, i.id, 'rejected'); toast(r.ok ? 'Rejected' : 'Couldn’t reject it — try again.', { confirm: r.ok }); refresh(); } }] : []),
                    ]} /> },
                  ]}
                  footLabel={(list) => `${list.length} shown`} footRight={monthPick} />{bulkBar}
                  {exportBar('Purchase invoices', [{ l: 'Supplier', w: 130 }, { l: 'Invoice no.', w: 75 }, { l: 'Project', w: 150 }, { l: 'Date', w: 70 }, { l: 'Net £', w: 70, money: true }, { l: 'VAT £', w: 60, money: true }, { l: 'Gross £', w: 70, money: true }, { l: 'Status', w: 90 }],
                    list.map((i) => [i.supplier_name || '', i.invoice_no || '', jobTag(site(i.site_id)), fdate(i.invoice_date), round2(Number(i.net || 0)), round2(Number(i.vat || 0)), round2(Number(i.total || 0)), piWord(i) + (i.xero_id ? ' (in Xero)' : '')]))}</>
              );
              return list.length ? (
                <>
                  {list.map((i) => <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{bulk && tick(i)}<View style={{ flex: 1 }}><FinRow compact left={i.invoice_no || '—'} title={i.supplier_name || 'Supplier'} sub={[siteId ? '' : jobTag(site(i.site_id)), fdate(i.invoice_date), `net ${money(i.net)}`, posBy[i.po_id] ? `PO ${posBy[i.po_id].number}` : 'No PO', piWord(i), i.query_note ? `⚠ ${i.query_note}` : ''].filter(Boolean).join(' · ')} right={money(i.total)} tone={i.status === 'query' ? '#C0392B' : undefined} onPress={() => router.push(`/fin/pinv/${i.id}` as never)} /></View></View>)}
                  {bulkBar}
                  {list.length > 1 && <Muted>Total ({list.length}): net {money(list.reduce((t, i) => t + Number(i.net || 0), 0))} · VAT {money(list.reduce((t, i) => t + Number(i.vat || 0), 0))} · gross {money(list.reduce((t, i) => t + Number(i.total || 0), 0))}</Muted>}
                </>
              ) : <Empty>Nothing here.</Empty>;
            })()}
          </>
        )}
      </View>
    );
  }
  // A project's "All" tab (9219y): every purchase invoice, order and plant hire on the job, newest first, with the total spend.
  if (tab === 'all') {
    type Any = { id: string; kind: string; ref: string; who: string; date: string; net: number; status: string; go: string };
    const all: Any[] = [
      ...live.map((i) => ({ id: `pi${i.id}`, kind: 'Purchase invoice', ref: i.invoice_no || '—', who: i.supplier_name || 'Supplier', date: String(i.invoice_date || ''), net: Number(i.net || 0), status: i.paid_on ? 'Paid' : PI_STATUS[i.status] || i.status, go: `/fin/pinv/${i.id}` })),
      ...data.pos.map((p) => ({ id: `po${p.id}`, kind: 'Purchase order', ref: p.number || '—', who: p.supplier_name || '—', date: String(p.issue_date || p.created_at || '').slice(0, 10), net: Number(p.value || 0), status: PO_STATUS[p.status] || p.status, go: `/fin/po/${p.id}` })),
      ...data.hires.map((h) => ({ id: `ph${h.id}`, kind: 'Plant hire', ref: h.item || '—', who: h.supplier_name || '—', date: String(h.on_hire || ''), net: plantCost(h as never).cost, status: h.off_hire ? 'Off hire' : 'On hire', go: `/fin/plant/${h.id}` })),
    ].filter((x) => hit(x.kind, x.ref, x.who)).sort((a, b) => b.date.localeCompare(a.date));
    const spend = round2(live.reduce((t, i) => t + Number(i.net || 0), 0));
    return (
      <View>
        <Muted style={{ marginBottom: 10 }}>Total spend (purchase invoices, net): {money(spend)}.</Muted>
        {desk && all.length ? (
          <FinTable rows={all} keyOf={(x) => x.id} onRow={(x) => router.push(x.go as never)}
            cols={[
              { k: 'k', l: 'Type', choices: ['Purchase invoice', 'Purchase order', 'Plant hire'], render: (x: Any) => <Cell>{x.kind}</Cell> },
              { k: 'r', l: 'Ref', render: (x: Any) => <Cell bold>{x.ref}</Cell> },
              { k: 'w', l: 'Supplier', flex: 1.3, render: (x: Any) => <Cell>{x.who}</Cell> },
              { k: 'd', l: 'Date', sort: (x: Any) => x.date, render: (x: Any) => <Cell>{x.date ? fdate(x.date) : '—'}</Cell> },
              { k: 'n', l: 'Net', sort: (x: Any) => x.net, total: (l: Any[]) => money(l.reduce((t, x) => t + x.net, 0)), render: (x: Any) => <Cell>{money(x.net)}</Cell> },
              { k: 's', l: 'Status', render: (x: Any) => <Cell>{x.status}</Cell> },
            ]}
            footLabel={(l) => `${l.length} shown`} />
        ) : all.length ? all.map((x) => <FinRow compact key={x.id} title={`${x.kind} · ${x.ref}`} sub={[x.who, x.date ? fdate(x.date) : '', x.status].filter(Boolean).join(' · ')} right={money(x.net)} onPress={() => router.push(x.go as never)} />) : <Empty>Nothing bought for this project yet.</Empty>}
      </View>
    );
  }
  if (tab === 'plant') {
    const list = sortBy(data.hires.filter(fOK).filter((h) => hit(h.item, h.supplier_name, jobTag(site(h.site_id)))), 'on_hire', 'rate');
    const onHire = data.hires.filter((h) => !h.off_hire);
    return (
      <View>
        <SubRight><Button small title="+ Plant Hire" onPress={() => void withJob('Add plant hire', (sid) => `/fin/plant/new?site=${sid}`)} /></SubRight>
        {!desk && bar('Search item, supplier or project')}
        {desk && list.length ? (
          <FinTable rows={list} keyOf={(h) => h.id} onRow={(h) => router.push(`/fin/plant/${h.id}` as never)}
            cols={[
              { k: 'i', l: 'Item', render: (h: Row) => <Cell bold>{h.item}</Cell> },
              { k: 's', l: 'Supplier', render: (h: Row) => <Cell>{h.supplier_name || '—'}</Cell> },
              ...(siteId ? [] : [{ k: 'p', l: 'Project', render: (h: Row) => <Cell>{jobTag(site(h.site_id))}</Cell> }]),
              { k: 'on', l: 'On Hire', sort: (h: Row) => String(h.on_hire || ''), render: (h: Row) => <Cell>{h.on_hire ? fdate(h.on_hire) : '—'}</Cell> },
              { k: 'off', l: 'Off Hire', sort: (h: Row) => String(h.off_hire || ''), render: (h: Row) => <Cell>{h.off_hire ? fdate(h.off_hire) : '—'}</Cell> },
              { k: 'c', l: 'Cost To Date', total: (l: Row[]) => money(l.reduce((t, h) => t + plantCost(h as never).cost, 0)), sort: (h: Row) => plantCost(h as never).cost, render: (h: Row) => <Cell tone={noRate(h) ? '#B45309' : undefined}>{noRate(h) ? 'Rate To Add' : money(plantCost(h as never).cost)}</Cell> },
              { k: 'st', l: 'Status', noSort: true, render: (h: Row) => { const c = plantCost(h as never), long = !h.off_hire && c.days > 28; return <Cell tone={h.off_hire ? undefined : long ? '#C0392B' : '#1E7A43'}>{h.off_hire ? 'Off hire' : `On hire ${c.weeks} wk`}</Cell>; } },
            ]}
            footLabel={(left) => `${left.length} shown`} />
        ) : list.length ? list.map((h) => { const c = plantCost(h as never), long = !h.off_hire && c.days > 28; return (
          <FinRow compact key={h.id} title={h.item} sub={[h.supplier_name, siteId ? '' : jobTag(site(h.site_id)), `on ${fdate(h.on_hire)}`, h.off_hire ? `off ${fdate(h.off_hire)}` : `on hire ${c.weeks} wk${long ? ' — over 4 weeks' : ''}`].filter(Boolean).join(' · ')} right={noRate(h) ? 'Rate To Add' : money(c.cost)} tone={long || noRate(h) ? '#D98A00' : undefined} onPress={() => router.push(`/fin/plant/${h.id}` as never)} />
        ); }) : <Empty>No plant hire.</Empty>}
        {desk && exportBar('Plant hire', [{ l: 'Item', w: 140 }, { l: 'Supplier', w: 120 }, { l: 'Project', w: 150 }, { l: 'On hire', w: 70 }, { l: 'Off hire', w: 70 }, { l: 'Cost to date £', w: 80, money: true }],
          list.map((h) => [h.item || '', h.supplier_name || '', jobTag(site(h.site_id)), h.on_hire ? fdate(h.on_hire) : '', h.off_hire ? fdate(h.off_hire) : '', round2(plantCost(h as never).cost)]))}
        <Muted style={{ marginTop: 10 }}>{onHire.length} on hire · {money(onHire.reduce((t, h) => t + plantCost(h as never).cost, 0), 0)} so far. Tap one to off-hire it.</Muted>
      </View>
    );
  }
  const by: Record<string, { name: string; email: string; spend: number; owed: number; n: number }> = {};
  data.suppliers.forEach((s) => { by[s.name] = { name: s.name, email: s.email || '', spend: 0, owed: 0, n: 0 }; });
  live.forEach((i) => { const k = i.supplier_name || 'Unknown', r = (by[k] = by[k] || { name: k, email: '', spend: 0, owed: 0, n: 0 }); r.n++; if (i.status === 'approved') r.spend += Number(i.net || 0); if (i.status === 'approved' && !isPaid(i)) r.owed += Number(i.total || 0); });
  const list = Object.values(by).sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name)).filter((r) => hit(r.name, r.email));
  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: 10 }}><View style={{ marginLeft: 'auto' }}><Button kind="ghost" title="Edit suppliers (Directory)" onPress={() => router.push('/fin/directory?kind=supplier' as never)} /></View></View>
      <TextInput value={q} onChangeText={setQ} placeholder="Search suppliers" style={[box, { marginBottom: 10 }]} />
      {list.length ? list.map((r) => <FinRow compact key={r.name} title={r.name} sub={[r.email, `${r.n} invoice${r.n === 1 ? '' : 's'}`, `spent ${money(r.spend, 0)} net`].filter(Boolean).join(' · ')} right={r.owed ? `${money(r.owed, 0)} to pay` : '—'} />) : <Empty>No suppliers yet.</Empty>}
    </View>
  );
}

/** Sub-tab counts: purchase invoices waiting for a project or to be approved (9219b needJob + toApprove). */
export function usePurchaseBadges(): Record<string, number> | undefined {
  const { me } = useAuth();
  const { data } = usePurchases(me?.org_id);
  return data ? { invoices: data.inbox.filter((i) => i.stage !== 'with_pm').length + data.pinvs.filter((i) => ['to_approve', 'query'].includes(i.status)).length } : undefined;
}
export function PurchasesStats() {
  const { me } = useAuth();
  const { data } = usePurchases(me?.org_id);
  const { period, pick } = useStatPeriods();
  if (!data) return null;
  const pJ = period('p_job', 'all'), pU = period('p_pay', 'all'), pA = period('p_appr', 'all'), pC = period('p_ord', 'all');
  const live = data.pinvs.filter((i) => i.status !== 'rejected');
  const needJob = data.inbox.filter((i) => i.stage !== 'with_pm' && inPeriod(i.received_at, pJ)).length; // unread ones too, as the list (4 Nov 2026)
  const unpaid = data.pinvs.filter((i) => i.status === 'approved' && !isPaid(i) && inPeriod(i.invoice_date, pU)).reduce((t, i) => t + Number(i.total || 0), 0);
  const toApprove = data.pinvs.filter((i) => ['to_approve', 'query'].includes(i.status) && inPeriod(i.invoice_date, pA)).length;
  const ordered = round2(data.pos.filter((p) => p.status === 'open' && !p.is_draft && p.value != null && inPeriod(p.created_at, pC)).reduce((t, p) => t + Math.max(0, Number(p.value) - poInvoiced(p, live)), 0));
  const to = (tab: string, f: string) => () => router.setParams({ tab, f });
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
      <FinStat tone="blue" v={String(needJob)} label={`Received, No Job Yet · ${pJ.label}`} onPress={to('invoices', 'job')} onMenu={() => void pick('p_job', 'all')} /><FinStat tone="green" v={money(unpaid, 0)} label={`To Pay Suppliers (Incl. VAT) · ${pU.label}`} onPress={to('invoices', 'unpaid')} onMenu={() => void pick('p_pay', 'all')} />
      <FinStat tone="red" v={String(toApprove)} label={`Needs Checking · ${pA.label}`} onPress={to('invoices', 'approve')} onMenu={() => void pick('p_appr', 'all')} /><FinStat tone="amber" v={money(ordered, 0)} label={`Ordered, Not Invoiced · ${pC.label}`} onPress={to('orders', 'open')} onMenu={() => void pick('p_ord', 'all')} />
    </View>
  );
}
