// The repair job hub (Andy, 7 Nov 2026; docs/claude-code/REPAIRS-PLAN.md). One page per job, two tabs:
//  Job — the progress bar and what's next, the works order (with a viewer), address, call-out, tenant, the booked /
//        attended / completed dates, the documents (quote, attendance report, completed works), notes everyone can add
//        (the client too), and for Finance a Money box (quoted, costs, margin, the invoice). Projects shows no money:
//        pricing the quote and the schedule of rates are Finance's (Andy, 7 Nov 2026).
//  Repair — each stage of the works (booked in, attended, quote, approved, works done), opened up to update it.
// Managers get Update ▾; a client sees the Job tab without the money or the updates. Every action writes the old
// app's job_status too, as the old app is still live for repairs.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router, Stack, usePathname } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { usePageCrumbs, type Crumb } from '@/components/Crumbs';
import { viewDoc } from '@/components/DocViewer';
import { FinForm, type Field } from '@/components/FinForm';
import { bookable, bookCostTo } from '@/components/FinBookCost';
import { FinTabs } from '@/components/FinNav';
import { Pop, PopLine } from '@/components/Pop';
import { RepairPhotos } from '@/components/RepairPhotos';
import { StageBar } from '@/components/StageBar';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { fdb } from '@/data/finance';
import { useBook } from '@/data/finBook';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { raiseRepairInvoice } from '@/data/repairInvoice';
import { repairReportsAfter, scheduleRepairReport, syncRepairPhotos } from '@/data/repairOneDrive';
import { useContractQuoteSettings } from '@/data/repairQuote';
import { addRepairNote, deleteRepairJob, geocodeRepairJob, hideRepairPhoto, patchRepairJob, recordNoAccess, syncRepairEvent, uploadWorkOrder, useRepairJob, useRepairNotes } from '@/data/repairs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { exportRepairReport } from '@/lib/repairReportPdf';
import { forecast } from '@/lib/rules/finBook';
import { quoteTotals, type QuoteLine } from '@/lib/rules/repairQuote';
import { dueFromPriority, dueLabel, dueOf, isOverdue } from '@/lib/rules/repairDue';
import { BAR, BAR_PROJECTS, barState, bookedFor, bookedSlot, bookedTo, BOXES, isOpen, nextHint, noAccessOf, otherTradesOf, repairStage, slotShort, STAGE_LABEL, TIME_SLOTS, tradesOf, tradesSummary, type RJob, type Trade } from '@/lib/rules/repairStages';
import type { RepairJob } from '@/lib/rules/repairs';
import { isFinanceUser, isFullManager, isManager } from '@/lib/roles';
import { base, page, space } from '@/theme/theme';

type Row = Record<string, any>;
type Form = 'book' | 'works' | 'trades' | 'hold' | 'details' | 'attend' | 'done' | 'noaccess' | null;
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function KV({ k, v, onPress }: { k: string; v: ReactNode; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={{ flexDirection: 'row', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EEF0F2' }}>
      <Text style={{ width: 96, flexShrink: 0, fontSize: 13, color: base.slate }}>{k}</Text>
      <Text style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 13.5, fontWeight: '600', color: onPress ? base.blue : base.ink }}>{v}</Text>
    </Pressable>
  );
}

export function RepairHub({ siteId, jobId, money }: { siteId: string; jobId: string; money?: boolean }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useRepairJob(jobId);
  const { data: notes = [] } = useRepairNotes(jobId);
  const { data: people = [] } = usePeople();
  const { data: site } = useSite(siteId);
  const { data: qs } = useContractQuoteSettings(siteId);
  const fin = !!money && isFinanceUser(me, org);
  const job0 = data?.job as (RepairJob & Row) | null | undefined;
  const { data: inv } = useQuery({ queryKey: ['repairInv', job0?.invoice_id], enabled: fin && !!job0?.invoice_id, queryFn: async () => (await fdb.from('fin_invoices').select('id,number,status,net,total').eq('id', job0?.invoice_id as string).maybeSingle()).data as Row | null });
  const { data: book } = useBook(fin ? me?.org_id : null, fin ? siteId : null);
  const [tab, setTab] = useState<'job' | 'repair'>('job');
  const [form, setForm] = useState<Form>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [wNotes, setWNotes] = useState<string | null>(null);
  const [tradeEdit, setTradeEdit] = useState<Partial<Trade> | null>(null);
  // The trail at the top (Andy, 8 Nov 2026): Projects › the contract › Works Orders › the box it's in › the job, as folders.
  const path = usePathname();
  const inProjects = path.startsWith('/sites/');
  const inBox = job0 ? BOXES.find((b) => b.k !== 'overdue' && b.k !== 'all' && b.k !== 'paid' && b.test(job0 as never)) : undefined;
  const listAt = inProjects ? `/sites/${siteId}/repairs` : `/fin/job/${siteId}/repairs`;
  usePageCrumbs(path, job0 ? [[inProjects ? 'Works Orders' : 'Live Jobs', listAt], ...(inBox ? [[inBox.l, `${listAt}?box=${inBox.k}`] as Crumb] : []), [job0.job_number || job0.address || 'Repair Job', null]] : null);
  const [moneyPop, setMoneyPop] = useState<'' | 'quote' | 'costs'>('');
  if (!me) return null;
  if (isLoading || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const job = job0 as (RepairJob & RJob & Row) | null;
  if (!job) return <Muted style={{ padding: space.l }}>This job no longer exists.</Muted>;
  const mgr = isManager(me), client = me.role === 'client';
  const st = repairStage(job), bar = barState(job, inv);
  const label = job.address || 'Repair job';
  const ops = people.filter((p) => p.role === 'operative' || p.role === 'site_manager' || p.role === 'pm');
  const bookingFields: Field[] = [
    { k: 'd', label: 'Date', kind: 'date', half: true },
    { k: 'slot', label: 'Time Slot', kind: 'choice', half: true, options: [['', 'Not Set'], ...TIME_SLOTS.map((s) => [s, s] as [string, string])] },
    { k: 'who', label: 'Operative', kind: 'choice', options: [['', 'Not Chosen'], ...ops.map((p) => [p.id, p.name] as [string, string])] },
    { k: 'notes', label: 'Notes For The Booking', kind: 'multiline', ph: 'E.g. Key safe 1234, tenant home after 10am' },
  ];
  const refresh = () => { ['repairJob', 'repairJobs', 'repairNotes', 'repairInv'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  const surveyor = job.surveyed_by ? nameOf(people, job.surveyed_by) : '';
  const save = async (patch: Row, msg?: string) => {
    const ok = await patchRepairJob(job.id, patch);
    if (!ok) { toast('Could not save — try again.'); return false; }
    if (msg) toast(msg);
    refresh();
    repairReportsAfter({ ...job, ...patch }, { keys: Object.keys(patch) }).forEach((k) => scheduleRepairReport(k, job.id, org, surveyor));
    return true;
  };
  const trades = tradesOf(job);
  const noAccess = noAccessOf(job);
  const due = dueLabel(job), late = isOverdue(job);
  const quote = Array.isArray(job.quote_lines) ? quoteTotals(job.quote_lines as QuoteLine[], Number(job.quote_discount_pct || 0), qs?.vat) : job.variation_cost != null ? quoteTotals([{ description: 'Quote', qty: 1, rate: Number(job.variation_cost) }], 0, qs?.vat) : null;

  // Costs on this job (booked to the contract, then this job, like plots).
  const fc = fin && book ? forecast(book.book, siteId, book.settings) : null;
  const costs = fc ? fc.lines.filter((l) => l.sub === job.id && l.cat !== 'committed').reduce((t, l) => t + l.net, 0) : 0;
  const ordered = fc ? fc.lines.filter((l) => l.sub === job.id && l.cat === 'committed').reduce((t, l) => t + l.net, 0) : 0;
  // Each job's costs by type, its value (invoiced, else quoted) and profit (Andy, 8 Nov 2026).
  const byCat = (c: string) => (fc ? fc.lines.filter((l) => l.sub === job.id && (c === 'other' ? !['materials', 'labour', 'plant', 'subcontract', 'committed'].includes(l.cat) : l.cat === c)).reduce((t, l) => t + l.net, 0) : 0);
  const value = job.invoice_id && inv ? Number(inv.net || 0) : quote ? quote.net : null;
  const profit = value != null ? value - costs - ordered : null;
  const pct = value && profit != null ? Math.round((profit / value) * 1000) / 10 : null;

  const docs = [
    // The quote document: Finance, and the client once it's been sent; not the Projects team (no money in Projects).
    ...((fin && quote) || (client && job.variation_issued_at) ? [{ k: 'quote', l: 'Quote' }] : []),
    ...(job.survey_required === 'Y' || job.survey_required === 'NA' ? [{ k: 'survey', l: 'Booking Visit Report' }] : []),
    ...(job.works_completed ? [{ k: 'completion', l: 'Completed Works' }] : []),
  ] as { k: 'quote' | 'survey' | 'completion'; l: string }[];
  const openDoc = async (k: 'quote' | 'survey' | 'completion') => { setBusy(k); const ok = await exportRepairReport(k, job, site, org, surveyor, qs?.vat).catch(() => false); setBusy(''); if (!ok) toast('Could not build the PDF.'); };

  const run = async (k: string) => {
    if (k === 'quote') { router.push(`/fin/job/${siteId}/quote/${job.id}` as never); return; }
    if (k === 'approve') { if (await confirmAsk('Has the client approved the quote?', 'Yes, Approved')) await save({ quote_approved: true, quote_approved_at: new Date().toISOString(), approved_by: me.id, self_authorized: false, job_status: 'Approved - To Do' }, 'Approved — book the works in'); return; }
    if (k === 'reject') { if (await confirmAsk('Has the client turned the quote down?', 'Yes, Rejected')) await save({ quote_approved: false, job_status: 'Rejected' }, 'Marked rejected'); return; }
    if (k === 'hold' && job.on_hold) { await save({ on_hold: false, on_hold_reason: null }, 'Off hold'); return; }
    if (k === 'check') { if (await confirmAsk('Checked the works and ready to invoice?', 'Yes, Checked')) await save({ closed: true, closed_by: me.id, closed_at: new Date().toISOString(), job_status: 'Closed' }, 'Checked — ready to invoice'); return; }
    if (k === 'reopen') { await save({ closed: false, closed_by: null, closed_at: null, job_status: 'Awaiting Sign-off' }); return; }
    if (k === 'invoice') {
      if (!site) return;
      setBusy('inv'); const id = await raiseRepairInvoice(me, site as never, [job]); setBusy('');
      if (!id) { toast('Could not start the invoice — try again.'); return; }
      refresh(); router.push(`/fin/job/${siteId}/invoice/${id}` as never); return;
    }
    if (k === 'openinv' && job.invoice_id) { router.push(`/fin/job/${siteId}/invoice/${job.invoice_id}` as never); return; }
    if (k === 'wo') {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true }); if (r.canceled || !r.assets[0]) return;
      setBusy('wo'); const ok = await uploadWorkOrder(me, job, { uri: r.assets[0].uri, name: r.assets[0].name || 'works-order.pdf', mimeType: r.assets[0].mimeType }); setBusy('');
      toast(ok ? 'Works order saved' : 'Upload failed — try again.'); refresh(); return;
    }
    if (k === 'odlink') { router.push({ pathname: '/pm/onedrive-pick', params: { target: 'repairjob', id: job.id } } as never); return; }
    if (k === 'odsend') {
      setBusy('od'); const r = await syncRepairPhotos(job.id, { force: true, reports: { org, surveyor } }).finally(() => setBusy(''));
      toast(!r.linked ? 'Link a OneDrive folder first.' : r.failed ? `${r.done} sent to OneDrive, ${r.failed} didn’t go — they’ll retry` : `Sent to OneDrive (${r.done} photo${r.done === 1 ? '' : 's'})`); return;
    }
    if (k === 'delete') {
      if (!(await confirmAsk('Permanently delete this job and all its photos? This can’t be undone.', 'Delete'))) return;
      if (await deleteRepairJob(job)) { toast('Job deleted'); void qc.invalidateQueries({ queryKey: ['repairJobs'] }); router.back(); } else toast('Could not delete — try again.');
      return;
    }
    // Quote Update ▾ (Andy, 8 Nov 2026): the client's answer. Rejected puts it back to Quotation Required for a new price;
    // Rejected And Close Job closes it for good.
    if (k === 'quoteupd') {
      const c = await chooseAction('Quote Update', [{ key: 'qa', label: 'Quote Approved' }, { key: 'qr', label: 'Quote Rejected (Price It Again)' }, { key: 'qc', label: 'Rejected And Close Job' }]);
      const at = new Date().toISOString();
      if (c === 'qa') await save({ quote_approved: true, quote_approved_at: at, approved_by: me.id, self_authorized: false, job_status: 'Approved - To Do' });
      if (c === 'qr') await save({ quote_approved: null, quote_approved_at: null, variation_issued_at: null, job_status: 'Surveyed - Awaiting Cost' });
      if (c === 'qc' && (await confirmAsk('Mark the quote rejected and close this job for good? It can’t be reopened.', 'Reject And Close'))) await save({ quote_approved: false, job_status: 'Rejected', closed: true, closed_by: me.id, closed_at: at });
      return;
    }
    if (k === 'trades') { setTradeEdit({}); return; }
    setForm(k as Form);
  };
  // What Update ▾ offers, by where the job is.
  const updates = () => {
    const o: { key: string; label: string }[] = [];
    if (st === 'to_book' || st === 'booked') o.push({ key: 'book', label: st === 'booked' ? 'Change The Booking' : 'Book In' });
    if (st === 'booked' || st === 'to_book' || st === 'attended' || st === 'quote_needed') o.push({ key: 'attend', label: 'Update Status' });
    if (st === 'booked' || st === 'works_booked') o.push({ key: 'noaccess', label: 'Record No Access' });
    if (fin && (st === 'attended' || st === 'quote_needed' || st === 'awaiting_approval')) o.push({ key: 'quote', label: st === 'awaiting_approval' ? 'Change The Quote' : 'Price It (Quote)' });
    if (st === 'awaiting_approval') o.push({ key: 'quoteupd', label: 'Quote Update ▾' });
    if (st === 'approved' || st === 'works_booked') o.push({ key: 'works', label: st === 'works_booked' ? 'Change The Repair Booking' : 'Book The Repair' });
    if (st === 'attended' || st === 'approved' || st === 'works_booked') o.push({ key: 'done', label: 'Mark Job As Complete' });
    if (st === 'done' && !job.closed) o.push({ key: 'check', label: 'Checked — Ready To Invoice' });
    if (st === 'done' && job.closed && !job.invoice_id) o.push({ key: 'reopen', label: 'Reopen (Not Checked)' });
    if (st !== 'done' && st !== 'rejected') { o.push({ key: 'trades', label: 'Add Other Trade (e.g. Scaffold)' }); o.push({ key: 'hold', label: job.on_hold ? 'Take Off Hold' : 'Put On Hold' }); }
    o.push({ key: 'details', label: 'Edit Job Details' }, { key: 'wo', label: job.work_order_path ? 'Replace The Works Order' : 'Upload The Works Order' }, { key: 'odlink', label: 'Link Its OneDrive Folder' }, { key: 'odsend', label: 'Send Everything To OneDrive' }, { key: 'delete', label: 'Delete The Job' });
    return o;
  };

  const ladder = (k: number, title: string, right: string, body?: ReactNode, action?: ReactNode) => {
    const skipped = bar.skipQuote && (k === 4 || k === 5 || k === 6);
    const done = !bar.rejected && bar.step > k && !skipped, now = !bar.rejected && bar.step === k;
    return (
      <View key={k} style={{ backgroundColor: base.card, borderWidth: now ? 1.5 : 1, borderColor: now ? base.ink : base.cardLine, borderRadius: 12, marginBottom: 8, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? base.ink : '#fff', borderWidth: now ? 2 : 1.5, borderStyle: skipped ? 'dashed' : 'solid', borderColor: done ? base.ink : now ? '#E3262B' : '#C9CDD3' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: done ? '#fff' : now ? '#E3262B' : base.slate }}>{done ? '✓' : skipped ? '–' : k - 1}</Text>
          </View>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: base.ink }}>{title}</Text>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, color: base.slate }}>{skipped ? 'Not Needed' : right}</Text>
        </View>
        {(body || action) && !skipped && <View style={{ paddingHorizontal: 12, paddingBottom: 11, paddingLeft: 45 }}>{body}{action && mgr ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>{action}</View> : null}</View>}
      </View>
    );
  };
  const btn = (k: string, l: string, ghost = true) => <Button key={k} small kind={ghost ? 'ghost' : undefined} title={l} onPress={() => void run(k)} />;
  const txt = (s?: string | null) => (s ? <Text style={{ fontSize: 13, color: base.ink, marginTop: 2 }}>{s}</Text> : null);

  // A booking's line: date · slot · who; its notes underneath (Andy, 8 Nov 2026).
  const bookLine = (d: string | null | undefined, slot: string | null | undefined, who: string | null | undefined, none: string) => (d ? [fmt(d), slotShort(slot), who ? nameOf(people, who) : ''].filter(Boolean).join(' · ') : none);
  const bookNotes = (n: string | null | undefined) => (n ? <><Muted style={{ fontSize: 11.5 }}>Notes For The Booking</Muted>{txt(n)}</> : null);
  const visitPhotos = data.photos.filter((p) => !p.deleted_at && !p.trade_id && (p.category === 'survey' || p.category === 'access'));
  // Who attended (Andy, 8 Nov 2026): the operative who uploaded the visit's photos; a manager's upload doesn't count.
  const photoOperative = visitPhotos.map((p) => people.find((x) => x.id === p.uploaded_by)).find((x) => x && x.role === 'operative')?.id ?? null;
  const repairTab = (
    <View>
      {ladder(2, 'Booking', bookLine(job.survey_booking_date, job.survey_booking_slot, job.survey_booking_assigned_to, 'Not booked yet'), job.survey_booking_notes || noAccess.length || data.photos.some((p) => p.category === 'noaccess') ? (
        <>
          {bookNotes(job.survey_booking_notes)}
          {(noAccess.length > 0 || data.photos.some((p) => p.category === 'noaccess')) && <Text style={{ fontSize: 11.5, fontWeight: '700', color: base.slate, letterSpacing: 0.4, marginTop: job.survey_booking_notes ? 8 : 0 }}>NO ACCESS VISITS ({noAccess.length})</Text>}
          {noAccess.map((v, i) => <Text key={i} style={{ fontSize: 13, color: base.ink, marginTop: 3 }}>{fmt(v.at)}{v.by_name ? ` · ${v.by_name}` : ''}{v.visit === 'works' ? ' · works visit' : ''}{v.note ? ` — ${v.note}` : ''}</Text>)}
          {(noAccess.length > 0 || data.photos.some((p) => p.category === 'noaccess')) && <View style={{ marginTop: 6 }}><RepairPhotos jobId={job.id} photos={data.photos} cats={['noaccess']} onChanged={refresh} canAdd={mgr} addLabel="📷 Card Left" /></View>}
        </>
      ) : undefined, <>{btn('book', job.survey_booking_date ? 'Change' : 'Book In', !!job.survey_booking_date)}{(st === 'booked' || st === 'works_booked') && btn('noaccess', 'Record No Access')}</>)}
      {ladder(3, 'Attended', job.survey_date ? `${fmt(job.survey_date)}${surveyor ? ` · ${surveyor}` : ''}` : 'Not yet', (
        <>
          {!!job.fault_description && <><Muted style={{ fontSize: 11.5 }}>Description Of Fault Found</Muted>{txt(job.fault_description)}</>}
          {!!(job.repair_description || job.survey_notes) && <><Muted style={{ fontSize: 11.5, marginTop: 6 }}>Description Of Repair Required</Muted>{txt(job.repair_description || job.survey_notes)}</>}
          {job.completed_in_visit != null && <Muted style={{ marginTop: 6 }}>Completed repair whilst in attendance: {job.completed_in_visit ? 'Yes' : 'No — needs a quote'}</Muted>}
          {/* Photos are added in Update Status (Andy, 8 Nov 2026); here they're shown. */}
          {visitPhotos.length > 0 && <View style={{ marginTop: 6 }}><RepairPhotos jobId={job.id} photos={data.photos} cats={['survey', 'access']} onChanged={refresh} canAdd={false} /></View>}
          {docs.some((d) => d.k === 'survey') && <View style={{ alignSelf: 'flex-start', marginTop: 8 }}><Button small kind="ghost" busy={busy === 'survey'} title="📄 Booking Visit Report" onPress={() => void openDoc('survey')} /></View>}
        </>
      ), btn('attend', 'Update Status', !!job.survey_date))}
      {fin ? ladder(4, 'Quote', quote ? `${gbp(quote.total)}${job.variation_issued_at ? ` · sent ${fmt(job.variation_issued_at)}` : ' · not sent'}` : 'Not priced', quote ? <Muted>Net {gbp(quote.net)}{quote.vatPct ? ` + VAT ${gbp(quote.vat)}` : ''}</Muted> : undefined, <>{btn('quote', quote ? 'Open The Quote' : 'Price It', !!quote)}</>)
        : ladder(4, 'Quote', job.variation_issued_at ? `Quote Submitted ${fmt(job.variation_issued_at)}` : st === 'quote_needed' ? 'With Finance to price' : '—')}
      {ladder(5, 'Approved', job.quote_approved ? `${fmt(job.quote_approved_at)}${job.self_authorized ? ' · self-authorised' : ''}` : job.quote_approved === false ? 'Rejected' : 'Waiting', job.quote_decided_online_at ? <Muted>{job.quote_approved ? 'Approved' : 'Turned down'} online by the client{job.quote_decision_note ? ` — ${job.quote_decision_note}` : ''}</Muted> : undefined,
        <>{st === 'awaiting_approval' && btn('quoteupd', 'Quote Update ▾', false)}</>)}
      {/* Repair Booked (Andy, 7 Nov 2026): the repair's date, and any other trades with their booked dates and photos of their completed works. */}
      {ladder(6, 'Repair Booked', bookLine(job.works_booking_date, job.works_booking_slot, job.works_booking_assigned_to, job.quote_approved ? 'Not booked yet' : '—'), (
        <>
          {!!job.works_booking_notes && <View style={{ marginBottom: 8 }}>{bookNotes(job.works_booking_notes)}</View>}
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: base.slate, letterSpacing: 0.4, marginTop: 2 }}>OTHER TRADES</Text>
          {trades.length ? trades.map((tr) => (
            <View key={tr.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EEF0F2' }}>
              <Pressable disabled={!mgr} accessibilityRole={mgr ? 'button' : undefined} accessibilityLabel={`${tr.trade}, change`} onPress={() => setTradeEdit(tr)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: base.ink }}>{tr.trade}{tr.done ? '  ✓ Done' : ''}</Text>
                <Text style={{ fontSize: 12.5, color: mgr ? base.blue : base.slate }}>{tr.date ? `Booked ${fmt(tr.date)}` : 'No date yet'}{mgr ? ' ›' : ''}</Text>
              </Pressable>
              <View style={{ marginTop: 6 }}><RepairPhotos jobId={job.id} photos={data.photos} cats={['trade']} trade={tr.id} onChanged={refresh} canAdd={mgr} addLabel={`📷 ${tr.trade} Completed`} /></View>
            </View>
          )) : <Muted style={{ marginTop: 2 }}>None needed.</Muted>}
          {mgr && <View style={{ alignSelf: 'flex-start', marginTop: 8 }}><Button small kind="ghost" title="+ Add Other Trade" onPress={() => setTradeEdit({})} /></View>}
        </>
      ), <>{(st === 'approved' || st === 'works_booked') && btn('works', st === 'works_booked' ? 'Change The Repair Booking' : 'Book The Repair', st === 'works_booked')}</>)}
      {ladder(7, 'Works Done', job.works_completed_date ? `${fmt(job.works_completed_date)}${job.closed ? ' · checked' : ''}` : 'Not yet', (
        <>
          {/* Notes on the works, any time (not only when marking it complete). */}
          {mgr ? (
            <>
              <TextInput value={wNotes ?? (job.works_notes || '')} onChangeText={setWNotes} placeholder="Notes On The Works" multiline accessibilityLabel="Works done notes"
                style={{ minHeight: 56, borderWidth: 1, borderColor: base.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: base.ink, backgroundColor: base.card }} />
              {wNotes != null && wNotes !== (job.works_notes || '') && <View style={{ alignSelf: 'flex-start', marginTop: 6 }}><Button small busy={busy === 'wn'} title="Save Notes" onPress={async () => { setBusy('wn'); const ok = await save({ works_notes: wNotes.trim() || null }); setBusy(''); if (ok) setWNotes(null); }} /></View>}
            </>
          ) : txt(job.works_notes)}
          <View style={{ marginTop: 8 }}><RepairPhotos jobId={job.id} photos={data.photos} cats={['completion', 'progress', 'scaffold']} onChanged={refresh} canAdd={mgr} addLabel="📷 Completion Photos" /></View>
          {/* The Completed Works report (a PDF), and the photos sent to OneDrive one by one (Completion Photos), the report in the job folder. */}
          {job.works_completed && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <Button small kind="ghost" busy={busy === 'completion'} title="📄 Completed Works Report" onPress={() => void openDoc('completion')} />
              {mgr && <Button small kind="ghost" busy={busy === 'od'} title="☁ Send To OneDrive" onPress={() => void run('odsend')} />}
            </View>
          )}
        </>
      ), <>{!job.works_completed && btn('done', 'Mark Job As Complete')}{job.works_completed && !job.closed && btn('check', 'Checked — Ready To Invoice', false)}</>)}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: job.job_number || label }} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {!!job.job_number && <Text style={{ fontSize: 12, fontWeight: '700', color: base.ink, borderWidth: 1.5, borderColor: base.ink, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>{job.job_number}</Text>}
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: base.ink }}>{label}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          <Text style={{ fontSize: 11.5, fontWeight: '600', color: base.ink, backgroundColor: '#F0F1F4', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' }}>{STAGE_LABEL[st]}</Text>
          {!!job.priority && <Text style={{ fontSize: 11.5, fontWeight: '600', color: base.ink, backgroundColor: '#F0F1F4', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' }}>{job.priority}</Text>}
          {!!due && isOpen(job) && <Text style={{ fontSize: 11.5, fontWeight: '600', color: late ? '#fff' : base.ink, backgroundColor: late ? base.ink : '#F0F1F4', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' }}>{due}</Text>}
          {noAccess.length > 0 && <Text style={{ fontSize: 11.5, fontWeight: '600', color: base.ink, backgroundColor: '#F0F1F4', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' }}>No Access ×{noAccess.length}</Text>}
          {job.on_hold && <Text style={{ fontSize: 11.5, fontWeight: '600', color: '#B45309', backgroundColor: '#FDF1E0', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' }}>On Hold</Text>}
          {!!otherTradesOf(job) && <Text style={{ fontSize: 11.5, fontWeight: '600', color: base.ink, backgroundColor: '#F0F1F4', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' }}>{otherTradesOf(job)}{job.other_trades_date ? ` ${fmt(job.other_trades_date)}` : ''}</Text>}
        </View>
      </Card>
      <StageBar steps={fin ? BAR : BAR.slice(0, BAR_PROJECTS)} step={bar.step} skip={bar.skipQuote ? [4, 5, 6] : []} rejected={bar.rejected} rejectedLabel="Rejected by the client" next={client ? undefined : nextHint(job, mgr, fin)} />
      {!client && <FinTabs items={[['job', 'Job'], ['repair', 'Work Summary']]} value={tab} onChange={(k) => setTab(k as 'job' | 'repair')} />}

      {tab === 'repair' && !client ? repairTab : (
        <>
          {/* Half and half (Andy, 8 Nov 2026): the client on the left, the works order on the right. */}
          <Card style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable disabled={!mgr || client || !inProjects} accessibilityRole={mgr && !client && inProjects ? 'button' : undefined} accessibilityLabel="Client" onPress={() => router.push(`/sites/${siteId}/client` as never)}
              style={{ flex: 1, minWidth: 0, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C9CDD3', borderRadius: 10, padding: 10, justifyContent: 'center' }}>
              <Text style={{ fontSize: 11.5, fontWeight: '700', color: base.slate, letterSpacing: 0.4, marginBottom: 4 }}>CLIENT</Text>
              <Text numberOfLines={2} style={{ fontSize: 13, fontWeight: '600', color: base.ink }}>{site?.client_name || '—'}</Text>
              {!!site?.client_contact_name && <Text numberOfLines={1} style={{ fontSize: 12, color: base.slate, marginTop: 2 }}>{site.client_contact_name}</Text>}
            </Pressable>
            {/* The works order (Andy, 8 Nov 2026): a one-line heading, then just its number, and View for the PDF. */}
            <View style={{ flex: 1, minWidth: 0, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C9CDD3', borderRadius: 10, padding: 10, justifyContent: 'center' }}>
              <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: '700', color: base.slate, letterSpacing: 0.4, marginBottom: 4 }}>WORKS ORDER</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: '600', color: base.ink }}>{job.job_number || '—'}</Text>
                {job.work_order_path
                  ? <Text accessibilityRole="button" accessibilityLabel="View the works order" onPress={async () => { const u = await openDocLink('site-photos', job.work_order_path as string); if (u) viewDoc(u, String(job.work_order_name || 'Works Order')); else toast('Could not open the file.'); }} style={{ fontSize: 13, fontWeight: '600', color: base.blue }}>View ›</Text>
                  : <Muted style={{ fontSize: 12 }}>No PDF</Muted>}
              </View>
            </View>
          </Card>
          <Card>
            <KV k="Address" v={label} />
            <KV k="Call-Out" v={job.description || '—'} />
            {(!!job.priority || !!dueOf(job)) && <KV k="Priority" v={[job.priority, dueOf(job) ? `${isOpen(job) ? dueLabel(job) : `Due ${fmt(dueOf(job)?.toISOString())}`}` : ''].filter(Boolean).join(' · ')} onPress={mgr && !client ? () => setForm('details') : undefined} />}
            <KV k="Resident" v={[job.tenant_name, job.tenant_phone].filter(Boolean).join(' · ') || '—'} onPress={job.tenant_phone && !client ? () => void Linking.openURL(`tel:${String(job.tenant_phone).replace(/\s+/g, '')}`) : undefined} />
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
              {/* Booking Date (Andy, 8 Nov 2026): a manager taps it to change the booking — date, time slot, operative and notes. */}
              {([['Booking Date', bookedFor(job) ? [fmt(bookedFor(job)), slotShort(bookedSlot(job)), bookedTo(job) && !client ? nameOf(people, bookedTo(job)).split(' ')[0] : ''].filter(Boolean).join(' · ') : mgr ? 'Book In' : '—', mgr && !client && st !== 'rejected' ? (job.quote_approved === true ? 'works' : 'book') : null], ['Attended', job.survey_date ? [fmt(job.survey_date), surveyor && !client ? surveyor.split(' ')[0] : ''].filter(Boolean).join(' · ') : mgr && !client ? 'Update Status' : '—', mgr && !client && st !== 'rejected' ? 'attend' : null], ['Completed', fmt(job.works_completed_date) || '—', null]] as [string, string, Form][]).map(([l, v, f]) => (
                <Pressable key={l} disabled={!f} onPress={() => setForm(f)} accessibilityRole={f ? 'button' : undefined} accessibilityLabel={f ? `${l}: ${v}. Change` : undefined}
                  style={{ flex: 1, backgroundColor: '#F6F7F9', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 8 }}>
                  <Text style={{ fontSize: 10.5, fontWeight: '600', color: base.slate }}>{l}</Text>
                  <Text numberOfLines={2} style={{ fontSize: 12.5, fontWeight: '700', color: f ? base.blue : base.ink }}>{v}{f ? ' ›' : ''}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
          {fin && (
            <Card>
              <Text style={{ fontSize: 11.5, fontWeight: '700', color: base.slate, letterSpacing: 0.4, marginBottom: 8 }}>MONEY</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {/* Tap one for the detail (Andy, 8 Nov 2026): the quote, or the costs broken down with the profit. */}
                {([['Quoted', quote ? gbp(quote.net) : 'Not Priced', 'quote'], ['Costs', gbp(costs), 'costs'], ['Profit', profit != null ? `${gbp(profit)}${pct != null ? ` · ${pct}%` : ''}` : '—', 'costs']] as [string, string, 'quote' | 'costs'][]).map(([l, v, k]) => (
                  <Pressable key={l} accessibilityRole="button" accessibilityLabel={`${l}: ${v}`} onPress={() => setMoneyPop(k)} style={{ flex: 1, backgroundColor: '#F6F7F9', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 8 }}>
                    <Text style={{ fontSize: 10.5, fontWeight: '600', color: base.slate }}>{l}</Text>
                    <Text numberOfLines={2} style={{ fontSize: 13, fontWeight: '700', color: l === 'Profit' && profit != null && profit < 0 ? '#C0392B' : base.blue }}>{v} ›</Text>
                  </Pressable>
                ))}
              </View>
              {ordered > 0 && <Muted style={{ marginTop: 6 }}>Also ordered, not invoiced yet: {gbp(ordered)}</Muted>}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <Text style={{ flex: 1, fontSize: 13, color: base.ink }}>{job.invoice_id ? `Invoice ${inv?.number || '(draft)'} · ${inv?.status === 'paid' ? 'Paid' : inv?.status === 'draft' ? 'Draft' : 'Issued'}` : st === 'done' ? 'Not invoiced yet' : 'Invoice once the works are done'}</Text>
                {job.invoice_id ? btn('openinv', 'Open Invoice') : st === 'done' ? <Button key="inv" small busy={busy === 'inv'} title="Raise Invoice" onPress={() => void run('invoice')} /> : null}
              </View>
            </Card>
          )}
          {/* The visit's report and photos, once they're in (Andy, 8 Nov 2026); then the completed works. */}
          {(docs.some((d) => d.k === 'survey') || visitPhotos.length > 0 || !!job.works_completed) && (
            <Card>
              <Text style={{ fontSize: 11.5, fontWeight: '700', color: base.slate, letterSpacing: 0.4, marginBottom: 8 }}>REPORTS & PHOTOS</Text>
              {(docs.some((d) => d.k === 'survey') || visitPhotos.length > 0) && (
                <View>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: base.ink }}>Attendance{job.survey_date ? ` · ${fmt(job.survey_date)}` : ''}{surveyor && !client ? ` · ${surveyor}` : ''}</Text>
                  {!!job.fault_description && <><Muted style={{ fontSize: 11.5, marginTop: 4 }}>Fault Found</Muted>{txt(job.fault_description)}</>}
                  {!!(job.repair_description || job.survey_notes) && <><Muted style={{ fontSize: 11.5, marginTop: 4 }}>Repair Required</Muted>{txt(job.repair_description || job.survey_notes)}</>}
                  {visitPhotos.length > 0 && <View style={{ marginTop: 8 }}><RepairPhotos jobId={job.id} photos={data.photos} cats={['survey', 'access']} onChanged={refresh} canAdd={false} /></View>}
                  {docs.some((d) => d.k === 'survey') && <View style={{ alignSelf: 'flex-start', marginTop: 6 }}><Button small kind="ghost" busy={busy === 'survey'} title="📄 Booking Visit Report" onPress={() => void openDoc('survey')} /></View>}
                </View>
              )}
              {!!job.works_completed && (
                <View style={{ marginTop: docs.some((d) => d.k === 'survey') || visitPhotos.length > 0 ? 12 : 0, paddingTop: docs.some((d) => d.k === 'survey') || visitPhotos.length > 0 ? 10 : 0, borderTopWidth: docs.some((d) => d.k === 'survey') || visitPhotos.length > 0 ? 1 : 0, borderTopColor: '#EEF0F2' }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: base.ink }}>Completed Works{job.works_completed_date ? ` · ${fmt(job.works_completed_date)}` : ''}</Text>
                  {txt(job.works_notes)}
                  {data.photos.some((p) => !p.deleted_at && !p.trade_id && ['completion', 'progress', 'scaffold'].includes(p.category)) && <View style={{ marginTop: 8 }}><RepairPhotos jobId={job.id} photos={data.photos} cats={['completion', 'progress', 'scaffold']} onChanged={refresh} canAdd={false} /></View>}
                  <View style={{ alignSelf: 'flex-start', marginTop: 6 }}><Button small kind="ghost" busy={busy === 'completion'} title="📄 Completed Works Report" onPress={() => void openDoc('completion')} /></View>
                </View>
              )}
            </Card>
          )}
          {docs.some((d) => d.k === 'quote') && (
            <Card>
              <Text style={{ fontSize: 11.5, fontWeight: '700', color: base.slate, letterSpacing: 0.4, marginBottom: 8 }}>QUOTE</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button small kind="ghost" busy={busy === 'quote'} title="📄 Quote" onPress={() => void openDoc('quote')} />
              </View>
            </Card>
          )}
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ flex: 1, fontSize: 11.5, fontWeight: '700', color: base.slate, letterSpacing: 0.4 }}>NOTES</Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: base.ink, backgroundColor: '#F0F1F4', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' }}>Client Can See</Text>
            </View>
            {notes.length ? notes.map((n) => (
              <View key={n.id} style={{ paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#EEF0F2' }}>
                <Text style={{ fontSize: 11, color: base.slate }}>{n.author_name || nameOf(people, n.author_id)} · {fmt(n.created_at)}</Text>
                <Text style={{ fontSize: 13, color: base.ink, marginTop: 2 }}>{n.body}</Text>
              </View>
            )) : <Muted>No notes yet.</Muted>}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8 }}>
              <TextInput value={note} onChangeText={setNote} placeholder="Add a note" multiline accessibilityLabel="Add a note" style={{ flex: 1, minHeight: 40, maxHeight: 100, borderWidth: 1, borderColor: base.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, color: base.ink, backgroundColor: base.card }} />
              <Button small title="Add" busy={busy === 'note'} onPress={async () => { if (!note.trim()) return; setBusy('note'); const ok = await addRepairNote(me, job.id, note); setBusy(''); if (ok) { setNote(''); refresh(); } else toast('Could not add the note — try again.'); }} />
            </View>
          </Card>
        </>
      )}
      {mgr && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: space.xl }}>
          {st === 'awaiting_approval' && <Button title="Quote Update ▾" onPress={() => void run('quoteupd')} />}
          <Button title="Update ▾" busy={!!busy && busy !== 'note'} onPress={async () => { const k = await chooseAction('Update', updates()); if (k) void run(k); }} />
          {tab === 'job' && <Button kind="ghost" title="Work Summary ›" onPress={() => setTab('repair')} />}
          {/* Back to the job page from the Work Summary (Andy, 8 Nov 2026). */}
          {tab === 'repair' && <Button kind="ghost" title="‹ Job Page" onPress={() => setTab('job')} />}
        </View>
      )}

      {/* A booking (Andy, 8 Nov 2026): the date, the operative, a time slot and notes for the booking. */}
      {form === 'book' && (
        <FinForm title={job.survey_booking_date ? 'Change The Booking' : 'Book In'} initial={{ d: job.survey_booking_date || '', who: job.survey_booking_assigned_to || '', slot: job.survey_booking_slot || '', notes: job.survey_booking_notes || '' }} onClose={() => setForm(null)}
          fields={bookingFields}
          onSave={async (v) => {
            const d = String(v.d || '') || null, who = String(v.who || '') || null, slot = String(v.slot || '') || null, n = String(v.notes || '').trim() || null;
            const ev = await syncRepairEvent(me, siteId, job.survey_booking_event_id, d, `Booked In${slot ? ` (${slotShort(slot)})` : ''}: ${label}`, who ? [who] : []);
            return (await save({ survey_booking_date: d, survey_booking_assigned_to: who, survey_booking_slot: slot, survey_booking_notes: n, survey_booking_event_id: ev, ...(st === 'to_book' || st === 'booked' ? { job_status: 'To Survey' } : {}) })) ? null : 'Could not save.';
          }} />
      )}
      {form === 'works' && (
        <FinForm title={job.works_booking_date ? 'Change The Repair Booking' : 'Book The Repair'} initial={{ d: job.works_booking_date || '', who: job.works_booking_assigned_to || job.survey_booking_assigned_to || '', slot: job.works_booking_slot || '', notes: job.works_booking_notes || '' }} onClose={() => setForm(null)}
          fields={bookingFields}
          onSave={async (v) => {
            const d = String(v.d || '') || null, who = String(v.who || '') || null, slot = String(v.slot || '') || null, n = String(v.notes || '').trim() || null;
            const ev = await syncRepairEvent(me, siteId, job.works_booking_event_id, d, `Works${slot ? ` (${slotShort(slot)})` : ''}: ${label}`, who ? [who] : []);
            return (await save({ works_booking_date: d, works_booking_assigned_to: who, works_booking_slot: slot, works_booking_notes: n, works_booking_event_id: ev })) ? null : 'Could not save.';
          }} />
      )}
      {form === 'noaccess' && (
        <FinForm title="No Access" saveLabel="Record No Access" onClose={() => setForm(null)} note="Nobody in. The booking comes off (and the calendar) and the job goes back to be booked again. Add a photo of the card left on the Repair page."
          initial={{ note: '' }} fields={[{ k: 'note', label: 'What Happened', kind: 'multiline', ph: 'E.g. No answer, card left' }]}
          onSave={async (v) => { if (!(await recordNoAccess(me, job, String(v.note || '')))) return 'Could not save — try again.'; refresh(); return null; }} />
      )}
      {tradeEdit && (
        // Another trade on the job (scaffold, electrician…): its booked date, and done once their works are complete.
        <FinForm title={tradeEdit.id ? tradeEdit.trade || 'Other Trade' : 'Add Other Trade'} initial={{ t: tradeEdit.trade || '', d: tradeEdit.date || '', done: tradeEdit.done ? 'yes' : 'no' }} onClose={() => setTradeEdit(null)}
          fields={[{ k: 't', label: 'Trade', ph: 'E.g. Scaffold' }, { k: 'd', label: 'Booked For', kind: 'date', half: true }, { k: 'done', label: 'Their Works Complete?', kind: 'choice', half: true, options: [['no', 'No'], ['yes', 'Yes']] }]}
          onSave={async (v) => {
            const name = String(v.t || '').trim(); if (!name) return 'Say which trade.';
            const item: Trade = { id: tradeEdit.id || `t${Date.now().toString(36)}`, trade: name, date: String(v.d || '') || null, done: v.done === 'yes', done_at: v.done === 'yes' ? tradeEdit.done_at || new Date().toISOString() : null };
            const list = tradeEdit.id ? trades.map((x) => (x.id === tradeEdit.id ? item : x)) : [...trades, item];
            return (await save({ trades: list, ...tradesSummary(list) })) ? null : 'Could not save.';
          }}
          onDelete={tradeEdit.id ? async () => { const list = trades.filter((x) => x.id !== tradeEdit.id); return (await save({ trades: list, ...tradesSummary(list) })) ? null : 'Could not save.'; } : undefined} />
      )}
      {form === 'hold' && (
        <FinForm title="Put On Hold" initial={{ r: '' }} onClose={() => setForm(null)} fields={[{ k: 'r', label: 'Why?', ph: 'E.g. Resident away until 20 Nov' }]}
          onSave={async (v) => ((await save({ on_hold: true, on_hold_reason: String(v.r || '').trim() || null }, 'On hold')) ? null : 'Could not save.')} />
      )}
      {/* Update Status (Andy, 8 Nov 2026): what was found, what's needed, and the photos, all in one pop-up. A PM can delete the
          visit (recorded by mistake): the job goes back to Scheduled and its photos go to Deleted Photos, where they can be restored. */}
      {form === 'attend' && (
        <FinForm title="Update Status" initial={{ d: (job.survey_date || new Date().toISOString()).slice(0, 10), who: job.surveyed_by || photoOperative || '', fault: job.fault_description || '', repair: job.repair_description || job.survey_notes || '', done: job.completed_in_visit === true ? 'yes' : 'no' }} onClose={() => setForm(null)}
          fields={[{ k: 'd', label: 'Date Attended', kind: 'date', half: true }, { k: 'who', label: 'Attended By', kind: 'choice', half: true, options: [['', 'Not Chosen'], ...ops.map((p) => [p.id, p.name] as [string, string])] },
            { k: 'fault', label: 'Description Of Fault Found', kind: 'multiline' }, { k: 'repair', label: 'Description Of Repair Required', kind: 'multiline' }, { k: 'done', label: 'Completed Repair Whilst In Attendance?', kind: 'choice', options: [['no', 'No — Needs A Quote'], ['yes', 'Yes']] }]}
          extra={<View style={{ marginBottom: 6 }}><Muted style={{ fontWeight: '500', marginBottom: 4 }}>Photos</Muted><RepairPhotos jobId={job.id} photos={data.photos} cats={['survey', 'access']} onChanged={refresh} canAdd addLabel="📷 Upload Photos" /></View>}
          onSave={async (v) => {
            const dn = v.done === 'yes' ? true : v.done === 'no' ? false : null;
            // The date as picked; the time it was first recorded is kept when the day hasn't changed.
            const d = String(v.d || ''), when = !d ? job.survey_date || new Date().toISOString() : job.survey_date && job.survey_date.slice(0, 10) === d ? job.survey_date : new Date(`${d}T12:00:00`).toISOString();
            return (await save({ fault_description: String(v.fault || '').trim() || null, repair_description: String(v.repair || '').trim() || null, completed_in_visit: dn, survey_required: 'Y', survey_date: when, surveyed_by: String(v.who || '') || null, job_status: dn === false ? 'Surveyed - Awaiting Cost' : job.job_status })) ? null : 'Could not save.';
          }}
          {...(isFullManager(me) && (job.survey_date || job.survey_required === 'Y') && !job.quote_approved && !job.works_completed ? {
            deleteLabel: 'Delete Visit',
            deleteAsk: 'Delete this visit? What was found and the repair needed come off, and the job goes back to Scheduled. Its photos go to Deleted Photos, where they can be restored.',
            onDelete: async () => {
              for (const p of visitPhotos) await hideRepairPhoto(me, p.id);
              return (await save({ survey_date: null, surveyed_by: null, fault_description: null, repair_description: null, completed_in_visit: null, survey_completed: false, survey_required: 'N', job_status: 'To Survey' }, 'Visit deleted')) ? null : 'Could not delete — try again.';
            },
          } : {})} />
      )}
      {form === 'done' && (
        <FinForm title="Mark Job As Complete" initial={{ notes: wNotes ?? job.works_notes ?? '' }} onClose={() => setForm(null)} fields={[{ k: 'notes', label: 'Description Of Works Completed', kind: 'multiline' }]}
          onSave={async (v) => {
            const n = String(v.notes || '').trim(); if (!n) return 'Describe the works completed.';
            const when = job.works_completed_date || new Date().toISOString();
            const ev = await syncRepairEvent(me, siteId, job.works_completed_event_id, when.slice(0, 10), `Job Completed: ${label}`);
            return (await save({ works_completed: true, works_notes: n, works_completed_date: when, works_completed_event_id: ev, job_status: 'Awaiting Sign-off' }, 'Works done')) ? null : 'Could not save.';
          }} />
      )}
      {form === 'details' && (
        <FinForm title="Job Details" initial={{ job_number: job.job_number || '', address: job.address || '', description: job.description || '', tenant_name: job.tenant_name || '', tenant_phone: job.tenant_phone || '', priority: job.priority || '', due: dueOf(job) ? (dueOf(job) as Date).toISOString().slice(0, 10) : '' }} onClose={() => setForm(null)}
          note="Due: from the priority (e.g. Emergency 24 hours, 7 Days, Routine 28 days), or set a date."
          fields={[{ k: 'job_number', label: 'Works Order Number', half: true }, { k: 'priority', label: 'Priority', half: true, ph: 'E.g. 7 Days' }, { k: 'due', label: 'Due', kind: 'date', half: true }, { k: 'address', label: 'Address (With The Postcode)' }, { k: 'description', label: 'Call-Out', kind: 'multiline' }, { k: 'tenant_name', label: 'Resident Name', half: true }, { k: 'tenant_phone', label: 'Resident Contact Number', half: true }]}
          onSave={async (v) => {
            const s = (k: string) => String(v[k] || '').trim() || null;
            const address = s('address'); if (!address) return 'Enter an address.';
            // The due date: as typed if it was changed, else from the priority if that was changed.
            const was = dueOf(job) ? (dueOf(job) as Date).toISOString().slice(0, 10) : '', d = String(v.due || '');
            const dueAt = d && d !== was ? new Date(`${d}T17:00:00`).toISOString() : s('priority') !== (job.priority || null) ? dueFromPriority(s('priority'), job.created_at)?.toISOString() ?? null : undefined;
            const ok = await save({ job_number: s('job_number'), address, description: s('description'), tenant_name: s('tenant_name'), tenant_phone: s('tenant_phone'), priority: s('priority'), ...(dueAt !== undefined ? { due_at: dueAt } : {}) });
            if (ok && address !== job.address) void geocodeRepairJob(job.id, address);
            return ok ? null : 'Could not save.';
          }} />
      )}
      {moneyPop === 'quote' && (
        <Pop title="Quote" onClose={() => setMoneyPop('')} footer={(
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 }}>
            <Button small title={quote ? 'Open The Quote' : 'Price It'} onPress={() => { setMoneyPop(''); void run('quote'); }} />
            <Button small kind="ghost" title="Close" onPress={() => setMoneyPop('')} />
          </View>
        )}>
          {quote ? (
            <>
              <PopLine l="Net" v={gbp(quote.net)} />
              {!!quote.vatPct && <PopLine l={`VAT ${quote.vatPct}%`} v={gbp(quote.vat)} />}
              <PopLine l="Total" v={gbp(quote.total)} bold />
              <PopLine l="Sent To The Client" v={job.variation_issued_at ? fmt(job.variation_issued_at) : 'Not Yet'} />
              <PopLine l="Client’s Answer" v={job.quote_approved === true ? `Approved${job.quote_approved_at ? ` ${fmt(job.quote_approved_at)}` : ''}` : job.quote_approved === false ? 'Rejected' : 'Waiting'} />
            </>
          ) : <Muted>Not priced yet.</Muted>}
        </Pop>
      )}
      {moneyPop === 'costs' && (
        <Pop title={`Costs And Profit · ${job.job_number || label}`} onClose={() => setMoneyPop('')} footer={(
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 10 }}>
            <Button small title="See Every Cost" onPress={() => { setMoneyPop(''); router.push(`/fin/job/${siteId}/costs?sub=${job.id}` as never); }} />
            <Button small kind="ghost" title="+ Add A Cost" onPress={() => { setMoneyPop(''); router.push(`/fin/job/${siteId}/costs?sub=${job.id}&add=1` as never); }} />
            {fc && bookable(fc.lines).length > 0 && <Button small kind="ghost" title="Book A Cost To This Job ▾" onPress={async () => {
              const m = await bookCostTo(fc.lines, job.id, job.job_number || label); if (m) toast(m);
              void qc.invalidateQueries({ queryKey: ['finBook'] });
            }} />}
          </View>
        )}>
          {/* Excl. VAT. The value is what's been invoiced, else the quote. */}
          <PopLine l={job.invoice_id && inv ? 'Invoiced' : 'Quoted'} v={value != null ? gbp(value) : '—'} bold />
          {([['Materials', 'materials'], ['Labour', 'labour'], ['Plant', 'plant'], ['Subcontract', 'subcontract'], ['Other', 'other']] as [string, string][]).map(([l, c]) => (
            <PopLine key={c} l={l} v={gbp(byCat(c))} onPress={byCat(c) ? () => { setMoneyPop(''); router.push(`/fin/job/${siteId}/costs?sub=${job.id}${c === 'other' ? '' : `&type=${c}`}` as never); } : undefined} />
          ))}
          <PopLine l="Costs" v={gbp(costs)} bold />
          {ordered > 0 && <PopLine l="Ordered, Not Invoiced Yet" v={gbp(ordered)} />}
          <PopLine l="Profit" v={profit != null ? gbp(profit) : '—'} bold tone={profit != null && profit < 0 ? '#C0392B' : undefined} />
          {pct != null && <PopLine l="Margin" v={`${pct}%`} />}
          <Muted style={{ marginTop: 6, fontSize: 12 }}>Excl. VAT. Costs booked to this job: purchase invoices, labour, plant, subcontractors and other costs. A cost for the whole contract isn’t in here until it’s booked to the job.</Muted>
        </Pop>
      )}
    </ScrollView>
  );
}
