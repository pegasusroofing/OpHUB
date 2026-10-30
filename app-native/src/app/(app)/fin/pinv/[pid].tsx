// A purchase invoice or receipt (904 openPurchaseInvoiceView / Form). "new"
// (?site=&po=) adds one by hand with the duplicate check; otherwise approve,
// query, reject, mark paid and open the file.
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { SelectBox } from '@/components/SelectBox';
import { FinForm } from '@/components/FinForm';
import { AllocRow } from '@/components/FinSplit';
import { XeroRow } from '@/components/FinXero';
import { FinRow, FinStat } from '@/components/FinNav';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Check, Muted, SectionTitle } from '@/components/ui';
import { fdb } from '@/data/finance';
import { viewDoc } from '@/components/DocViewer';
import { openDocLink } from '@/data/hs';
import { addPinv, duplicateOf, isInXero, loadPinv, setPinvCostCode, setPinvPaid, setPinvStatus } from '@/data/finPurchase';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { COST_CATS, PI_STATUS } from '@/lib/rules/finBook';
import { codePatch, codeStart, type CodeLine } from '@/lib/rules/piCode';
import { fdate, jobTag, money, num, round2, today } from '@/lib/rules/finance';
import { base, page, space } from '@/theme/theme';

const XERO_Q = 'This is already in Xero. Changing it here won’t change Xero — change it in Xero too, or the two won’t match.';

type Row = Record<string, any>;
export default function FinPinv() {
  const { pid, site, po, receipt } = useLocalSearchParams<{ pid: string; site?: string; po?: string; receipt?: string }>();
  if (pid === 'new') return <NewPinv siteId={site || ''} poId={po || ''} receipt={receipt === '1'} />;
  return <ViewPinv id={pid} />;
}

function NewPinv({ siteId, poId, receipt }: { siteId: string; poId: string; receipt: boolean }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const [file, setFile] = useState<{ uri: string; name: string; mimeType?: string | null } | null>(null);
  const [dupOk, setDupOk] = useState('');
  const [isReceipt, setIsReceipt] = useState(receipt);
  if (!me) return null;
  return (
    <ScrollView contentContainerStyle={page(700)}>
      <Stack.Screen options={{ title: isReceipt ? 'Add a receipt' : 'Add a purchase invoice' }} />
      <Muted style={{ marginBottom: 8 }}>{jobTag(sites.find((s) => s.id === siteId))}</Muted>
      <Check label="This is a receipt (no invoice number)" value={isReceipt} onChange={setIsReceipt} />
      <Pressable onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) setFile({ uri: r.assets[0].uri, name: r.assets[0].name, mimeType: r.assets[0].mimeType }); }} style={{ marginVertical: 8 }}><Text style={{ color: base.blue }}>📎 {file ? file.name : 'Attach the invoice (PDF or photo)'}</Text></Pressable>
      <FinForm title={isReceipt ? 'Receipt' : 'Purchase invoice'} initial={{ invoice_date: today(), cost_code: 'materials', po_id: poId }} onClose={() => router.back()} saveLabel="Save"
        fields={[
          { k: 'supplier', label: 'Supplier' }, ...(isReceipt ? [] : [{ k: 'invoice_no', label: 'Invoice number', half: true }] as never[]), { k: 'invoice_date', label: 'Date', kind: 'date', half: true },
          { k: 'net', label: 'Net £', kind: 'money', half: true }, { k: 'vat', label: 'VAT £', kind: 'money', half: true }, { k: 'total', label: 'Total £ (blank = net + VAT)', kind: 'money', half: true }, { k: 'due_date', label: 'Due date', kind: 'date', half: true },
          { k: 'cost_code', label: 'Cost type', kind: 'choice', options: Object.entries(COST_CATS) }, { k: 'description', label: 'Description' },
        ]}
        onSave={async (v) => {
          const supplier = String(v.supplier).trim(), no = String(v.invoice_no || '').trim(), net = num(v.net), vat = num(v.vat) || 0, total = num(v.total);
          if (!supplier) return 'Enter the supplier.';
          if (!isReceipt && !no) return 'Enter the invoice number.';
          if (net === null || isNaN(net)) return 'Enter the net amount.';
          const key = `${supplier.toLowerCase()}|${no.toLowerCase()}`;
          if (no && dupOk !== key) { const d = await duplicateOf(supplier, no); if (d) { setDupOk(key); return `Possible duplicate: ${supplier} invoice ${no} is already on ${jobTag(sites.find((s) => s.id === d.site_id)) || 'another project'} (${fdate(d.invoice_date)}). Save again to add it anyway.`; } }
          const r = await addPinv(me, siteId, { supplier, invoice_no: no, invoice_date: String(v.invoice_date), net, vat, total: total === null || isNaN(total) ? null : total, due_date: String(v.due_date).trim() || null, description: String(v.description).trim(), cost_code: v.cost_code, po_id: poId || null, receipt: isReceipt }, file);
          if (r.error) return r.error;
          toast(r.flags.length ? `Saved and flagged: ${r.flags[0]}` : 'Saved — waiting for approval');
          ['finPurchases', 'finBook', 'finPo'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
          return null;
        }} />
    </ScrollView>
  );
}

function ViewPinv({ id }: { id: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const { data, isLoading } = useQuery({ queryKey: ['finPinv', id], queryFn: () => loadPinv(id) });
  if (!me) return null;
  if (isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const i = data?.i; if (!i) return <Muted style={{ padding: space.l }}>Purchase invoice not found.</Muted>;
  const refresh = () => ['finPinv', 'finPurchases', 'finBook', 'finOverview', 'finPo'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  const status = async (s: string, label: string, note?: string) => {
    if ((s === 'rejected' || s === 'query') && (await isInXero('purchase_invoices', id)) && !(await confirmAsk(`${label}?\n\n${XERO_Q}`, 'I’ll change Xero too'))) return;
    const r = await setPinvStatus(me, id, s, note);
    if (!r.ok) { toast('Could not update — try again.'); return; }
    toast(s === 'approved' ? `Approved${r.xero ? ' — not posted to Xero (Finance trial)' : ''}` : s === 'rejected' ? 'Rejected' : 'Marked as query'); refresh();
  };
  return (
    <ScrollView contentContainerStyle={page(800)}>
      <Stack.Screen options={{ title: i.supplier_name || 'Purchase invoice' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <FinStat v={i.paid_on ? 'Paid' : PI_STATUS[i.status] || i.status} label="Status" hot={i.status === 'query'} /><FinStat v={money(i.net)} label="Net" /><FinStat v={money(i.total)} label="Gross" />
      </View>
      {i.query_note && i.status === 'query' && <Card style={{ backgroundColor: '#FDECEA' }}><Text style={{ color: '#8E2B20' }}>⚠ {i.query_note}</Text></Card>}
      <Card>
        <FinRow title="Supplier" right={i.supplier_name || '—'} /><FinRow title={i.kind === 'receipt' ? 'Receipt' : 'Invoice no.'} right={i.invoice_no || '—'} /><FinRow title="Date" right={fdate(i.invoice_date)} />
        <FinRow title="Project" right={jobTag(sites.find((s) => s.id === i.site_id))} onPress={() => router.push(`/fin/job/${i.site_id}` as never)} />
        <FinRow title="PO" right={data?.po ? data.po.number : 'No PO'} onPress={data?.po ? () => router.push(`/fin/po/${data.po!.id}` as never) : undefined} />
        <FinRow title="Cost type" right={COST_CATS[i.cost_code] || 'Materials'} onPress={async () => {
          // Change it after saving (904 setFinPiCostCode) — a bill already in Xero keeps its old account code there.
          const k = await chooseAction('Cost type', Object.entries(COST_CATS).filter(([c]) => c !== 'labour').map(([key, label]) => ({ key, label }))); if (!k || k === (i.cost_code || 'materials')) return;
          if ((await isInXero('purchase_invoices', id)) && !(await confirmAsk(`Change the cost type to ${COST_CATS[k]}?\n\n${XERO_Q}`, 'I’ll change Xero too'))) return;
          toast((await setPinvCostCode(id, k)) ? `Cost type: ${COST_CATS[k]}` : 'Could not save — try again.'); refresh();
        }} /><FinRow title="VAT" right={money(i.vat)} />
        <AllocRow table="purchase_invoices" row={i} po={data?.po} onSaved={refresh} />
        {i.due_date && <FinRow title="Due" right={fdate(i.due_date)} />}{i.description && <FinRow title="Description" right={i.description} />}
        {i.paid_on && <FinRow title="Paid" right={fdate(i.paid_on)} />}
        <XeroRow kind="bill" rec={i} onDone={refresh} />
      </Card>
      <CodeLines i={i} sites={sites} onSaved={refresh} />
      {i.file_path && <Button kind="ghost" title={`📄 ${i.file_name || 'Open the invoice'}`} onPress={async () => { const u = await openDocLink('finance-docs', i.file_path); if (u) viewDoc(u); else toast('Could not open the file.'); }} />}
      <View style={{ gap: 8, marginTop: 10 }}>
        {i.status !== 'approved' && i.status !== 'rejected' && <Button title="✓ Approve" onPress={() => void status('approved', 'Approve')} />}
        {i.status !== 'query' && i.status !== 'rejected' && <Button kind="ghost" title="Query" onPress={async () => { const n = await promptText('What needs checking?', ''); if (n !== null) void status('query', 'Mark this purchase invoice as a query', n.trim() || 'Query'); }} />}
        {i.status === 'approved' && <Button kind="ghost" title={i.paid_on ? 'Remove paid date' : 'Mark paid today'} onPress={async () => { if (await setPinvPaid(id, i.paid_on ? null : today())) { toast(i.paid_on ? 'Paid date removed' : 'Marked paid'); refresh(); } }} />}
        {i.status !== 'rejected' && <Button kind="ghost" title="Reject" onPress={async () => { if (await confirmAsk('Reject this purchase invoice?', 'Reject')) void status('rejected', 'Reject this purchase invoice'); }} />}
      </View>
      <Muted style={{ marginTop: 8 }}>Net {money(i.net)} · VAT {money(i.vat)} · gross {money(round2(Number(i.net) + Number(i.vat || 0)))}</Muted>
    </ScrollView>
  );
}

// Code each line to a project and cost type (9219g): one invoice can cover several jobs.
function CodeLines({ i, sites, onSaved }: { i: Row; sites: { id: string; job_number?: string | null; name?: string | null; status?: string | null }[]; onSaved: () => void }) {
  const toast = useToast();
  const [lines, setLines] = useState<CodeLine[] | null>(null);
  const items = ((i.lines || []) as Row[]).filter((l) => l && (l.kind || 'item') !== 'total');
  if (!items.length) return null;
  if (!lines) return <Button small kind="ghost" title={`🏷 Code each line (${items.length}) to a project / cost type`} onPress={() => setLines(codeStart(i, COST_CATS))} />;
  const pick = sites.filter((x) => x.status !== 'closed' || lines.some((l) => l.site_id === x.id)).slice().sort((a, b) => String(b.job_number || '').localeCompare(String(a.job_number || ''), undefined, { numeric: true }));
  const tot = round2(lines.reduce((t, l) => t + Number(l.amount || 0), 0));
  return (
    <Card>
      <SectionTitle>Code each line</SectionTitle>
      <Muted style={{ marginBottom: 6 }}>Pick the project and cost type for each line. One invoice can cover several jobs.</Muted>
      {lines.map((l, k) => (
        <View key={k} style={{ borderTopWidth: k ? 1 : 0, borderTopColor: base.line, paddingVertical: 6 }}>
          <View style={{ flexDirection: 'row' }}><Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{l.description || `Line ${k + 1}`}</Text><Text style={{ fontWeight: '700', color: base.ink }}>{money(l.amount)}</Text></View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            <SelectBox value={l.site_id} title="Project" options={pick.map((x) => [x.id, jobTag(x)] as [string, string])} onChange={(v) => setLines(lines.map((y, j) => (j === k ? { ...y, site_id: v } : y)))} style={{ marginBottom: 0, minWidth: 220, flexGrow: 1 }} />
            <SelectBox value={l.cost_code} title="Cost type" options={Object.entries(COST_CATS).filter(([c]) => c !== 'labour')} onChange={(v) => setLines(lines.map((y, j) => (j === k ? { ...y, cost_code: v } : y)))} style={{ marginBottom: 0, minWidth: 170 }} />
          </View>
        </View>
      ))}
      <FinRow title="Lines total (net)" right={money(tot)} />
      {Math.abs(tot - Number(i.net || 0)) >= 0.5 && <Text style={{ color: base.warn, marginBottom: 6 }}>The lines add up to {money(tot)}, the invoice net is {money(i.net)}. The invoice total is shared in the same proportions.</Text>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button small title="Save coding" onPress={async () => {
          const r = codePatch(i, lines); if ('error' in r) { toast(r.error); return; }
          const before = Array.from(new Set(Array.isArray(i.split) && i.split.length ? i.split.map((e: Row) => e.site_id) : [i.site_id])).sort().join(), after = Array.from(new Set(r.patch.split ? r.patch.split.map((e: Row) => e.site_id) : [i.site_id])).sort().join();
          if (before !== after && (await isInXero('purchase_invoices', i.id)) && !(await confirmAsk(`Save this coding? It moves cost between projects.\n\n${XERO_Q}`, 'I’ll change Xero too'))) return;
          if (!(await fdb.from('purchase_invoices').update(r.patch as never).eq('id', i.id).select('id')).data?.length) { toast('Could not save the coding.'); return; }
          setLines(null); onSaved();
        }} />
        <Button small kind="ghost" title="Cancel" onPress={() => setLines(null)} />
      </View>
    </Card>
  );
}
