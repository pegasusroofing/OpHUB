// A sales invoice (901 renderFinInvoice / renderFinInvoiceDraft). "new" makes
// a draft from the project's billing details. Drafts: who it's to, dates,
// lines with VAT per line, notes, Save / Issue / Delete. Issued: PDF,
// payments received, void. Emailing and Xero are off during the Finance trial.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { ThinExportBar } from '@/components/FinFilterBar';
import { FinRow, FinStat } from '@/components/FinNav';
import { OphIcon } from '@/components/OphIcon';
import { XeroRow } from '@/components/FinXero';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { DateBox } from '@/components/DateField';
import { openDocLink } from '@/data/hs';
import { SelectBox } from '@/components/SelectBox';
import { subNoun, useSubJobs } from '@/data/finSubJobs';
import { addPayment, deleteDraft, deletePayment, draftRow, issue, loadInvoice, newInvoice, saveDraft, saveIssuedLines, storePdf, voidInvoice } from '@/data/finInvoice';
import { fdb, finInvoke, useFinSettings } from '@/data/finance';
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

/** The plot or repair job an invoice is for, for the plot-by-plot figures (Andy, 2 Nov 2026). Saved straight away, even once issued: it's only for reporting and doesn't appear on the invoice. */
function InvoicePlot({ inv, site, onSet }: { inv: Row; site: Row | undefined; onSet: (v: string | null) => void }) {
  const toast = useToast();
  const { data: subs = [] } = useSubJobs(site as never);
  if (!subs.length) return null;
  return (
    <SelectBox label={subNoun(site as never)} title={subNoun(site as never)} value={inv.sub_job_id || '-'} options={[['-', 'Not booked to one'], ...subs.map((j) => [j.id, j.short] as [string, string])]}
      onChange={async (k) => {
        const v = k === '-' ? null : k;
        const r = await fdb.from('fin_invoices').update({ sub_job_id: v } as never).eq('id', inv.id).select('id');
        if (!r.data?.length) { toast('Not saved — try again.'); return; }
        onSet(v);
      }} style={{ marginTop: 6, marginBottom: 4 }} />
  );
}

const RED = '#C0392B';
/** Red for money below nought, on screen only (Andy, 3 Nov 2026). */
const minusTone = (n: unknown) => (Number(n) < 0 ? RED : undefined);
/** The company's default sales code (Xero account), used on any line without its own. */
function useSalesCode() {
  const { me } = useAuth();
  const { data: st } = useFinSettings(me?.org_id);
  return String((st as Row | undefined)?.xero_sales_account || '200');
}

/** Saved lines: read only, with a small Edit lines link. */
function LinesView({ lines, mixed, vatOf, note, onEdit }: { lines: Row[]; mixed: boolean; vatOf: (l: Row) => string; note?: string; onEdit: () => void }) {
  const def = useSalesCode();
  return (
    <Card>
      {lines.map((l: Row, i: number) => <FinRow key={i} title={l.description || ''} sub={[mixed ? INV_VAT[vatOf(l)]?.l : '', l.account && l.account !== def ? `Sales code ${l.account}` : ''].filter(Boolean).join(' · ') || undefined} right={money(num(l.amount) || 0)} tone={minusTone(num(l.amount))} />)}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
        <Muted style={{ flex: 1 }}>{note ? `${note} ` : ''}Saved lines are locked.</Muted>
        <Text accessibilityRole="button" onPress={onEdit} style={{ fontSize: 11.5, color: base.slate, textDecorationLine: 'underline' }}>Edit lines</Text>
      </View>
    </Card>
  );
}
/** The lines being typed: description, then the amount (with its £), VAT and sales code on each; add a line, VAT for all. */
function LinesEdit({ d, setD }: { d: Row; setD: (d: Row) => void }) {
  const def = useSalesCode();
  const [typing, setTyping] = useState<number | null>(null);
  const setLine = (i: number, k: string, v: unknown) => setD({ ...d, lines: d.lines.map((l: Row, j: number) => (j === i ? { ...l, [k]: v } : l)) });
  const used = [...new Set((d.lines as Row[]).map((l) => String(l.account || '')).filter((c) => c && c !== def))];
  const chooseCode = async (i: number) => {
    const k = await chooseAction('Sales code', [{ key: def, label: `${def} — default sales` }, ...used.map((c) => ({ key: c, label: c })), { key: '__type', label: 'Type another code…' }]);
    if (k === '__type') setTyping(i); else if (k) setLine(i, 'account', k === def ? null : k);
  };
  const chip = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 9, height: 40, justifyContent: 'center' as const, backgroundColor: base.card };
  return (
    <>
      {d.lines.map((l: Row, i: number) => {
        const neg = (num(l.amount) ?? 0) < 0;
        return (
        <Card key={i} style={{ padding: 10 }}>
          <TextInput value={l.description || ''} onChangeText={(v) => setLine(i, 'description', v)} placeholder="Description" multiline style={[box, { marginBottom: 6 }]} />
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <View style={[chip, { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 2 }]}>
              <Text style={{ color: neg ? RED : base.slate, fontWeight: '500' }}>£</Text>
              <TextInput accessibilityLabel={`Line ${i + 1} amount`} value={String(l.amount ?? '')} onChangeText={(v) => setLine(i, 'amount', v.replace(/[£\s]/g, ''))} placeholder="0.00" keyboardType="numbers-and-punctuation" style={{ flex: 1, minWidth: 0, height: 38, color: neg ? RED : base.ink, fontSize: 15 }} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="VAT" onPress={async () => { const k = await chooseAction('VAT', Object.entries(INV_VAT).map(([key, v]) => ({ key, label: v.l }))); if (k) setLine(i, 'vat', k); }} style={chip}><Text style={{ color: base.ink }}>{INV_VAT[l.vat]?.s || 'VAT'} ▾</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Sales code" onPress={() => void chooseCode(i)} style={chip}><Text style={{ color: base.ink }}>{l.account || def} ▾</Text></Pressable>
            {d.lines.length > 1 && <Pressable hitSlop={8} accessibilityLabel="Remove line" onPress={() => setD({ ...d, lines: d.lines.filter((_: Row, j: number) => j !== i) })}><Text>🗑</Text></Pressable>}
          </View>
        </Card>
        );
      })}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <View style={{ flex: 1 }}><Button kind="ghost" title="+ Add line" onPress={() => setD({ ...d, lines: [...d.lines, { description: '', amount: '', vat: d.lines[d.lines.length - 1]?.vat, account: d.lines[d.lines.length - 1]?.account || null }] })} /></View>
        <View style={{ flex: 1 }}><Button kind="ghost" title="VAT for all lines" onPress={async () => { const k = await chooseAction('VAT for every line', Object.entries(INV_VAT).map(([key, v]) => ({ key, label: v.l }))); if (k) setD({ ...d, lines: d.lines.map((l: Row) => ({ ...l, vat: k })) }); }} /></View>
      </View>
      {typing != null && (
        <FinForm title="Sales code" note="The Xero account code for this line, e.g. 200 for sales." initial={{ code: d.lines[typing]?.account || '' }} fields={[{ k: 'code', label: 'Code', ph: def }]} onClose={() => setTyping(null)}
          onSave={async (v) => { const c = String(v.code || '').trim(); if (!c) return 'Type the code.'; setLine(typing, 'account', c === def ? null : c); return null; }} />
      )}
    </>
  );
}

/** A detail that reads as text until tapped, then a box to change it (Andy, 3 Nov 2026): the Directory fills these in. */
function TapField({ label, value, onChange, multiline, half, email }: { label: string; value: unknown; onChange: (v: string) => void; multiline?: boolean; half?: boolean; email?: boolean }) {
  const v = String(value ?? '');
  const [on, setOn] = useState(false);
  return (
    <View style={{ flexBasis: half ? '47%' : '100%', flexGrow: 1, marginBottom: 8 }}>
      <Muted style={{ fontWeight: '500' }}>{label}</Muted>
      {on ? <TextInput autoFocus value={v} onChangeText={onChange} onBlur={() => setOn(false)} multiline={multiline} autoCapitalize={email ? 'none' : 'sentences'} keyboardType={email ? 'email-address' : 'default'} style={[box, multiline ? { minHeight: 60 } : null]} />
        : (
          <Pressable accessibilityRole="button" accessibilityLabel={`Change ${label.toLowerCase()}`} onPress={() => setOn(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 11, paddingVertical: 8, borderRadius: radius.input, backgroundColor: '#F6F7F9' }}>
            <Text numberOfLines={multiline ? 4 : 1} style={{ flex: 1, color: v ? base.ink : base.slate, fontSize: 15 }}>{v || 'Tap to add'}</Text>
            <OphIcon name="pencil" size={14} color={base.slate} />
          </Pressable>
        )}
    </View>
  );
}

function Draft({ inv, site }: { inv: Row; site: Row | undefined }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [d, setD] = useState<Row>(() => { const x = JSON.parse(JSON.stringify(inv)); if (!Array.isArray(x.lines) || !x.lines.length) x.lines = [{ description: '', amount: null }]; x.lines.forEach((l: Row) => { if (!INV_VAT[l.vat]) l.vat = lineVat(l, x.vat_treatment, x.vat_rate); l.amount = l.amount == null ? '' : String(l.amount); }); return x; });
  const [busy, setBusy] = useState('');
  // Lines are locked once saved (Andy, 3 Nov 2026): a new, empty draft starts open; Edit lines opens them again.
  const [editing, setEditing] = useState(() => inv.source !== 'certificate' && !(inv.lines || []).some((l: Row) => String(l.description || '').trim() || (l.amount != null && l.amount !== '')));
  // The client's name, address and accounts email come from the Directory (by the name on the job), so there's nothing to type.
  useEffect(() => {
    const name = String(inv.bill_name || site?.client_name || '').trim();
    if (!name || !me?.org_id || (inv.bill_name && inv.bill_address && inv.bill_email)) return;
    let live = true;
    void fdb.from('fin_clients').select('name,address,postcode,email').eq('org_id', me.org_id).then(({ data }: { data: unknown }) => {
      const c = ((data as Row[] | null) ?? []).find((x) => String(x.name || '').trim().toLowerCase() === name.toLowerCase());
      if (!c || !live) return;
      setD((x) => ({ ...x, bill_name: x.bill_name || c.name, bill_address: x.bill_address || [c.address, c.postcode].filter(Boolean).join('\n') || null, bill_email: x.bill_email || c.email || null }));
    });
    return () => { live = false; };
  }, [site?.client_name, me?.org_id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return null;
  const t = invTotals(d.lines, d.vat_treatment, d.vat_rate);
  const set = (k: string, v: unknown) => setD({ ...d, [k]: v });
  const field = (k: string, label: string, o: { multiline?: boolean; half?: boolean; ph?: string; date?: boolean; short?: boolean } = {}) => (
    <View style={{ flexBasis: o.half ? '47%' : '100%', flexGrow: 1, marginBottom: 8 }}><Muted style={{ fontWeight: '500' }}>{label}</Muted>{o.date ? <DateBox value={String(d[k] ?? '')} onChange={(v) => set(k, v)} title={label} /> : <TextInput value={String(d[k] ?? '')} onChangeText={(v) => set(k, v)} multiline={o.multiline} numberOfLines={o.short ? 1 : undefined} placeholder={o.ph} style={[box, o.multiline ? (o.short ? { minHeight: 44, paddingTop: 12, paddingBottom: 10 } : { minHeight: 60 }) : null]} />}</View>
  );
  const refresh = () => { ['finInvoice', 'finSales', 'finBook', 'finOverview', 'finJobs'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={page(900)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Draft invoice' }} />
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 }}>
          <Text style={{ color: base.blue, fontWeight: '500', marginBottom: 4 }} onPress={async () => {
            const cs = ((await fdb.from('fin_clients').select('id,name,address,postcode,email').eq('org_id', me.org_id as string).order('name')).data as Row[] | null) ?? [];
            if (!cs.length) { toast('No clients in the Directory yet.'); return; }
            const k = await chooseAction('Bill to', cs.map((c) => ({ key: c.id, label: c.name }))); const c = cs.find((x) => x.id === k); if (!c) return;
            setD({ ...d, bill_name: c.name, bill_address: [c.address, c.postcode].filter(Boolean).join('\n') || d.bill_address, bill_email: c.email || d.bill_email });
          }}>Choose from the Directory ▾</Text>
          <TapField label="Bill to" value={d.bill_name} onChange={(v) => set('bill_name', v)} /><TapField label="Billing address" value={d.bill_address} multiline onChange={(v) => set('bill_address', v)} /><TapField label="Accounts email" value={d.bill_email} half email onChange={(v) => set('bill_email', v)} />
          {field('client_po', 'Client PO', { half: true })}{field('issue_date', 'Invoice date', { half: true, date: true })}{field('due_date', 'Due date', { half: true, date: true })}
        </View>
        <InvoicePlot inv={d} site={site} onSet={(v) => set('sub_job_id', v)} />
      </Card>
      <SectionTitle>Lines</SectionTitle>
      {editing ? <LinesEdit d={d} setD={setD} /> : <LinesView lines={d.lines} mixed={t.mixed} vatOf={(l) => l.vat} note={inv.source === 'certificate' ? 'These are the certificate’s figures.' : undefined} onEdit={() => setEditing(true)} />}
      <Card>
        <FinRow title="Net" right={money(t.net)} tone={minusTone(t.net)} />
        {Object.keys(t.by).filter((k) => !INV_VAT[k].rc && INV_VAT[k].r > 0).map((k) => <FinRow key={k} title={`VAT @ ${INV_VAT[k].l}${t.mixed ? ` on ${money(t.by[k].net)}` : ''}`} right={money(t.by[k].vat)} />)}
        <FinRow title="Total" right={money(t.total)} tone={minusTone(t.total)} />
        {t.vatDue ? <Muted>Reverse charge VAT {money(t.vatDue)} — the client pays this to HMRC; not added to the total.</Muted> : null}
      </Card>
      {field('notes', 'Notes on the invoice', { multiline: true, short: true })}
    </ScrollView>
    {/* Always in view at the bottom, however long the lines get (Andy, 3 Nov 2026). */}
    <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, backgroundColor: base.card, borderTopWidth: 1, borderColor: base.cardLine }}>
        <View style={{ flex: 1 }}><Button grow kind="ghost" busy={busy === 'save'} title="Save Draft" onPress={async () => { setBusy('save'); const e = await saveDraft(inv.id, d); setBusy(''); toast(e || 'Draft saved'); if (!e) setEditing(false); refresh(); }} /></View>
        <View style={{ flex: 1 }}><Button grow busy={busy === 'issue'} title="Issue Invoice" onPress={async () => {
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
        }} /></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Delete draft" onPress={async () => { if (!(await confirmAsk('Delete this draft invoice?', 'Delete'))) return; if (await deleteDraft(inv.id)) { toast('Draft deleted'); refresh(); router.back(); } else toast('Could not delete.'); }} style={({ pressed }) => ({ width: 46, marginTop: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FDECEC', opacity: pressed ? 0.7 : 1 })}><OphIcon name="bin" size={19} color="#B42318" /></Pressable>
    </View>
    </View>
  );
}

function Issued({ inv, pays, site }: { inv: Row; pays: Row[]; site: Row | undefined }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [pay, setPay] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  if (!me) return null;
  const out = invOutstanding(inv as never), t = invTotals(inv.lines, inv.vat_treatment, inv.vat_rate);
  const refresh = () => { ['finInvoice', 'finSales', 'finBook', 'finOverview', 'finJobs'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={page(900)}>
      <Stack.Screen options={{ title: inv.number || 'Invoice' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <FinStat v={inv.number || '—'} label="Invoice" /><FinStat v={invOverdue(inv as never) ? 'Overdue' : INV_STATUS[inv.status] || inv.status} label="Status" hot={invOverdue(inv as never)} />
        <FinStat v={money(inv.total)} label="Total" /><FinStat v={money(out)} label="Outstanding" hot={out > 0} />
      </View>
      <Card>
        <FinRow title="Bill to" right={inv.bill_name || site?.client_name || '—'} /><FinRow title="Issued" right={fdate(inv.issue_date)} /><FinRow title="Due" right={fdate(inv.due_date)} />
        <FinRow title="Sent" right={inv.sent_at ? `${fdate(String(inv.sent_at).slice(0, 10))}${inv.sent_to ? ` to ${inv.sent_to}` : ''}` : 'Not emailed yet'} />
        <XeroRow kind="invoice" rec={inv} onDone={refresh} />
        <InvoicePlot inv={inv} site={site} onSet={refresh} />
      </Card>
      <SectionTitle>Lines</SectionTitle>
      {edit && (
        <>
          <LinesEdit d={edit} setD={setEdit} />
          <Muted style={{ marginBottom: 8 }}>This changes the invoice in OpHUB only. It won’t be re-posted to Xero, so if it’s already there, change it in Xero too.</Muted>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setEdit(null)} /></View>
            <View style={{ flex: 1 }}><Button busy={saving} title="Save Changes" onPress={async () => { setSaving(true); const e = await saveIssuedLines(inv.id, edit); setSaving(false); if (e) { toast(e); return; } toast('Invoice changed — not re-posted to Xero'); setEdit(null); refresh(); }} /></View>
          </View>
        </>
      )}
      <Card>
        {(inv.lines || []).map((l: Row, i: number) => <FinRow key={i} title={l.description || ''} sub={t.mixed ? INV_VAT[lineVat(l, inv.vat_treatment, inv.vat_rate)].l : undefined} right={money(l.amount)} tone={minusTone(l.amount)} />)}
        <FinRow title="Net" right={money(t.net)} /><FinRow title="VAT" right={money(t.vat)} /><FinRow title="Total" right={money(t.total)} />
        {t.vatDue ? <Muted>Reverse charge VAT {money(t.vatDue)} — paid by the client to HMRC.</Muted> : null}
      </Card>
      <Muted style={{ marginVertical: 6 }}>Emailing invoices and reminders is switched off while Finance is on trial.</Muted>
      {inv.status !== 'void' ? (
        <>
          <SectionTitle>Payments</SectionTitle>
          <Card>
            {pays.length ? pays.map((p) => <FinRow key={p.id} title={`${fdate(p.paid_on)}${p.note ? ` · ${p.note}` : ''}`} right={money(p.amount)} onPress={async () => { if (await confirmAsk('Remove this payment?', 'Remove')) { if (await deletePayment(p.id)) { toast('Payment removed'); refresh(); } } }} />) : <Muted>No payments recorded yet.</Muted>}
            {out > 0 && <View style={{ marginTop: 8 }}><Button kind="ghost" title="+ Record payment" onPress={() => setPay(true)} /></View>}
          </Card>
          <Button kind="ghost" title="Void this invoice" onPress={async () => { if (!(await confirmAsk('Void this invoice? This can’t be undone.', 'Void'))) return; if (await voidInvoice(inv.id)) {
            // Already in Xero: void it there too (907 finXeroVoid) — during the Finance trial that's done by hand.
            if (inv.xero_id && me) { const r = await finInvoke(me, 'xero', { action: 'push_invoice', id: inv.id }); toast(r.error ? `Voided here — void it in Xero by hand (${r.error})` : 'Also voided in Xero'); }
            refresh();
          } }} />
          <Muted style={{ marginTop: 6 }}>Issued invoices can&apos;t be changed. To correct one, void it and raise a new one.</Muted>
          {!edit && <Text accessibilityRole="button" onPress={async () => {
            if (!(await confirmAsk('Change the lines on this issued invoice?\n\nIt changes here only and won’t be re-posted to Xero — if it’s already in Xero, change it there too.', 'Edit lines'))) return;
            setEdit({ ...JSON.parse(JSON.stringify(inv)), lines: (inv.lines || []).length ? inv.lines.map((l: Row) => ({ ...l, vat: INV_VAT[l.vat] ? l.vat : lineVat(l, inv.vat_treatment, inv.vat_rate), amount: l.amount == null ? '' : String(l.amount) })) : [{ description: '', amount: '' }] });
          }} style={{ alignSelf: 'flex-end', marginTop: 10, fontSize: 11.5, color: base.slate, textDecorationLine: 'underline' }}>Edit lines</Text>}
        </>
      ) : <Card><Muted>This invoice was voided.</Muted></Card>}
      {pay && (
        <FinForm title="Record payment" initial={{ amount: String(out), paid_on: today() }} onClose={() => setPay(false)}
          fields={[{ k: 'amount', label: 'Amount received (£)', kind: 'money', half: true }, { k: 'paid_on', label: 'Date received', kind: 'date', half: true }, { k: 'note', label: 'Note (optional)', ph: 'e.g. BACS, remittance ref' }]}
          onSave={async (v) => { const a = num(v.amount); if (a === null || isNaN(a) || a <= 0) return 'Enter the amount received.'; if (!(await addPayment(me, inv.id, a, String(v.paid_on), String(v.note)))) return 'Could not save.'; toast('Payment recorded'); refresh(); return null; }} />
      )}
    </ScrollView>
    <ThinExportBar onPdf={async () => {
        let p = inv.pdf_path; if (!p) p = await storePdf(me, org, inv, site);
        const u = p ? await openDocLink('finance-docs', p) : null; if (u) viewDoc(u); else toast('Could not build the PDF.');
      }} />
    </View>
  );
}
