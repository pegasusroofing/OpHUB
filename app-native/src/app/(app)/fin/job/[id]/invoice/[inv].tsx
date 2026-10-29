// A sales invoice (901 renderFinInvoice / renderFinInvoiceDraft). "new" makes
// a draft from the project's billing details. Drafts: who it's to, dates,
// lines with VAT per line, notes, Save / Issue / Delete. Issued: PDF,
// payments received, void. Emailing and Xero are off during the Finance trial.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { FinRow, FinStat } from '@/components/FinNav';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { openDocLink } from '@/data/hs';
import { addPayment, deleteDraft, deletePayment, draftRow, issue, loadInvoice, newInvoice, saveDraft, storePdf, voidInvoice } from '@/data/finInvoice';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { fdate, INV_STATUS, invOutstanding, invOverdue, money, num, today } from '@/lib/rules/finance';
import { INV_VAT, invTotals, issueProblem, lineVat } from '@/lib/rules/finInvoice';
import { base, page, radius, space } from '@/theme/theme';

type Row = Record<string, any>;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card };

export default function FinInvoice() {
  const { id, inv: invId } = useLocalSearchParams<{ id: string; inv: string }>();
  const { me } = useAuth();
  const { data: site } = useSite(id);
  const toast = useToast();
  const made = useRef(false);
  useEffect(() => {
    if (invId !== 'new' || made.current || !me || !site) return;
    made.current = true;
    void newInvoice(me, site as never).then((nid) => { if (nid) router.replace(`/fin/job/${id}/invoice/${nid}` as never); else toast('Could not start an invoice — try again.'); });
  }, [invId, me, site, id, toast]);
  const { data, isLoading } = useQuery({ queryKey: ['finInvoice', invId], enabled: invId !== 'new', gcTime: 0, queryFn: () => loadInvoice(invId) });
  if (invId === 'new' || isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!data?.inv) return <Muted style={{ padding: space.l }}>Invoice not found.</Muted>;
  return data.inv.status === 'draft' ? <Draft key={data.inv.id} inv={data.inv} site={site as Row} /> : <Issued inv={data.inv} pays={data.pays} site={site as Row} />;
}

function Draft({ inv, site }: { inv: Row; site: Row | undefined }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [d, setD] = useState<Row>(() => { const x = JSON.parse(JSON.stringify(inv)); if (!Array.isArray(x.lines) || !x.lines.length) x.lines = [{ description: '', amount: null }]; x.lines.forEach((l: Row) => { if (!INV_VAT[l.vat]) l.vat = lineVat(l, x.vat_treatment, x.vat_rate); l.amount = l.amount == null ? '' : String(l.amount); }); return x; });
  const [busy, setBusy] = useState('');
  if (!me) return null;
  const t = invTotals(d.lines, d.vat_treatment, d.vat_rate);
  const set = (k: string, v: unknown) => setD({ ...d, [k]: v });
  const setLine = (i: number, k: string, v: unknown) => setD({ ...d, lines: d.lines.map((l: Row, j: number) => (j === i ? { ...l, [k]: v } : l)) });
  const field = (k: string, label: string, o: { multiline?: boolean; half?: boolean; ph?: string } = {}) => (
    <View style={{ flexBasis: o.half ? '47%' : '100%', flexGrow: 1, marginBottom: 8 }}><Muted style={{ fontWeight: '700' }}>{label}</Muted><TextInput value={String(d[k] ?? '')} onChangeText={(v) => set(k, v)} multiline={o.multiline} placeholder={o.ph} style={[box, o.multiline ? { minHeight: 60 } : null]} /></View>
  );
  const refresh = () => { ['finInvoice', 'finSales', 'finBook', 'finOverview', 'finJobs'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  return (
    <ScrollView contentContainerStyle={page(900)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Draft invoice' }} />
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 }}>
          {field('bill_name', 'Bill to')}{field('bill_address', 'Billing address', { multiline: true })}{field('bill_email', 'Accounts email', { half: true })}
          {field('client_po', 'Client PO', { half: true })}{field('issue_date', 'Invoice date', { half: true, ph: 'YYYY-MM-DD' })}{field('due_date', 'Due date', { half: true, ph: 'YYYY-MM-DD' })}
        </View>
      </Card>
      <SectionTitle>Lines</SectionTitle>
      {d.lines.map((l: Row, i: number) => (
        <Card key={i} style={{ padding: 10 }}>
          <TextInput value={l.description || ''} onChangeText={(v) => setLine(i, 'description', v)} placeholder="Description" multiline style={[box, { marginBottom: 6 }]} />
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <TextInput value={String(l.amount ?? '')} onChangeText={(v) => setLine(i, 'amount', v)} placeholder="£0.00" keyboardType="decimal-pad" style={[box, { flex: 1 }]} />
            <Pressable onPress={async () => { const k = await chooseAction('VAT', Object.entries(INV_VAT).map(([key, v]) => ({ key, label: v.l }))); if (k) setLine(i, 'vat', k); }} style={box}><Text style={{ color: base.ink }}>{INV_VAT[l.vat]?.s || 'VAT'} ▾</Text></Pressable>
            {d.lines.length > 1 && <Pressable hitSlop={8} onPress={() => setD({ ...d, lines: d.lines.filter((_: Row, j: number) => j !== i) })}><Text>🗑</Text></Pressable>}
          </View>
        </Card>
      ))}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <View style={{ flex: 1 }}><Button kind="ghost" title="+ Add line" onPress={() => setD({ ...d, lines: [...d.lines, { description: '', amount: '', vat: d.lines[d.lines.length - 1]?.vat }] })} /></View>
        <View style={{ flex: 1 }}><Button kind="ghost" title="VAT for all lines" onPress={async () => { const k = await chooseAction('VAT for every line', Object.entries(INV_VAT).map(([key, v]) => ({ key, label: v.l }))); if (k) setD({ ...d, lines: d.lines.map((l: Row) => ({ ...l, vat: k })) }); }} /></View>
      </View>
      <Card>
        <FinRow title="Net" right={money(t.net)} />
        {Object.keys(t.by).filter((k) => !INV_VAT[k].rc && INV_VAT[k].r > 0).map((k) => <FinRow key={k} title={`VAT @ ${INV_VAT[k].l}${t.mixed ? ` on ${money(t.by[k].net)}` : ''}`} right={money(t.by[k].vat)} />)}
        <FinRow title="Total" right={money(t.total)} />
        {t.vatDue ? <Muted>Reverse charge VAT {money(t.vatDue)} — the client pays this to HMRC; not added to the total.</Muted> : null}
      </Card>
      {field('notes', 'Notes on the invoice', { multiline: true })}
      <View style={{ gap: 8 }}>
        <Button kind="ghost" busy={busy === 'save'} title="Save draft" onPress={async () => { setBusy('save'); const e = await saveDraft(inv.id, d); setBusy(''); toast(e || 'Draft saved'); refresh(); }} />
        <Button busy={busy === 'issue'} title="Issue invoice…" onPress={async () => {
          const row = draftRow(d), p = issueProblem(row);
          if (p) { toast(p); return; }
          if (!(await confirmAsk(`Issue this invoice for ${money(row.total)}${row.vat ? ' (incl. VAT)' : ''}?\n\nIt gets the next invoice number and can’t be changed afterwards.`, 'Issue invoice'))) return;
          setBusy('issue');
          try {
            const e = await saveDraft(inv.id, d); if (e) { toast(e); return; }
            const r = await issue(me, org, inv.id, site);
            if (r.error) { toast(r.error); return; }
            toast(`Invoice ${r.inv?.number} issued${r.xero ? ' — not posted to Xero (Finance trial)' : ''}`); refresh();
          } finally { setBusy(''); }
        }} />
        <Button kind="ghost" title="Delete draft" onPress={async () => { if (!(await confirmAsk('Delete this draft invoice?', 'Delete'))) return; if (await deleteDraft(inv.id)) { toast('Draft deleted'); refresh(); router.back(); } else toast('Could not delete.'); }} />
      </View>
    </ScrollView>
  );
}

function Issued({ inv, pays, site }: { inv: Row; pays: Row[]; site: Row | undefined }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [pay, setPay] = useState(false);
  if (!me) return null;
  const out = invOutstanding(inv as never), t = invTotals(inv.lines, inv.vat_treatment, inv.vat_rate);
  const refresh = () => { ['finInvoice', 'finSales', 'finBook', 'finOverview', 'finJobs'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  return (
    <ScrollView contentContainerStyle={page(900)}>
      <Stack.Screen options={{ title: inv.number || 'Invoice' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <FinStat v={inv.number || '—'} label="Invoice" /><FinStat v={invOverdue(inv as never) ? 'Overdue' : INV_STATUS[inv.status] || inv.status} label="Status" hot={invOverdue(inv as never)} />
        <FinStat v={money(inv.total)} label="Total" /><FinStat v={money(out)} label="Outstanding" hot={out > 0} />
      </View>
      <Card>
        <FinRow title="Bill to" right={inv.bill_name || site?.client_name || '—'} /><FinRow title="Issued" right={fdate(inv.issue_date)} /><FinRow title="Due" right={fdate(inv.due_date)} />
        <FinRow title="Sent" right={inv.sent_at ? `${fdate(String(inv.sent_at).slice(0, 10))}${inv.sent_to ? ` to ${inv.sent_to}` : ''}` : 'Not emailed yet'} />
      </Card>
      <SectionTitle>Lines</SectionTitle>
      <Card>
        {(inv.lines || []).map((l: Row, i: number) => <FinRow key={i} title={l.description || ''} sub={t.mixed ? INV_VAT[lineVat(l, inv.vat_treatment, inv.vat_rate)].l : undefined} right={money(l.amount)} />)}
        <FinRow title="Net" right={money(t.net)} /><FinRow title="VAT" right={money(t.vat)} /><FinRow title="Total" right={money(t.total)} />
        {t.vatDue ? <Muted>Reverse charge VAT {money(t.vatDue)} — paid by the client to HMRC.</Muted> : null}
      </Card>
      <Button title="View PDF" onPress={async () => {
        let p = inv.pdf_path; if (!p) p = await storePdf(me, org, inv, site);
        const u = p ? await openDocLink('finance-docs', p) : null; if (u) void Linking.openURL(u); else toast('Could not build the PDF.');
      }} />
      <Muted style={{ marginVertical: 6 }}>Emailing invoices and reminders is switched off while Finance is on trial.</Muted>
      {inv.status !== 'void' ? (
        <>
          <SectionTitle>Payments</SectionTitle>
          <Card>
            {pays.length ? pays.map((p) => <FinRow key={p.id} title={`${fdate(p.paid_on)}${p.note ? ` · ${p.note}` : ''}`} right={money(p.amount)} onPress={async () => { if (await confirmAsk('Remove this payment?', 'Remove')) { if (await deletePayment(p.id)) { toast('Payment removed'); refresh(); } } }} />) : <Muted>No payments recorded yet.</Muted>}
            {out > 0 && <View style={{ marginTop: 8 }}><Button kind="ghost" title="+ Record payment" onPress={() => setPay(true)} /></View>}
          </Card>
          <Button kind="ghost" title="Void this invoice" onPress={async () => { if (!(await confirmAsk('Void this invoice? This can’t be undone.', 'Void'))) return; if (await voidInvoice(inv.id)) { toast('Invoice voided'); refresh(); } }} />
          <Muted style={{ marginTop: 6 }}>Issued invoices can&apos;t be changed. To correct one, void it and raise a new one.</Muted>
        </>
      ) : <Card><Muted>This invoice was voided.</Muted></Card>}
      {pay && (
        <FinForm title="Record payment" initial={{ amount: String(out), paid_on: today() }} onClose={() => setPay(false)}
          fields={[{ k: 'amount', label: 'Amount received (£)', kind: 'money', half: true }, { k: 'paid_on', label: 'Date received', kind: 'date', half: true }, { k: 'note', label: 'Note (optional)', ph: 'e.g. BACS, remittance ref' }]}
          onSave={async (v) => { const a = num(v.amount); if (a === null || isNaN(a) || a <= 0) return 'Enter the amount received.'; if (!(await addPayment(me, inv.id, a, String(v.paid_on), String(v.note)))) return 'Could not save.'; toast('Payment recorded'); refresh(); return null; }} />
      )}
    </ScrollView>
  );
}
