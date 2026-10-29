// A purchase invoice or receipt (904 openPurchaseInvoiceView / Form). "new"
// (?site=&po=) adds one by hand with the duplicate check; otherwise approve,
// query, reject, mark paid and open the file.
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { FinRow, FinStat } from '@/components/FinNav';
import { confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Check, Muted } from '@/components/ui';
import { openDocLink } from '@/data/hs';
import { addPinv, duplicateOf, isInXero, loadPinv, setPinvPaid, setPinvStatus } from '@/data/finPurchase';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { COST_CATS, PI_STATUS } from '@/lib/rules/finBook';
import { fdate, jobTag, money, num, round2, today } from '@/lib/rules/finance';
import { base, page, space } from '@/theme/theme';

const XERO_Q = 'This is already in Xero. Changing it here won’t change Xero — change it in Xero too, or the two won’t match.';

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
        <FinRow title="Cost type" right={COST_CATS[i.cost_code] || 'Materials'} /><FinRow title="VAT" right={money(i.vat)} />
        {i.due_date && <FinRow title="Due" right={fdate(i.due_date)} />}{i.description && <FinRow title="Description" right={i.description} />}
        {i.paid_on && <FinRow title="Paid" right={fdate(i.paid_on)} />}
      </Card>
      {i.file_path && <Button kind="ghost" title={`📄 ${i.file_name || 'Open the invoice'}`} onPress={async () => { const u = await openDocLink('finance-docs', i.file_path); if (u) void Linking.openURL(u); else toast('Could not open the file.'); }} />}
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
