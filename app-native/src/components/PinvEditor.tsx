// The purchase invoice screen (Andy, 5 Nov 2026, a mix of Construction Manager and Coreloops): the invoice beside it on a
// laptop, then supplier, invoice number, dates, our PO and the project, then the lines one by one (qty, unit, rate to
// 3 decimal places, discount, VAT, project or a split across projects by %, cost code), checks and totals.
// Used for Add Manually (blank: attach the PDF, photo or scan) and for an emailed invoice in the inbox (filled in from
// what was read; if it couldn't be read, the same blank form with a plain note, nothing lost).
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { DateBox } from '@/components/DateField';
import { DocSplit } from '@/components/DocSplit';
import { blankLine, InvoiceLines } from '@/components/InvoiceLines';
import { pickJob } from '@/components/FinSales';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Check, Muted } from '@/components/ui';
import { fdb } from '@/data/finance';
import { addPinv, duplicateOf } from '@/data/finPurchase';
import { openDocLink } from '@/data/hs';
import { checkAll, loadReadContext, readOne, saveLinesOnInvoice } from '@/data/invoiceRead';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
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

/** start: from a statement's Add Missing Invoice — the supplier, number, gross amount and date already known. */
export function PinvEditor({ inbox, siteId: site0, poId: po0, start }: { inbox?: Row | null; siteId?: string; poId?: string; start?: { supplier?: string; no?: string; amount?: number; date?: string } }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const desk = useDesk();
  const { data: sites = [] } = useSites();
  const ex = (inbox?.extracted || {}) as Row;
  const unread = !!inbox && !(Array.isArray(ex.lines) && ex.lines.length);
  const [supplier, setSupplier] = useState<string>(inbox ? inbox.supplier_override || ex.supplier || '' : start?.supplier || '');
  const [no, setNo] = useState<string>(ex.invoice_no || ex.doc_number || start?.no || '');
  const [date, setDate] = useState<string>(ex.date || ex.doc_date || start?.date || today());
  const [due, setDue] = useState<string>(ex.due_date || '');
  const [siteId, setSiteId] = useState<string | null>(site0 || inbox?.site_id || null);
  const [poId, setPoId] = useState<string>(po0 || inbox?.po_id || '');
  const [receipt, setReceipt] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dupOk, setDupOk] = useState('');
  const [showWhy, setShowWhy] = useState(false);
  const [noteShut, setNoteShut] = useState(false); // the note at the top closes with its ✕ (Andy, 6 Nov 2026)
  const shut = <Pressable accessibilityRole="button" accessibilityLabel="Close the note" hitSlop={8} onPress={() => setNoteShut(true)} style={{ position: 'absolute', top: 8, right: 10 }}><Text style={{ fontSize: 16, color: base.slate }}>✕</Text></Pressable>;
  // Lines as read, or one line for the amount read (an unread invoice: one blank line to fill in).
  const [lines, setLines] = useState<RLine[]>(() => (Array.isArray(ex.lines) && ex.lines.length ? (ex.lines as RLine[])
    : ex.net != null ? [{ ...blankLine(site0 || inbox?.site_id), description: 'Invoice total', unit_price: Number(ex.net), amount: Number(ex.net) }]
    : start?.amount ? [{ ...blankLine(site0), description: 'Invoice total', unit_price: round2(start.amount / 1.2), amount: round2(start.amount / 1.2) }] : [blankLine(site0 || inbox?.site_id)]));
  const { data: sups = [] } = useQuery({ queryKey: ['finSupNames', me?.org_id], enabled: !!me?.org_id, queryFn: async () => (((await fdb.from('fin_suppliers').select('name').eq('org_id', me?.org_id as string).order('name')).data as Row[] | null) ?? []).map((x) => String(x.name || '')).filter(Boolean) });
  const { data: ctx } = useQuery({ queryKey: ['finReadCtx', me?.org_id], enabled: !!me?.org_id, queryFn: () => loadReadContext(me?.org_id as string) });
  const { data: pos = [] } = useQuery({ queryKey: ['finInboxPos', siteId], enabled: !!siteId, queryFn: async () => ((await fdb.from('purchase_orders').select('id,number,supplier_name,value,status').eq('site_id', siteId as string).neq('status', 'cancelled').order('created_at', { ascending: false })).data as Row[] | null) ?? [] });
  // The PO's lines, to check the invoice against line by line (Andy, 6 Nov 2026).
  const { data: poFull } = useQuery({ queryKey: ['finPoItems', poId], enabled: !!poId, queryFn: async () => ((await fdb.from('purchase_orders').select('id,number,items,value').eq('id', poId).maybeSingle()).data as Row | null) });
  if (!me) return null;
  const checks = ctx ? checkAll(lines, supplier, ctx) : [];
  const vsPo = poId && poFull ? checkAgainstPo(lines, (poFull.items || []) as never, poFull.number || 'the PO') : null;
  const net = linesNet(lines), vat = linesVat(lines), total = round2(net + vat);
  const dearer = checks.filter((c) => c.state === 'over').length;
  const readTot = ex.total != null ? Number(ex.total) : null;
  const site = (id?: string | null) => sites.find((s) => s.id === id);
  const refresh = () => ['finInbox', 'finPurchases', 'finOverview', 'finBook', 'finPo'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));

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
  const save = async (another = false) => {
    const p = problem(); if (p) { toast(p); return; }
    const main = mainSiteOf(lines, siteId); if (!main) { toast('Choose the project.'); return; }
    const flags: string[] = [];
    if (dearer) flags.push(`${dearer} line${dearer === 1 ? ' is' : 's are'} dearer than the quote or price list`);
    if (vsPo) flags.push(...vsPo.flags); // dearer than the PO, more than ordered, or not on it → Needs Checking
    if (readTot != null && Math.abs(readTot - total) >= 0.5) flags.push(`the lines come to ${money(total)} but the invoice says ${money(readTot)}`);
    setBusy(true);
    try {
      if (!inbox) {
        const key = `${supplier.trim().toLowerCase()}|${no.trim().toLowerCase()}`;
        if (no.trim() && dupOk !== key) { const d = await duplicateOf(supplier.trim(), no.trim()); if (d) { setDupOk(key); toast(`Possible duplicate: ${supplier} ${no} is already on ${jobTag(site(d.site_id)) || 'another project'} (${fdate(d.invoice_date)}). Save again to add it anyway.`); return; } }
        const r = await addPinv(me, main, { supplier: supplier.trim(), invoice_no: no.trim(), invoice_date: date || today(), net, vat, total, due_date: due || addDays(date || today(), 30), description: lines[0]?.description || '', cost_code: lines[0]?.cost_code || 'materials', po_id: poId || null, receipt }, file, flags);
        if (r.error || !r.id) { toast(r.error || 'Could not save — try again.'); return; }
        await saveLinesOnInvoice({ id: r.id, net, site_id: main, lines: [] }, lines, r.flags);
        const st = ((await fdb.from('purchase_invoices').select('status').eq('id', r.id).maybeSingle()).data as Row | null)?.status;
        toast(r.flags.length ? `Saved — needs checking: ${r.flags[0]}` : st === 'approved' ? 'Saved and approved' : 'Saved — needs checking', { confirm: true });
        refresh();
        if (another) { setNo(''); setLines([blankLine(siteId)]); setFile(null); setDupOk(''); } else router.replace(`/fin/pinv/${r.id}` as never);
        return;
      }
      // An inbox invoice: filed in one server step so two people can never file it twice.
      if (no.trim()) { const dup = ((await fdb.from('purchase_invoices').select('supplier_name').eq('invoice_no', no.trim())).data as Row[] | null) ?? []; if (dup.some((d) => String(d.supplier_name || '').trim().toLowerCase() === supplier.trim().toLowerCase())) flags.push('possible duplicate of an invoice already entered'); }
      if (poId) {
        const pr = ((await fdb.from('purchase_orders').select('value').eq('id', poId).maybeSingle()).data as Row | null);
        const sofar = (((await fdb.from('purchase_invoices').select('net').eq('po_id', poId).neq('status', 'rejected')).data as Row[] | null) ?? []).reduce((t, x) => t + Number(x.net || 0), 0) + net;
        if (pr?.value != null && sofar > Number(pr.value) + 0.005) flags.push(`${money(sofar - Number(pr.value))} over the PO value of ${money(pr.value)}`);
      }
      const r = await rpc('fin_inbox_file', { p_id: inbox.id, p_pi: { site_id: main, po_id: poId || null, supplier_name: supplier.trim(), invoice_no: no.trim() || null, invoice_date: date || today(), net, vat, total, status: flags.length ? 'query' : 'to_approve', query_note: flags.length ? flags.join('; ') : null } });
      if (r.error) { toast(`Couldn’t file it — ${r.error.message}. It’s still in the inbox.`); return; }
      const d = r.data as Row | null;
      if (!d?.ok) { toast(d?.why === 'busy' ? 'Someone started filing this a moment ago. If it’s still here in 5 minutes, file it again.' : d?.why === 'taken' ? 'This one has just been filed by someone else.' : `Couldn’t file it — ${WHY[d?.why] || 'please try again'}.`); return; }
      await saveLinesOnInvoice(d.pi as Row, lines, flags);
      await fdb.from('purchase_invoices').update({ due_date: due || addDays(date || today(), 30), description: lines[0]?.description || null } as never).eq('id', (d.pi as Row).id);
      toast(flags.length ? `Filed — needs checking: ${flags[0]}` : (d.pi as Row).status === 'approved' ? 'Filed and approved' : 'Filed — needs checking', { confirm: true });
      refresh(); router.replace(`/fin/pinv/${(d.pi as Row).id}` as never);
    } finally { setBusy(false); }
  };

  const field = (label: string, child: React.ReactNode, w: number | string = 180) => <View style={{ flexGrow: 1, flexBasis: w as number, minWidth: 140 }}><Text style={lab}>{label}</Text>{child}</View>;
  const choice = (label: string, v: string, onPress: () => void, warn = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[fieldBox, warn && { borderColor: '#f8e7c2', backgroundColor: '#fffaf0' }]}><Text numberOfLines={1} style={{ color: warn ? '#b45309' : base.ink, fontSize: 14 }}>{v} ▾</Text></Pressable>;
  const docName = inbox ? inbox.file_name || 'Invoice' : file?.name || 'Invoice';
  const load = inbox?.file_path ? () => openDocLink('finance-docs', inbox.file_path) : file ? async () => file.uri : null;

  return (
    <DocSplit name={docName} load={load} reloadKey={inbox?.file_path || file?.uri || ''}>
      <ScrollView contentContainerStyle={page(1000)} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: inbox ? supplier || 'Purchase invoice' : 'New Purchase Invoice' }} />
        {inbox && unread && !noteShut && (
          <View style={{ backgroundColor: '#FDF1E0', borderRadius: 10, padding: 12, paddingRight: 36, marginBottom: 10 }}>
            {shut}
            <Text style={{ color: '#B35A00' }}>Couldn’t read this one automatically, so fill it in below. The file stays attached and nothing is lost.</Text>
            {!!inbox.query_reason && <Pressable onPress={() => setShowWhy(!showWhy)}><Text style={{ color: '#B35A00', fontSize: 12, marginTop: 4, textDecorationLine: 'underline' }}>{showWhy ? inbox.query_reason : 'Why?'}</Text></Pressable>}
            {!!inbox.file_path && <View style={{ alignSelf: 'flex-start', marginTop: 8 }}><Button small kind="ghost" busy={busy} title="🤖 Try Reading It Again" onPress={async () => { setBusy(true); const e = await readOne(me, inbox); setBusy(false); if (e) toast(e); void qc.invalidateQueries({ queryKey: ['finInbox', inbox.id] }); }} /></View>}
          </View>
        )}
        {inbox && !unread && !noteShut && <View style={{ backgroundColor: '#E7F6EC', borderRadius: 10, padding: 12, paddingRight: 36, marginBottom: 10 }}>{shut}<Text style={{ color: '#1E7A43' }}>✓ Read automatically: {lines.length} line{lines.length === 1 ? '' : 's'}. Check it and press File It.</Text></View>}
        {!inbox && !file && (
          <Pressable accessibilityRole="button" onPress={() => void attach()} style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: '#c3c8d0', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 10, backgroundColor: '#fff' }}>
            <Text style={{ fontSize: 22 }}>📄</Text>
            <Text style={{ fontWeight: '600', color: base.ink, marginTop: 4 }}>Attach The Invoice</Text>
            <Muted>PDF, photo or scan. You can save without one and add it later.</Muted>
          </Pressable>
        )}
        {!inbox && !!file && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}><Text style={{ color: base.ink }}>📎 {file.name}</Text><Pressable onPress={() => void attach()}><Text style={{ color: base.blue }}>Change</Text></Pressable><Pressable onPress={() => setFile(null)}><Text style={{ color: base.slate }}>Remove</Text></Pressable></View>}
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {field('Supplier', choice('Supplier', supplier || 'Choose the supplier', () => void chooseSupplier(), !supplier), 220)}
            {!receipt && field('Invoice No.', <TextInput accessibilityLabel="Invoice number" value={no} onChangeText={setNo} placeholder="e.g. SI-882310" style={[fieldBox, { color: base.ink, fontSize: 14 }]} />, 150)}
            {field(receipt ? 'Date' : 'Invoice Date', <DateBox value={date} onChange={setDate} title="Invoice date" clearable={false} />, 150)}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
            {field('Due Date', <DateBox value={due} onChange={setDue} title="Due date" placeholder={date ? fdate(addDays(date, 30)) : 'Choose'} />, 140)}
            {field('Project (for new lines)', choice('Project', siteId ? jobTag(site(siteId)) : 'Choose the project', () => void chooseSite(), !siteId), 190)}
            {field('Allocate To PO', choice('Allocate To PO', poId ? pos.find((p) => p.id === poId)?.number || 'PO' : 'No PO', () => { if (!siteId) { toast('Choose the project first.'); return; } void choosePo(); }), 140)}
          </View>
          {!inbox && <View style={{ marginTop: 8 }}><Check label="This is a receipt (no invoice number)" value={receipt} onChange={setReceipt} /></View>}
        </Card>
        <InvoiceLines lines={lines} checks={vsPo ? [] : checks} sites={sites as never} read={inbox && !unread ? { net: ex.net, vat: ex.vat, total: ex.total } : null} onChange={setLines} defaultSite={siteId} />
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
        <Muted style={{ marginBottom: 10 }}>{desk ? 'Approves itself on save when the supplier is in your Directory, nothing is over its PO, it isn’t a duplicate and no line is dearer than the quote or price list. Anything else waits in Needs Checking.' : 'Approves itself on save when nothing looks wrong.'}</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
          {inbox ? (
            <>
              <Button kind="ghost" title="Not An Invoice" onPress={async () => {
                if (!(await confirmAsk('Ignore this? It isn’t an invoice, so it comes off the list.', 'Ignore'))) return;
                if (!(await fdb.from('fin_inbox').update({ status: 'ignored', stage: 'ignored' } as never).eq('id', inbox.id).select('id')).data?.length) { toast('Could not save — try again.'); return; }
                refresh(); router.back();
              }} />
              {!finBlocked('wage-push', undefined, me.org_id) && <Button kind="ghost" title="Send To A PM" onPress={async () => {
                const pms = ((await fdb.from('profiles').select('id,name,role,finance_only').eq('org_id', me.org_id as string).in('role', ['pm', 'admin'])).data as { id: string; name: string; finance_only?: boolean }[] | null ?? []).filter((x) => !x.finance_only);
                const k = await chooseAction('Which PM?', pms.map((x) => ({ key: x.id, label: x.name }))); if (!k) return;
                const ok = await fdb.from('fin_inbox').update({ stage: 'with_pm', assigned_pm: k, assigned_at: new Date().toISOString() } as never).eq('id', inbox.id).select('id');
                toast(ok.data?.length ? `Sent to ${pms.find((x) => x.id === k)?.name}` : 'Not sent. Try again.'); refresh();
              }} />}
              <Button busy={busy} title="File It" onPress={() => void save()} />
            </>
          ) : (
            <>
              <Button kind="ghost" title="Cancel" onPress={() => router.back()} />
              <Button kind="ghost" busy={busy} title="Save & Add Another" onPress={() => void save(true)} />
              <Button busy={busy} title="Save" onPress={() => void save()} />
            </>
          )}
        </View>
        <Text style={{ textAlign: 'right', color: base.slate, marginTop: 8 }}>Net {money(net)} · VAT {money(vat)} · <Text style={{ fontWeight: '700', color: base.ink }}>Total {money(total)}</Text></Text>
      </ScrollView>
    </DocSplit>
  );
}
