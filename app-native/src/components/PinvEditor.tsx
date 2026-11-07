// The purchase invoice screen (Andy, 5 Nov 2026, a mix of Construction Manager and Coreloops): the invoice beside it on a
// laptop, then supplier, invoice number, dates, our PO and the project, then the lines one by one (qty, unit, rate to
// 3 decimal places, discount, VAT, project or a split across projects by %, cost code), checks and totals.
// Used for Add Manually (blank: attach the PDF, photo or scan) and for an emailed invoice in the inbox (filled in from
// what was read; if it couldn't be read, the same blank form with a plain note, nothing lost).
// 6 Nov 2026 (Andy): a saved invoice opens on this same screen (no separate read-only page). The buttons are Save (it
// waits in Needs Checking), Save & Query To PM (the job's PM is asked) and Approve Invoice: only Approve posts to Xero.
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { DateBox } from '@/components/DateField';
import { DocSplit } from '@/components/DocSplit';
import { viewDoc } from '@/components/DocViewer';
import { blankLine, InvoiceLines } from '@/components/InvoiceLines';
import { pickJob } from '@/components/FinSales';
import { PinvStages } from '@/components/PinvStages';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Check, Muted } from '@/components/ui';
import { fdb } from '@/data/finance';
import { FinEmailPopup } from '@/components/FinEmailPopup';
import { addPinv, duplicateOf, emailPiQuery, piLabel, setPinvStatus, tellPmOfPi } from '@/data/finPurchase';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { checkAll, loadReadContext, readOne, saveLinesOnInvoice } from '@/data/invoiceRead';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { clearPendingAct, peekPendingAct } from '@/lib/pendingAct';
import { addDays, finBlocked, fdate, jobTag, money, round2, today } from '@/lib/rules/finance';
import { allocProblem, codedParts, linesNet, linesVat, type RLine } from '@/lib/rules/invoiceRead';
import { checkAgainstPo } from '@/lib/rules/poMatch';
import { supabase } from '@/lib/supabase';
import { base, page, radius, useDesk } from '@/theme/theme';

type Row = Record<string, any>;
type File = { uri: string; name: string; mimeType?: string | null };
const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a: object) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
const WHY: Record<string, string> = { bad_site: 'that project isn’t one of yours', bad_po: 'that PO wasn’t found', bad_amount: 'check the amounts', not_allowed: 'you need Finance access to file invoices' };
const lab = { fontSize: 10.5, fontWeight: '600' as const, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: '#6b7280', marginBottom: 4 };
const fieldBox = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 12, height: 42, justifyContent: 'center' as const, backgroundColor: base.card };

/** The project with the most of the invoice on it (where the invoice is filed; the rest goes on as a split). */
const mainSiteOf = (lines: RLine[], fallback: string | null) => {
  const by: Record<string, number> = {}; codedParts(lines).forEach((p) => { by[p.site_id] = (by[p.site_id] || 0) + p.amount; });
  return Object.keys(by).sort((a, b) => by[b] - by[a])[0] || fallback;
};

/** start: from a statement's Add Missing Invoice — the supplier, number, gross amount and date already known.
 *  pi: a saved invoice, opened to check, change, query or approve; below: its conversation, Xero and paid rows. */
export function PinvEditor({ inbox, siteId: site0, poId: po0, start, pi, below, buttons, startEdit }: { inbox?: Row | null; siteId?: string; poId?: string; start?: { supplier?: string; no?: string; amount?: number; date?: string }; pi?: Row | null; below?: ReactNode; buttons?: ReactNode; startEdit?: boolean }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const desk = useDesk();
  // The PDF sits beside the form on a wide laptop screen (DocSplit); otherwise a button opens it (Andy, 7 Nov 2026).
  const { width: winW } = useWindowDimensions();
  const splitOn = Platform.OS === 'web' && winW >= 1100;
  const { data: sites = [] } = useSites();
  const ex = (inbox?.extracted || {}) as Row;
  // In Xero or paid: shown as it is, not changed here.
  const locked = !!pi && (!!pi.xero_id || !!pi.paid_on);
  // A saved invoice opens locked; Edit at the bottom opens it for changes (Andy, 6 Nov 2026).
  const [editing, setEditing] = useState(!pi || !!startEdit);
  // Query With Supplier: the saved invoice and who it goes to, while the email pop-up is open.
  const [mail, setMail] = useState<{ row: Row; to: string } | null>(null);
  const shut2 = !editing || locked;
  // An expense receipt sent in from a job (7 Nov 2026): typed in from the photo, not read.
  const isRcpt = !!inbox && ex.receipt === true;
  const unread = !!inbox && !isRcpt && !(Array.isArray(ex.lines) && ex.lines.length);
  const [supplier, setSupplier] = useState<string>(pi ? pi.supplier_name || '' : inbox ? inbox.supplier_override || ex.supplier || '' : start?.supplier || '');
  const [no, setNo] = useState<string>(pi ? pi.invoice_no || '' : ex.invoice_no || ex.doc_number || start?.no || '');
  const [date, setDate] = useState<string>(pi ? pi.invoice_date || today() : ex.date || ex.doc_date || start?.date || (isRcpt && inbox?.received_at ? String(inbox.received_at).slice(0, 10) : today()));
  const [due, setDue] = useState<string>(pi ? pi.due_date || '' : ex.due_date || '');
  const [siteId, setSiteId] = useState<string | null>(pi?.site_id || site0 || inbox?.site_id || null);
  const [poId, setPoId] = useState<string>(pi ? pi.po_id || '' : po0 || inbox?.po_id || '');
  const [receipt, setReceipt] = useState(pi?.kind === 'receipt' || isRcpt);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dupOk, setDupOk] = useState('');
  const [showWhy, setShowWhy] = useState(false);
  const [noteShut, setNoteShut] = useState(false); // the note at the top closes with its ✕ (Andy, 6 Nov 2026)
  const shut = <Pressable accessibilityRole="button" accessibilityLabel="Close the note" hitSlop={8} onPress={() => setNoteShut(true)} style={{ position: 'absolute', top: 8, right: 10 }}><Text style={{ fontSize: 16, color: base.slate }}>✕</Text></Pressable>;
  // Lines as read, or one line for the amount read (an unread invoice: one blank line to fill in).
  // A saved invoice's lines, or one line for its total when it was saved without lines.
  const savedLines = (p: Row): RLine[] => { const pl = ((p.lines || []) as RLine[]).filter((l) => l && (l.kind || 'item') !== 'total'); return pl.length ? pl : [{ ...blankLine(p.site_id), description: p.description || 'Invoice total', unit_price: Number(p.net || 0), amount: Number(p.net || 0), cost_code: p.cost_code || 'materials', vat_rate: Number(p.net) ? Math.round((Number(p.vat || 0) / Number(p.net)) * 100) : 20 }]; };
  const [lines, setLines] = useState<RLine[]>(() => (pi ? savedLines(pi)
    // The job chosen on the list goes on every line that hasn't one (Andy, 6 Nov 2026).
    : Array.isArray(ex.lines) && ex.lines.length ? (ex.lines as RLine[]).map((l) => (l.site_id || l.alloc?.length || !inbox?.site_id ? l : { ...l, site_id: inbox.site_id }))
    : isRcpt && !ex.lines ? [{ ...blankLine(site0 || inbox?.site_id), description: String(ex.note || (ex.category === 'fuel' ? `Fuel${ex.label ? ` — ${ex.label}` : ''}` : ex.label ? `Expenses — ${ex.label}` : 'Expenses')), cost_code: ex.category === 'fuel' ? 'overheads' : ex.category === 'other' ? 'other' : 'materials', ...(ex.net != null ? { unit_price: Number(ex.net), amount: Number(ex.net) } : {}) }]
    : ex.net != null ? [{ ...blankLine(site0 || inbox?.site_id), description: 'Invoice total', unit_price: Number(ex.net), amount: Number(ex.net) }]
    : start?.amount ? [{ ...blankLine(site0), description: 'Invoice total', unit_price: round2(start.amount / 1.2), amount: round2(start.amount / 1.2) }] : [blankLine(site0 || inbox?.site_id)]));
  const { data: sups = [] } = useQuery({ queryKey: ['finSupNames', me?.org_id], enabled: !!me?.org_id, queryFn: async () => (((await fdb.from('fin_suppliers').select('name').eq('org_id', me?.org_id as string).order('name')).data as Row[] | null) ?? []).map((x) => String(x.name || '')).filter(Boolean) });
  const { data: people } = usePeople();
  // Who a queried invoice is waiting on: the PM the last query went to.
  const { data: askedPm } = useQuery({ queryKey: ['finPiAsked', pi?.id, pi?.status], enabled: pi?.status === 'query', queryFn: async () => ((await fdb.from('messages').select('recipient_id').eq('related_id', pi?.id as string).eq('kind', 'pi_query').order('created_at', { ascending: false }).limit(1)).data as Row[] | null)?.[0]?.recipient_id as string | undefined ?? null });
  const { data: ctx } = useQuery({ queryKey: ['finReadCtx', me?.org_id], enabled: !!me?.org_id, queryFn: () => loadReadContext(me?.org_id as string) });
  const { data: pos = [] } = useQuery({ queryKey: ['finInboxPos', siteId], enabled: !!siteId, queryFn: async () => ((await fdb.from('purchase_orders').select('id,number,supplier_name,value,status').eq('site_id', siteId as string).neq('status', 'cancelled').order('created_at', { ascending: false })).data as Row[] | null) ?? [] });
  // The PO's lines, to check the invoice against line by line (Andy, 6 Nov 2026).
  const { data: poFull } = useQuery({ queryKey: ['finPoItems', poId], enabled: !!poId, queryFn: async () => ((await fdb.from('purchase_orders').select('id,number,items,value').eq('id', poId).maybeSingle()).data as Row | null) });
  // From the list's Query Supplier: the email pop-up opens once the screen is ready.
  const [wantQuery, setWantQuery] = useState<'supplier' | 'approve' | ''>(() => peekPendingAct(pi?.id || inbox?.id));
  if (!me) return null;
  const checks = ctx ? checkAll(lines, supplier, ctx) : [];
  const vsPo = poId && poFull ? checkAgainstPo(lines, (poFull.items || []) as never, poFull.number || 'the PO') : null;
  const net = linesNet(lines), vat = linesVat(lines), total = round2(net + vat);
  const dearer = checks.filter((c) => c.state === 'over').length;
  const readTot = ex.total != null ? Number(ex.total) : null;
  const site = (id?: string | null) => sites.find((s) => s.id === id);
  const unedit = () => {
    if (!pi) return;
    setSupplier(pi.supplier_name || ''); setNo(pi.invoice_no || ''); setDate(pi.invoice_date || today()); setDue(pi.due_date || ''); setSiteId(pi.site_id || null); setPoId(pi.po_id || ''); setReceipt(pi.kind === 'receipt'); setFile(null);
    setLines(savedLines(pi)); setEditing(false);
  };
  const refresh = () => ['finInbox', 'finPurchases', 'finOverview', 'finBook', 'finPo', 'finPinv'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));

  const chooseSupplier = async () => {
    const k = await chooseAction('Who is the invoice from?', [...sups.map((n) => ({ key: `s:${n}`, label: `${n === supplier ? '✓ ' : ''}${n}` })), { key: 'type', label: '✏️ Type a name' }]);
    if (!k) return;
    const name = k === 'type' ? (await promptText('Supplier name', supplier))?.trim() : k.slice(2);
    if (name) setSupplier(name);
  };
  const chooseSite = async () => { const s = await pickJob('Which project is it for?', sites.filter((x) => x.status !== 'closed')); if (s) { setSiteId(s); setPoId(''); setLines(lines.map((l) => (l.site_id || l.alloc ? l : { ...l, site_id: s }))); } };
  const choosePo = async () => { const k = await chooseAction('Allocate To PO', [{ key: '-', label: 'No PO' }, ...pos.map((p) => ({ key: p.id, label: `${p.number} · ${p.supplier_name || ''}${p.value != null ? ` · ${money(p.value)}` : ''}` }))]); if (k) setPoId(k === '-' ? '' : k); };
  const attach = async () => { const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) setFile({ uri: r.assets[0].uri, name: r.assets[0].name, mimeType: r.assets[0].mimeType }); };

  // Everything that has to be right before it's saved; null when it's fine.
  const problem = (): string | null => {
    if (!supplier.trim()) return 'Choose the supplier.';
    if (!receipt && !no.trim()) return 'Enter the invoice number.';
    if (!lines.length) return 'Add at least one line.';
    for (const [k, l] of lines.entries()) {
      if (!l.alloc?.length && !l.site_id) return `Choose the project on line ${k + 1}.`;
      const ap = allocProblem(l); if (ap) return `Line ${k + 1}: ${ap}`;
    }
    if (!(net !== 0)) return 'The lines come to £0 — put in the amounts.';
    return null;
  };
  /** Saves what's on the screen: a new invoice, an inbox one filed, or changes to a saved one. */
  const persist = async (): Promise<{ id: string; fresh: boolean; flags: string[] } | null> => {
    const p = problem(); if (p) { toast(p); return null; }
    const main = mainSiteOf(lines, siteId); if (!main) { toast('Choose the project.'); return null; }
    const flags: string[] = [];
    if (dearer) flags.push(`${dearer} line${dearer === 1 ? ' is' : 's are'} dearer than the quote or price list`);
    if (vsPo) flags.push(...vsPo.flags); // dearer than the PO, more than ordered, or not on it → Needs Checking
    if (readTot != null && Math.abs(readTot - total) >= 0.5) flags.push(`the lines come to ${money(total)} but the invoice says ${money(readTot)}`);
    if (pi) {
      const patch: Row = { supplier_name: supplier.trim(), invoice_no: no.trim() || null, invoice_date: date || today(), due_date: due || addDays(date || today(), 30), site_id: main, po_id: poId || null, no_po: !poId, net, vat, total, description: lines[0]?.description || null, cost_code: lines[0]?.cost_code || 'materials', kind: receipt ? 'receipt' : 'invoice' };
      if (file) {
        const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
        const up = await supabase.storage.from('finance-docs').upload(`${me.org_id}/${main}/purchase/${rid}-${file.name.replace(/[^a-z0-9.-]+/gi, '_').slice(-80)}`, await (await fetch(file.uri)).arrayBuffer(), { contentType: file.mimeType || 'application/octet-stream' });
        if (!up.error) { patch.file_path = up.data.path; patch.file_name = file.name; }
      }
      if (!(await fdb.from('purchase_invoices').update(patch as never).eq('id', pi.id).select('id')).data?.length) { toast('Could not save — try again.'); return null; }
      await saveLinesOnInvoice({ ...pi, ...patch }, lines, flags);
      return { id: pi.id, fresh: false, flags };
    }
    if (!inbox) {
      const key = `${supplier.trim().toLowerCase()}|${no.trim().toLowerCase()}`;
      if (no.trim() && dupOk !== key) { const d = await duplicateOf(supplier.trim(), no.trim()); if (d) { setDupOk(key); toast(`Possible duplicate: ${supplier} ${no} is already on ${jobTag(site(d.site_id)) || 'another project'} (${fdate(d.invoice_date)}). Press it again to add it anyway.`); return null; } }
      const r = await addPinv(me, main, { supplier: supplier.trim(), invoice_no: no.trim(), invoice_date: date || today(), net, vat, total, due_date: due || addDays(date || today(), 30), description: lines[0]?.description || '', cost_code: lines[0]?.cost_code || 'materials', po_id: poId || null, receipt }, file, flags);
      if (r.error || !r.id) { toast(r.error || 'Could not save — try again.'); return null; }
      await saveLinesOnInvoice({ id: r.id, net, site_id: main, lines: [] }, lines, r.flags);
      return { id: r.id, fresh: true, flags: r.flags };
    }
    // An inbox invoice: filed in one server step so two people can never file it twice.
    if (no.trim()) { const dup = ((await fdb.from('purchase_invoices').select('supplier_name').eq('invoice_no', no.trim())).data as Row[] | null) ?? []; if (dup.some((d) => String(d.supplier_name || '').trim().toLowerCase() === supplier.trim().toLowerCase())) flags.push('possible duplicate of an invoice already entered'); }
    if (poId) {
      const pr = ((await fdb.from('purchase_orders').select('value').eq('id', poId).maybeSingle()).data as Row | null);
      const sofar = (((await fdb.from('purchase_invoices').select('net').eq('po_id', poId).neq('status', 'rejected')).data as Row[] | null) ?? []).reduce((t, x) => t + Number(x.net || 0), 0) + net;
      if (pr?.value != null && sofar > Number(pr.value) + 0.005) flags.push(`${money(sofar - Number(pr.value))} over the PO value of ${money(pr.value)}`);
    }
    const r = await rpc('fin_inbox_file', { p_id: inbox.id, p_pi: { site_id: main, po_id: poId || null, supplier_name: supplier.trim(), invoice_no: no.trim() || null, invoice_date: date || today(), net, vat, total, status: flags.length ? 'query' : 'to_approve', query_note: flags.length ? flags.join('; ') : null } });
    if (r.error) { toast(`Couldn’t save it — ${r.error.message}. It’s still in the inbox.`); return null; }
    const d = r.data as Row | null;
    if (!d?.ok) { toast(d?.why === 'busy' ? 'Someone started saving this a moment ago. If it’s still here in 5 minutes, try again.' : d?.why === 'taken' ? 'This one has just been saved by someone else.' : `Couldn’t save it — ${WHY[d?.why] || 'please try again'}.`); return null; }
    await saveLinesOnInvoice(d.pi as Row, lines, flags);
    await fdb.from('purchase_invoices').update({ due_date: due || addDays(date || today(), 30), description: lines[0]?.description || null, ...(receipt ? { kind: 'receipt' } : {}) } as never).eq('id', (d.pi as Row).id);
    return { id: (d.pi as Row).id, fresh: true, flags };
  };

  /** Which PM (Andy, 6 Nov 2026): the job's PM first, then the other PMs, then admins. */
  const pickPm = async (forSite: string | null): Promise<{ id: string; name: string } | null> => {
    const ppl = ((await fdb.from('profiles').select('id,name,role,finance_only').eq('org_id', me.org_id as string).in('role', ['pm', 'admin'])).data as { id: string; name: string; role: string; finance_only?: boolean }[] | null ?? []).filter((x) => !x.finance_only);
    const jobPm = forSite ? (site(forSite) as Row | undefined)?.responsible_pm_id : null;
    const order = (x: { id: string; role: string }) => (x.id === jobPm ? 0 : x.role === 'pm' ? 1 : 2);
    const list = ppl.slice().sort((a, b) => order(a) - order(b) || String(a.name).localeCompare(String(b.name)));
    if (!list.length) { toast('There are no PMs or admins to send it to.'); return null; }
    const k = await chooseAction('Send it to which PM?', list.map((x) => ({ key: x.id, label: `${x.name}${x.id === jobPm ? ' (this job’s PM)' : x.role === 'admin' ? ' (admin)' : ''}` })));
    return k ? list.find((x) => x.id === k) ?? null : null;
  };

  /** The buttons (Andy, 6 Nov 2026). Typed in by hand: Save approves it (and posts it to Xero), as a person has already
   *  checked it. From the inbox or a saved one: Save keeps it in Needs Checking, Approve Invoice approves and posts.
   *  Save & Query To PM saves it, asks the chosen PM and goes back to the list. */
  const act = async (how: 'save' | 'another' | 'query' | 'approve' | 'supplier') => {
    if (how === 'supplier') {
      setBusy(true);
      try {
        const r = pi && !editing ? { id: pi.id as string, fresh: false } : await persist(); if (!r) return;
        let row = (await fdb.from('purchase_invoices').select('*').eq('id', r.id).maybeSingle()).data as Row | null; if (!row) return;
        if (r.fresh && row.status === 'approved' && row.auto_approved) { await fdb.from('purchase_invoices').update({ status: 'to_approve', approved_at: null, auto_approved: null } as never).eq('id', r.id); row = { ...row, status: 'to_approve', auto_approved: null }; }
        if (!row.file_path) { toast('Attach the invoice first, so it can go back to the supplier with the email.'); if (!pi) router.replace(`/fin/pinv/${r.id}` as never); return; }
        // Back to where it came from: the address it was emailed from, else the supplier's email in the Directory.
        const from = inbox?.from_email || (((await fdb.from('fin_inbox').select('from_email').eq('purchase_invoice_id', r.id).limit(1)).data as Row[] | null)?.[0]?.from_email as string | undefined);
        const dir = from ? '' : ((((await fdb.from('suppliers').select('name,email').eq('org_id', me.org_id as string)).data as Row[] | null) ?? []).find((x) => String(x.name || '').trim().toLowerCase() === supplier.trim().toLowerCase())?.email as string | undefined) || '';
        setMail({ row, to: from || dir });
      } finally { setBusy(false); }
      return;
    }
    const manual = !pi && !inbox;
    let approveNow = how === 'approve' || (manual && (how === 'save' || how === 'another'));
    // Not ready to save (no project yet) from the inbox: the PM gets it to allocate instead.
    if (how === 'query' && inbox && problem()) {
      const pm = await pickPm(siteId); if (!pm) return;
      if (finBlocked('wage-push', undefined, me.org_id)) { toast('Finance is on trial, so it isn’t sent to PMs yet.'); return; }
      const ok = await fdb.from('fin_inbox').update({ stage: 'with_pm', assigned_pm: pm.id, assigned_at: new Date().toISOString() } as never).eq('id', inbox.id).select('id');
      if (!ok.data?.length) { toast('Not sent. Try again.'); return; }
      toast(`Sent to ${pm.name} to allocate`, { confirm: true }); refresh(); router.back(); return;
    }
    let note = '', pm: { id: string; name: string } | null = null;
    if (how === 'query') {
      pm = await pickPm(mainSiteOf(lines, siteId)); if (!pm) return;
      const n = await promptText(`What does ${pm.name} need to check?`, ''); if (n === null) return; note = n.trim() || 'Please check this invoice';
    }
    // Warnings (dearer than the quote, price list or PO): approve anyway, or leave it in Needs Checking.
    if (approveNow && dearer + (vsPo?.flags.length || 0) > 0 && !(await confirmAsk('This invoice has warnings (dearer than the quote, price list or PO). Approve it anyway?', 'Approve Anyway', how === 'approve' ? 'No' : 'Leave In Needs Checking'))) { if (how === 'approve') return; approveNow = false; }
    setBusy(true);
    try {
      // Not being edited: nothing to save first, just query or approve it as it is.
      const r = pi && !editing ? { id: pi.id as string, fresh: false, flags: [] as string[] } : await persist(); if (!r) return;
      // A new invoice can approve itself on the way in (the company's rule); from the inbox a person decides, so Save keeps it waiting.
      if (r.fresh && !approveNow) {
        const row = (await fdb.from('purchase_invoices').select('status,auto_approved').eq('id', r.id).maybeSingle()).data as Row | null;
        if (row?.status === 'approved' && row.auto_approved) await fdb.from('purchase_invoices').update({ status: 'to_approve', approved_at: null, auto_approved: null } as never).eq('id', r.id);
      }
      if (how === 'query' && pm) {
        const q = await setPinvStatus(me, r.id, 'query', note);
        if (!q.ok) { toast('Saved, but it couldn’t be marked as a query — try again.'); return; }
        const t = await tellPmOfPi(me, { id: r.id, site_id: mainSiteOf(lines, siteId), supplier_name: supplier, invoice_no: no }, `Query on ${piLabel({ supplier_name: supplier, invoice_no: no })}: ${note}`, pm.id);
        toast(t.sent ? `Saved and sent to ${pm.name} to check` : t.why === 'me' ? 'Saved as a query (you chose yourself, so no message was sent)' : 'Saved as a query', { confirm: true });
        refresh(); router.back(); return;
      }
      if (approveNow) {
        const a = await setPinvStatus(me, r.id, 'approved');
        toast(!a.ok ? 'Saved, but it couldn’t be approved — try again.' : finBlocked('xero', 'push_bill', me.org_id) ? 'Saved and approved. Not posted to Xero while Finance is on trial.' : a.xero ? `Saved and approved — Xero: ${a.xero}` : 'Saved, approved and posted to Xero', { confirm: true });
      } else toast(r.flags.length ? `Saved — needs checking: ${r.flags[0]}` : pi?.status === 'approved' ? 'Saved' : 'Saved — waiting in Needs Checking', { confirm: true });
      refresh();
      if (how === 'another') { setNo(''); setLines([blankLine(siteId)]); setFile(null); setDupOk(''); return; }
      // Stay on the invoice: a new one opens as its saved self on this same screen, locked.
      if (!pi) router.replace(`/fin/pinv/${r.id}` as never); else setEditing(false);
    } finally { setBusy(false); }
  };

  if (wantQuery && (pi || inbox) && ctx && (!poId || poFull)) { const w = wantQuery; setWantQuery(''); clearPendingAct(pi?.id || inbox?.id); queueMicrotask(() => void act(w)); }

  const field = (label: string, child: React.ReactNode, w: number | string = 180) => <View style={{ flexGrow: 1, flexBasis: w as number, minWidth: 140 }}><Text style={lab}>{label}</Text>{child}</View>;
  const choice = (label: string, v: string, onPress: () => void, warn = false) => <Pressable disabled={shut2} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[fieldBox, warn && !shut2 && { borderColor: '#f8e7c2', backgroundColor: '#fffaf0' }, shut2 && { backgroundColor: '#F6F7F9' }]}><Text numberOfLines={1} style={{ color: warn && !shut2 ? '#b45309' : base.ink, fontSize: 14 }}>{v}{shut2 ? '' : ' ▾'}</Text></Pressable>;
  const docPath: string | null = file ? null : pi?.file_path || inbox?.file_path || null;
  const docName = file?.name || (pi ? pi.file_name || 'Invoice' : inbox ? inbox.file_name || 'Invoice' : 'Invoice');
  const load = docPath ? () => openDocLink('finance-docs', docPath) : file ? async () => file.uri : null;
  // Where it's up to (Andy, 6 Nov 2026): the step it's at and what happens next.
  const first = (id?: string | null) => (nameOf(people, id) || '').split(' ')[0] || 'the PM';
  const stage: { step: number; label2?: string; next: string; rejected?: boolean } = pi
    ? pi.status === 'rejected' ? { step: 1, next: 'Rejected: it won’t be paid or posted.', rejected: true }
      : pi.paid_on ? { step: 6, next: `Paid ${fdate(pi.paid_on)}.` }
      : pi.status === 'approved' ? { step: 5, next: `${pi.auto_approved ? 'Approved by itself (nothing looked wrong). ' : ''}Next: paid when it’s ticked off on the supplier’s statement, or Mark Paid Today.${pi.xero_id ? ' In Xero.' : ''}` }
      : pi.status === 'query' && /^Queried with the supplier/.test(String(pi.query_note || '')) ? { step: 2, label2: 'With Supplier', next: `Waiting on ${pi.supplier_name || 'the supplier'}: ${String(pi.query_note).replace(/^Queried with the supplier/, 'emailed')}. Approve it once it’s sorted.` }
      : pi.status === 'query' && !askedPm && !(Array.isArray(pi.query_thread) && pi.query_thread.length) ? { step: 3, next: `Needs checking${pi.query_note ? `: ${pi.query_note}` : ''}. Approve it, or Query To PM if something’s not right.` }
      : pi.status === 'query' ? { step: 2, label2: askedPm ? `With ${first(askedPm)}` : 'With A PM', next: `Waiting on ${askedPm ? nameOf(people, askedPm) : 'the PM'}${pi.query_note ? `: “${pi.query_note}”` : ''}. Their reply shows below.` }
      : { step: 3, next: 'Next: check it, then Approve Invoice, or Query To PM if something’s not right.' }
    : inbox ? inbox.stage === 'with_pm' ? { step: 2, label2: `With ${first(inbox.assigned_pm)}`, next: `With ${nameOf(people, inbox.assigned_pm) || 'a PM'} to choose the job.` }
      : { step: 1, next: isRcpt ? 'Next: put in the amount, choose the job and Save.' : 'Next: choose the job and Save, or Save & Query To PM to send it to a PM.' }
    : { step: 1, next: 'Fill it in and Save: it’s approved straight away as you’ve typed it in.' };

  return (
    <DocSplit name={docName} load={load} reloadKey={docPath || file?.uri || ''}>
      <ScrollView contentContainerStyle={page(1000)} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: pi || inbox ? supplier || 'Purchase invoice' : 'New Purchase Invoice' }} />
        {!splitOn && !!load && <View style={{ alignSelf: 'flex-start', marginBottom: 8 }}><Button small kind="ghost" title={`📄 View ${docName}`} onPress={async () => { const u = await load(); if (u) viewDoc(u, docName); else toast('Could not open the invoice.'); }} /></View>}
        <PinvStages {...stage} />
        {locked && <Muted style={{ marginBottom: 8 }}>{pi?.xero_id ? 'In Xero, so change it in Xero.' : 'Paid, so it stays as it is.'}</Muted>}
        {inbox && unread && !noteShut && (
          <View style={{ backgroundColor: '#FDF1E0', borderRadius: 10, padding: 12, paddingRight: 36, marginBottom: 10 }}>
            {shut}
            <Text style={{ color: '#B35A00' }}>Unable to read this one automatically, so fill it in below. The file stays attached and nothing is lost.</Text>
            {!!inbox.query_reason && <Pressable onPress={() => setShowWhy(!showWhy)}><Text style={{ color: '#B35A00', fontSize: 12, marginTop: 4, textDecorationLine: 'underline' }}>{showWhy ? inbox.query_reason : 'Why?'}</Text></Pressable>}
            {!!inbox.file_path && <View style={{ alignSelf: 'flex-start', marginTop: 8 }}><Button small kind="ghost" busy={busy} title="🤖 Try Reading It Again" onPress={async () => { setBusy(true); const e = await readOne(me, inbox); setBusy(false); if (e) toast(e); void qc.invalidateQueries({ queryKey: ['finInbox', inbox.id] }); }} /></View>}
          </View>
        )}
        {isRcpt && !noteShut && <View style={{ backgroundColor: '#F6F7F9', borderRadius: 10, padding: 12, paddingRight: 36, marginBottom: 10 }}>{shut}<Text style={{ color: base.ink }}>Expense receipt from {String(ex.sent_by || 'the team')}{ex.category === 'fuel' ? ' (fuel)' : ''}{ex.label ? `, for ${String(ex.label)}` : ''}. Put in the amount from the receipt, choose the job, then Save.</Text>{!!ex.note && <Muted style={{ marginTop: 4 }}>Their note: {String(ex.note)}</Muted>}</View>}
        {inbox && !unread && !isRcpt && !noteShut && <View style={{ backgroundColor: '#E7F6EC', borderRadius: 10, padding: 12, paddingRight: 36, marginBottom: 10 }}>{shut}<Text style={{ color: '#1E7A43' }}>✓ Read automatically: {lines.length} line{lines.length === 1 ? '' : 's'}. Check it, then Save or Approve Invoice.</Text></View>}
        {!inbox && !file && !pi?.file_path && !shut2 && (
          <Pressable accessibilityRole="button" onPress={() => void attach()} style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: '#c3c8d0', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 10, backgroundColor: '#fff' }}>
            <Text style={{ fontSize: 22 }}>📄</Text>
            <Text style={{ fontWeight: '600', color: base.ink, marginTop: 4 }}>Attach The Invoice</Text>
            <Muted>PDF, photo or scan. You can save without one and add it later.</Muted>
          </Pressable>
        )}
        {!inbox && !!file && !shut2 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}><Text style={{ color: base.ink }}>📎 {file.name}</Text><Pressable onPress={() => void attach()}><Text style={{ color: base.blue }}>Change</Text></Pressable><Pressable onPress={() => setFile(null)}><Text style={{ color: base.slate }}>Remove</Text></Pressable></View>}
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {field('Supplier', choice('Supplier', supplier || 'Choose the supplier', () => void chooseSupplier(), !supplier), 220)}
            {!receipt && field('Invoice No.', <TextInput editable={!shut2} accessibilityLabel="Invoice number" value={no} onChangeText={setNo} placeholder="e.g. SI-882310" style={[fieldBox, { color: base.ink, fontSize: 14 }, shut2 && { backgroundColor: '#F6F7F9' }]} />, 150)}
            {field(receipt ? 'Date' : 'Invoice Date', <DateBox disabled={shut2} style={shut2 ? { backgroundColor: '#F6F7F9' } : undefined} value={date} onChange={setDate} title="Invoice date" clearable={false} />, 150)}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
            {field('Project (for new lines)', choice('Project', siteId ? jobTag(site(siteId)) : 'Choose the project', () => void chooseSite(), !siteId), 220)}
            {field('Allocate To PO', choice('Allocate To PO', poId ? pos.find((p) => p.id === poId)?.number || 'PO' : 'No PO', () => { if (!siteId) { toast('Choose the project first.'); return; } void choosePo(); }), 150)}
            {field('Due Date', <DateBox disabled={shut2} style={shut2 ? { backgroundColor: '#F6F7F9' } : undefined} value={due} onChange={setDue} title="Due date" placeholder={date ? fdate(addDays(date, 30)) : 'Choose'} />, 150)}
          </View>
          {!inbox && !shut2 && <View style={{ marginTop: 8 }}><Check label="This is a receipt (no invoice number)" value={receipt} onChange={setReceipt} /></View>}
        </Card>
        <InvoiceLines readOnly={shut2} lines={lines} checks={vsPo ? [] : checks} sites={sites as never} read={inbox && !unread ? { net: ex.net, vat: ex.vat, total: ex.total } : null} onChange={setLines} defaultSite={siteId} />
        {!!vsPo && vsPo.perLine.some((c) => c.state !== 'none') && (
          <Card>
            <Text style={{ fontWeight: '600', color: base.ink, marginBottom: 6 }}>Against {poFull?.number || 'the PO'}</Text>
            {lines.map((l, k) => { const c = vsPo.perLine[k]; if (!c || c.state === 'none') return null; const col = c.state === 'ok' ? '#1E7A43' : c.state === 'cheaper' ? '#2457C5' : '#B35A00'; return (
              <View key={k} style={{ flexDirection: 'row', gap: 10, paddingVertical: 4, borderTopWidth: k ? 1 : 0, borderTopColor: '#f0f1f3' }}>
                <Text style={{ flex: 1, color: base.ink }} numberOfLines={1}>{l.description || `Line ${k + 1}`}</Text>
                <Text style={{ color: col, fontWeight: '500' }}>{c.state === 'ok' ? '✓ ' : c.state === 'cheaper' ? '' : '⚠ '}{c.text}</Text>
              </View>
            ); })}
            <Muted style={{ marginTop: 6 }}>{vsPo.flags.length ? 'Lines dearer than the PO, more than ordered or not on it send the invoice to Needs Checking.' : 'Every line matches the PO.'}</Muted>
          </Card>
        )}
        {(dearer > 0 || (readTot != null && Math.abs(readTot - total) >= 0.5)) && (
          <Card style={{ backgroundColor: '#FFF8EC' }}>
            {dearer > 0 && <Text style={{ color: '#B35A00' }}>⚠ {dearer} line{dearer === 1 ? ' is' : 's are'} dearer than the quote or price list, so this will wait in Needs Checking.</Text>}
            {readTot != null && Math.abs(readTot - total) >= 0.5 && <Text style={{ color: '#B35A00' }}>⚠ The lines come to {money(total)} but the invoice says {money(readTot)}.</Text>}
          </Card>
        )}
        {!shut2 && <Muted style={{ marginBottom: 10 }}>{!pi && !inbox ? 'Save approves it and posts it to Xero (not while Finance is on trial): you’ve typed it in, so it doesn’t wait in Needs Checking.' : 'Save keeps it in Needs Checking. Approve Invoice approves it and posts it to Xero (not while Finance is on trial).'}{desk ? ' Save & Query To PM asks a PM to check it.' : ''}</Muted>}
        <View style={{ flexDirection: 'row', flexWrap: desk ? 'nowrap' : 'wrap', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
          {!editing && buttons}
          {inbox && (
            <>
              <Button small kind="ghost" title="Delete" onPress={async () => {
                if (!(await confirmAsk('Delete this? Use it for emails that aren’t a supplier’s invoice: a statement, a remittance, an advert or a duplicate. It comes off the list; the email is still kept in the background in case it’s ever needed.', 'Delete'))) return;
                if (!(await fdb.from('fin_inbox').update({ status: 'ignored', stage: 'ignored' } as never).eq('id', inbox.id).select('id')).data?.length) { toast('Could not save — try again.'); return; }
                refresh(); router.back();
              }} />
            </>
          )}
          {!inbox && !pi && <Button small kind="ghost" title="Cancel" onPress={() => router.back()} />}
          {!inbox && !pi && <Button small kind="ghost" busy={busy} title="Save & Add Another" onPress={() => void act('another')} />}
          {!!pi && !locked && (editing ? <Button small kind="ghost" title="Cancel Edit" onPress={unedit} /> : <Button small kind="ghost" title="✏️ Edit" onPress={() => setEditing(true)} />)}
          {!locked && pi?.status !== 'approved' && !(pi?.status === 'query' && askedPm) && <Button small kind="ghost" busy={busy} title="Query To PM" onPress={() => void act('query')} />}
          {!locked && <Button small kind="ghost" busy={busy} title="Query Supplier" onPress={() => void act('supplier')} />}
          {!locked && editing && <Button small kind={!pi && !inbox ? 'primary' : 'ghost'} busy={busy} title={pi?.status === 'approved' ? 'Save Changes' : 'Save'} onPress={() => void act('save')} />}
          {!locked && (pi || inbox) && pi?.status !== 'approved' && <Button small busy={busy} title="Approve Invoice" onPress={() => void act('approve')} />}
        </View>
        {below}
        {!!mail && (
          <FinEmailPopup kind="pi_query" title={`Query ${mail.row.supplier_name || 'the supplier'}'s invoice ${mail.row.invoice_no || ''}`} to={mail.to} note="Their invoice goes back with it. Write the query in the message."
            vars={{ number: String(mail.row.invoice_no || ''), project: site(mail.row.site_id)?.name || '', job_no: site(mail.row.site_id)?.job_number || '', supplier: mail.row.supplier_name || '', amount: money(mail.row.total) }}
            onSend={async (o) => { const e = await emailPiQuery(me, mail.row, o); if (e) return e; toast(`Query emailed to ${o.to.join(', ')}`, { confirm: true }); refresh(); return null; }}
            onClose={() => { const id = mail.row.id; setMail(null); if (!pi) router.replace(`/fin/pinv/${id}` as never); else setEditing(false); }} />
        )}
      </ScrollView>
    </DocSplit>
  );
}
