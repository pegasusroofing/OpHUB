// An emailed purchase invoice waiting in the inbox (906 openFinInboxItem):
// open the file, check what was read, choose the job (and PO), and file it
// as a purchase invoice — one server step (fin_inbox_file) so two people can
// never file it twice. Sending it to a PM to book is off during the Finance trial.
import { finBlocked } from '@/lib/rules/finance';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DocSplit } from '@/components/DocSplit';
import { PinvEditor } from '@/components/PinvEditor';
import { InvoiceLines } from '@/components/InvoiceLines';
import { checkAll, loadReadContext, readOne, saveLinesOnInvoice } from '@/data/invoiceRead';
import { decide, type RLine } from '@/lib/rules/invoiceRead';

import { FinForm } from '@/components/FinForm';
import { FinRow } from '@/components/FinNav';
import { pickJob } from '@/components/FinSales';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { fdb } from '@/data/finance';
import { openDocLink } from '@/data/hs';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { fdate, jobTag, money, num, round2, today } from '@/lib/rules/finance';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

type Row = Record<string, any>;
const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a: object) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
const WHY: Record<string, string> = { bad_site: 'that project isn’t one of yours', bad_po: 'that PO wasn’t found', bad_amount: 'check the amounts', not_allowed: 'you need Finance access to file invoices' };

export default function FinInboxItem() {
  const { iid, q } = useLocalSearchParams<{ iid: string; q?: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const [siteId, setSiteId] = useState<string | null>(null);
  const [poId, setPoId] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);
  const [reading, setReading] = useState(false);
  const [edited, setLines] = useState<RLine[] | null>(null);
  const { data: it, isLoading } = useQuery({ queryKey: ['finInbox', iid], queryFn: async () => (await fdb.from('fin_inbox').select('*').eq('id', iid).maybeSingle()).data as Row | null });
  // The Directory's suppliers, to choose who the invoice is from (Andy, 3 Nov 2026).
  const { data: sups = [] } = useQuery({ queryKey: ['finSupNames', me?.org_id], enabled: !!me?.org_id, queryFn: async () => (((await fdb.from('fin_suppliers').select('name').eq('org_id', me?.org_id as string).order('name')).data as Row[] | null) ?? []).map((x) => String(x.name || '')).filter(Boolean) });
  const { data: ctx } = useQuery({ queryKey: ['finReadCtx', me?.org_id], enabled: !!me?.org_id, queryFn: () => loadReadContext(me?.org_id as string) });
  const lines = edited ?? (it?.extracted?.lines as RLine[] | undefined) ?? null;
  // With lines, the job is whichever has most of the invoice; the rest goes on as a split when it's filed.
  const checks = lines && ctx ? checkAll(lines, it?.extracted?.supplier, ctx) : [];
  const verdict = lines && it?.extracted ? decide(it.extracted, lines, checks) : null;
  const sid = siteId ?? it?.site_id ?? verdict?.mainSite ?? null;
  const { data: pos = [] } = useQuery({ queryKey: ['finInboxPos', sid], enabled: !!sid, queryFn: async () => ((await fdb.from('purchase_orders').select('id,number,supplier_name,value,status').eq('site_id', sid as string).neq('status', 'cancelled')).data as Row[] | null) ?? [] });
  if (!me) return null;
  if (isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!it) return <Muted style={{ padding: space.l }}>Not found — it may have been filed already.</Muted>;
  const ex = it.extracted || {};
  const po = poId ?? it.po_id ?? null;
  const filed = it.status === 'filed' && it.purchase_invoice_id;
  // Who it's from can always be changed, read or not: saved straight onto the invoice so filing picks it up.
  const chooseSupplier = async () => {
    const k = await chooseAction('Who is the invoice from?', [...sups.map((n) => ({ key: `s:${n}`, label: `${n === (it.supplier_override || ex.supplier) ? '✓ ' : ''}${n}` })), { key: 'type', label: '✏️ Type a name' }]);
    if (!k) return;
    const name = k === 'type' ? (await promptText('Supplier name', ex.supplier || ''))?.trim() : k.slice(2);
    if (!name || name === (it.supplier_override || ex.supplier)) return;
    const r = await fdb.from('fin_inbox').update({ supplier_override: name, ...(it.extracted ? { extracted: { ...ex, supplier: name } } : {}) } as never).eq('id', it.id).select('id');
    if (!r.data?.length) { toast('Could not save — try again.'); return; }
    toast(`Supplier set to ${name}`); void qc.invalidateQueries({ queryKey: ['finInbox', iid] });
  };
  // Not filed yet: the line-by-line purchase invoice screen (Andy, 5 Nov 2026), filled in from what was read.
  if (!filed) return <PinvEditor key={`${it.id}${it.extracted?.lines ? 'r' : ''}${it.supplier_override || ''}${it.site_id || ''}`} inbox={it} startQuery={q === 'supplier'} startApprove={q === 'approve'} />;
  return (
    <DocSplit name={it.file_name || 'Invoice'} load={it.file_path ? () => openDocLink('finance-docs', it.file_path) : null}>
    <ScrollView contentContainerStyle={page(800)}>
      <Stack.Screen options={{ title: ex.supplier || it.from_email || 'Purchase invoice' }} />
      {filed && <Card><Text style={{ color: '#1E7A3C', fontWeight: '500' }}>Filed.</Text><Button kind="ghost" title="Open the purchase invoice" onPress={() => router.replace(`/fin/pinv/${it.purchase_invoice_id}` as never)} /></Card>}
      <Card>
        <FinRow title="Supplier" right={`${it.supplier_override || ex.supplier || 'Choose'} ▾`} onPress={filed ? undefined : () => void chooseSupplier()} />
        <FinRow title="Emailed From" right={it.from_email || '—'} /><FinRow title="Received" right={fdate(String(it.received_at).slice(0, 10))} />{it.subject && <FinRow title="Subject" right={it.subject} />}
        {it.query_reason && <Text style={{ color: '#D98A00', marginTop: 6 }}>Why it&apos;s unallocated: {it.query_reason}</Text>}
        {(it.comments || []).map((c: Row, k: number) => <Muted key={k}>{c.name}: {c.text}</Muted>)}
      </Card>
      {!filed && !it.extracted?.lines && !!it.file_path && <Button busy={reading} title="🤖 Read it" onPress={async () => { setReading(true); const e = await readOne(me, it); setReading(false); if (e) toast(e); void qc.invalidateQueries({ queryKey: ['finInbox', iid] }); }} />}
      {!!lines && lines.length > 0 && <InvoiceLines lines={lines} checks={checks} sites={sites as never} read={it.extracted} readOnly={!!filed} onChange={setLines} />}
      {!filed && !!verdict?.flags.length && <Card>{verdict.flags.map((x) => <Text key={x} style={{ color: base.red, fontWeight: '500', marginBottom: 3 }}>{x}</Text>)}<Muted>It files as a query, for someone to approve.</Muted></Card>}
      {it.file_path && <Button kind="ghost" title={`📄 ${it.file_name || 'Open the invoice'}`} onPress={async () => { const u = await openDocLink('finance-docs', it.file_path); if (u) viewDoc(u); else toast('Could not open the file.'); }} />}
      <Card>
        <Muted style={{ fontWeight: '500' }}>Project</Muted>
        <Pressable onPress={async () => { const s = await pickJob('Which project is it for?', sites); if (s) { setSiteId(s); setPoId(null); } }} style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, marginBottom: 8 }}><Text style={{ color: base.ink }}>{sid ? jobTag(sites.find((s) => s.id === sid)) : 'Choose the project ▾'}</Text></Pressable>
        {!!sid && <>
          <Muted style={{ fontWeight: '500' }}>Our PO (optional)</Muted>
          <Pressable onPress={async () => { const k = await chooseAction('PO', [{ key: '-', label: 'No PO' }, ...pos.map((p) => ({ key: p.id, label: `${p.number} · ${p.supplier_name || ''}${p.value != null ? ` · ${money(p.value)}` : ''}` }))]); if (k) setPoId(k === '-' ? '' : k); }} style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9 }}><Text style={{ color: base.ink }}>{po ? pos.find((p) => p.id === po)?.number || 'PO' : 'No PO ▾'}</Text></Pressable>
        </>}
      </Card>
      {!filed && <Button title="File to this project…" onPress={() => { if (!sid) { toast('Choose the project first.'); return; } if (lines?.some((l) => !l.site_id)) { toast('Choose the job for every line first.'); return; } setFiling(true); }} />}
      {!filed && <Button kind="ghost" title="Not an invoice — ignore it" onPress={async () => {
        // 9219b finInboxIgnore: it leaves the inbox lists.
        if (!(await confirmAsk('Ignore this? It isn’t an invoice, so it comes off the list.', 'Ignore'))) return;
        if (!(await fdb.from('fin_inbox').update({ status: 'ignored', stage: 'ignored' } as never).eq('id', it.id).select('id')).data?.length) { toast('Could not save — try again.'); return; }
        toast('Ignored'); void qc.invalidateQueries({ queryKey: ['finPurchases'] }); router.back();
      }} />}
      {!filed && !finBlocked('wage-push', undefined, me.org_id) && <View style={{ marginTop: space.m }}><Button kind="ghost" title={it.assigned_pm ? 'With a PM: send to someone else…' : 'Send to a PM to book…'} onPress={async () => {
        const pms = ((await fdb.from('profiles').select('id,name,role,finance_only').eq('org_id', me.org_id as string).in('role', ['pm', 'admin'])).data as { id: string; name: string; finance_only?: boolean }[] | null ?? []).filter((x) => !x.finance_only);
        const k = await chooseAction('Which PM?', pms.map((x) => ({ key: x.id, label: x.name }))); if (!k) return;
        const ok = await fdb.from('fin_inbox').update({ stage: 'with_pm', assigned_pm: k, assigned_at: new Date().toISOString() } as never).eq('id', it.id).select('id');
        toast(ok.data?.length ? `Sent to ${pms.find((x) => x.id === k)?.name}` : 'Not sent. Try again.'); void qc.invalidateQueries({ queryKey: ['finInbox', iid] }); void qc.invalidateQueries({ queryKey: ['finPurchases'] });
      }} /></View>}
      {!filed && finBlocked('wage-push', undefined, me.org_id) && <Muted style={{ marginTop: 8 }}>Sending it to a PM to book is switched off while Finance is on trial.</Muted>}
      {filing && sid && (
        <FinForm title="File as a purchase invoice" initial={{ supplier: it.supplier_override || ex.supplier || '', invoice_no: ex.invoice_no || '', date: ex.date || today(), net: ex.net ?? '', vat: ex.vat ?? '', total: ex.total ?? '' }} onClose={() => setFiling(false)} saveLabel="File it"
          fields={[{ k: 'supplier', label: 'Supplier' }, { k: 'invoice_no', label: 'Invoice no.', half: true }, { k: 'date', label: 'Invoice date', kind: 'date', half: true }, { k: 'net', label: 'Net £', kind: 'money', half: true }, { k: 'vat', label: 'VAT £', kind: 'money', half: true }, { k: 'total', label: 'Total £', kind: 'money' }]}
          onSave={async (v) => {
            let net = num(v.net), vat = num(v.vat), total = num(v.total);
            if ((net === null || isNaN(net)) && total !== null && !isNaN(total)) { net = round2(total / 1.2); vat = round2(total - net); }
            if (net === null || isNaN(net)) return 'Enter the net amount (or the total).';
            if (vat === null || isNaN(vat)) vat = 0;
            if (total === null || isNaN(total)) total = round2(net + vat);
            const flags: string[] = [...(verdict?.flags ?? [])];
            const no = String(v.invoice_no).trim(), sup = String(v.supplier).trim() || 'Supplier';
            if (no) { const dup = ((await fdb.from('purchase_invoices').select('supplier_name').eq('invoice_no', no)).data as Row[] | null) ?? []; if (dup.some((d) => String(d.supplier_name || '').trim().toLowerCase() === sup.toLowerCase())) flags.push('possible duplicate of an invoice already entered'); }
            // 9219b finInboxFileCore: invoices on a PO adding up to more than its value go in as a query.
            if (po) {
              const pr = ((await fdb.from('purchase_orders').select('value').eq('id', po).maybeSingle()).data as Row | null);
              const sofar = (((await fdb.from('purchase_invoices').select('net').eq('po_id', po).neq('status', 'rejected')).data as Row[] | null) ?? []).reduce((t, x) => t + Number(x.net || 0), 0) + net;
              if (pr?.value != null && sofar > Number(pr.value) + 0.005) flags.push(`${money(sofar - Number(pr.value))} over the PO value of ${money(pr.value)}`);
            }
            const r = await rpc('fin_inbox_file', { p_id: it.id, p_pi: { site_id: sid, po_id: po || null, supplier_name: sup, invoice_no: no || null, invoice_date: String(v.date) || today(), net: round2(net), vat: round2(vat), total: round2(total), status: flags.length ? 'query' : 'to_approve', query_note: flags.length ? flags.join('; ') : null } });
            if (r.error) return r.error.code === 'PGRST202' ? 'Filing isn’t available yet on the server — file it in the current app.' : `Couldn’t file it — ${r.error.message}. It’s still in the inbox.`;
            const d = r.data as Row | null;
            if (!d?.ok) return d?.why === 'busy' ? 'Someone started filing this a moment ago. If it’s still here in 5 minutes, file it again.' : d?.why === 'taken' ? 'This one has just been filed by someone else.' : `Couldn’t file it — ${WHY[d?.why] || 'please try again'}.`;
            toast(flags.length ? `Filed and flagged: ${flags[0]}` : 'Filed — waiting for approval');
            ['finInbox', 'finPurchases', 'finOverview', 'finBook'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
            if (d.pi && lines?.length) await saveLinesOnInvoice(d.pi as Row, lines, flags);
            if (d.pi?.id) router.replace(`/fin/pinv/${d.pi.id}` as never);
            return null;
          }} />
      )}
    </ScrollView>
    </DocSplit>
  );
}
