// A purchase invoice or receipt (904 openPurchaseInvoiceView / Form). "new"
// (?site=&po=) adds one by hand with the duplicate check; otherwise approve,
// query, reject, mark paid and open the file.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View, TextInput } from 'react-native';

import { SelectBox } from '@/components/SelectBox';
import { PinvEditor } from '@/components/PinvEditor';
import { InvoiceLines } from '@/components/InvoiceLines';
import { AllocRow } from '@/components/FinSplit';
import { XeroRow } from '@/components/FinXero';
import { FinRow, FinStat } from '@/components/FinNav';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { fdb } from '@/data/finance';
import { DocSplit } from '@/components/DocSplit';
import { viewDoc } from '@/components/DocViewer';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { addPiThreadReply, piLabel, tellPmOfPi, isInXero, loadPinv, setPinvCostCode, setPinvPaid, setPinvStatus } from '@/data/finPurchase';
import { useSites } from '@/data/sites';
import { saveLinesOnInvoice } from '@/data/invoiceRead';
import { allocProblem, linesNet, linesVat } from '@/lib/rules/invoiceRead';
import { useAuth } from '@/lib/auth';
import { COST_CATS, PI_STATUS } from '@/lib/rules/finBook';
import { codePatch, codeStart, type CodeLine } from '@/lib/rules/piCode';
import { fdate, jobTag, money, round2, today } from '@/lib/rules/finance';
import { base, page, radius, space } from '@/theme/theme';

const XERO_Q = 'This is already in Xero. Changing it here won’t change Xero — change it in Xero too, or the two won’t match.';

type Row = Record<string, any>;
export default function FinPinv() {
  const { pid, site, po, receipt } = useLocalSearchParams<{ pid: string; site?: string; po?: string; receipt?: string }>();
  // Add Manually opens the line-by-line screen (Andy, 5 Nov 2026); the project is chosen on it.
  if (pid === 'new') return <PinvEditor key={`${site || ''}${po || ''}${receipt || ''}`} siteId={site || undefined} poId={po || undefined} />;
  return <ViewPinv id={pid} />;
}

function ViewPinv({ id }: { id: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const { data, isLoading } = useQuery({ queryKey: ['finPinv', id], queryFn: () => loadPinv(id) });
  const { data: people } = usePeople();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  if (!me) return null;
  if (isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const i = data?.i; if (!i) return <Muted style={{ padding: space.l }}>Purchase invoice not found.</Muted>;
  const refresh = () => ['finPinv', 'finPurchases', 'finBook', 'finOverview', 'finPo'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  const status = async (s: string, label: string, note?: string) => {
    if ((s === 'rejected' || s === 'query') && (await isInXero('purchase_invoices', id)) && !(await confirmAsk(`${label}?\n\n${XERO_Q}`, 'I’ll change Xero too'))) return;
    const r = await setPinvStatus(me, id, s, note);
    if (!r.ok) { toast('Could not update — try again.'); return; }
    if (s === 'query') {
      // 9219zr: the job's PM is asked to answer it (a message that opens their reply page).
      const t = await tellPmOfPi(me, i, `Query on ${piLabel(i)}: ${note || 'Query'}`);
      toast(t.sent ? `Marked as query — sent to ${nameOf(people, t.pm as string)} to answer` : t.why === 'nopm' ? 'Marked as query — this project has no PM set, so nobody on site was asked.' : 'Marked as query');
      refresh(); return;
    }
    toast(s === 'approved' ? `Approved${r.xero ? ' — not posted to Xero (Finance trial)' : ''}` : 'Rejected'); refresh();
  };
  return (
    <DocSplit name={i.file_name || 'Invoice'} load={i.file_path ? () => openDocLink('finance-docs', i.file_path) : null}>
    <ScrollView contentContainerStyle={page(800)}>
      <Stack.Screen options={{ title: i.supplier_name || 'Purchase invoice' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <FinStat v={i.paid_on ? 'Paid' : PI_STATUS[i.status] || i.status} label="Status" hot={i.status === 'query'} /><FinStat v={money(i.net)} label="Net" /><FinStat v={money(i.total)} label="Gross" />
      </View>
      {i.query_note && i.status === 'query' && <Card style={{ backgroundColor: '#FDECEA' }}><Text style={{ color: '#8E2B20' }}>⚠ {i.query_note}</Text></Card>}
      {(() => {
        // 9219zr: the conversation with the job's PM about a queried invoice, with a reply box while it's a query.
        const thread = (Array.isArray(i.query_thread) ? i.query_thread : []).filter((x: Row) => x && x.text) as Row[];
        if (i.status !== 'query' && !thread.length) return null;
        const pm = sites.find((x) => x.id === i.site_id)?.responsible_pm_id;
        return (
          <Card>
            <SectionTitle>Conversation With The PM{pm ? ` (${nameOf(people, pm)})` : ''}</SectionTitle>
            {thread.length ? thread.map((x, k) => (
              <View key={k} style={{ paddingVertical: 6, borderTopWidth: k ? 1 : 0, borderTopColor: base.line, alignSelf: x.by === me.id ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
                <Muted>{x.name || nameOf(people, x.by)} · {x.at ? new Date(x.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</Muted>
                <Text style={{ color: base.ink }}>{x.text}</Text>
              </View>
            )) : <Muted>No replies yet.</Muted>}
            {i.status === 'query' && (pm ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TextInput value={reply} onChangeText={setReply} placeholder="Reply to the PM…" style={{ flex: 1, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card }} />
                <Button busy={sending} title="Send" onPress={async () => {
                  if (!reply.trim()) { toast('Write a reply first.'); return; }
                  setSending(true); const r = await addPiThreadReply(me, i.id, reply.trim()); setSending(false);
                  if (!r.ok) { toast('Couldn’t save the reply — try again.'); return; }
                  toast(r.sent ? `Reply sent to ${nameOf(people, r.pm as string)}` : 'Reply saved'); setReply(''); refresh();
                }} />
              </View>
            ) : <Muted style={{ marginTop: 6 }}>This project has no PM set, so nobody on site can be asked.</Muted>)}
          </Card>
        );
      })()}
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
      <PinvLines i={i} sites={sites} onSaved={refresh} />
      {i.file_path && <Button kind="ghost" title={`📄 ${i.file_name || 'Open the invoice'}`} onPress={async () => { const u = await openDocLink('finance-docs', i.file_path); if (u) viewDoc(u); else toast('Could not open the file.'); }} />}
      <View style={{ gap: 8, marginTop: 10 }}>
        {i.status !== 'approved' && <Button title="✓ Approve" onPress={() => void status('approved', 'Approve')} />}
        {i.status !== 'query' && <Button kind="ghost" title="Query" onPress={async () => { const n = await promptText('What needs checking?', ''); if (n !== null) void status('query', 'Mark this purchase invoice as a query', n.trim() || 'Query'); }} />}
        {i.status === 'approved' && <Button kind="ghost" title={i.paid_on ? 'Remove paid date' : 'Mark paid today'} onPress={async () => { if (await setPinvPaid(id, i.paid_on ? null : today())) { toast(i.paid_on ? 'Paid date removed' : 'Marked paid'); refresh(); } }} />}
        {i.status !== 'rejected' && <Button kind="ghost" title="Reject" onPress={async () => { if (await confirmAsk('Reject this purchase invoice?', 'Reject')) void status('rejected', 'Reject this purchase invoice'); }} />}
      </View>
      <Muted style={{ marginTop: 8 }}>Net {money(i.net)} · VAT {money(i.vat)} · gross {money(round2(Number(i.net) + Number(i.vat || 0)))}</Muted>
    </ScrollView>
    </DocSplit>
  );
}

/** The invoice's lines (Andy, 5 Nov 2026): shown as on the new screen; Edit Lines changes them (qty, rate, discount,
 *  VAT, project or a split by %) and saves the net, VAT, total and split from them. Not once it's in Xero or paid. */
function PinvLines({ i, sites, onSaved }: { i: Row; sites: { id: string; job_number?: string | null; name?: string | null; status?: string | null }[]; onSaved: () => void }) {
  const toast = useToast();
  const [lines, setLines] = useState<Row[] | null>(null);
  const items = ((i.lines || []) as Row[]).filter((l) => l && (l.kind || 'item') !== 'total');
  const locked = !!i.xero_id || !!i.paid_on;
  if (!items.length && !lines) return locked ? null : <Button small kind="ghost" title="+ Add The Lines" onPress={() => setLines([{ description: i.description || 'Invoice total', qty: 1, unit: 'each', unit_price: Number(i.net || 0), amount: Number(i.net || 0), site_id: i.site_id, cost_code: i.cost_code || 'materials', vat_rate: Number(i.net) ? Math.round((Number(i.vat || 0) / Number(i.net)) * 100) : 20, disc: 0 }])} />;
  return (
    <View>
      <InvoiceLines lines={(lines ?? items) as never} checks={[]} sites={sites as never} read={null} readOnly={!lines} onChange={(l) => setLines(l as Row[])} defaultSite={i.site_id} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        {!lines && !locked && <Button small kind="ghost" title="Edit Lines" onPress={() => setLines(items)} />}
        {!!lines && <Button small title="Save Lines" onPress={async () => {
          for (const [k, l] of lines.entries()) { if (!l.alloc?.length && !l.site_id) { toast(`Choose the project on line ${k + 1}.`); return; } const p = allocProblem(l); if (p) { toast(`Line ${k + 1}: ${p}`); return; } }
          const net = linesNet(lines as never), vat = linesVat(lines as never);
          if (!(await fdb.from('purchase_invoices').update({ net, vat, total: round2(net + vat) } as never).eq('id', i.id).select('id')).data?.length) { toast('Could not save — try again.'); return; }
          await saveLinesOnInvoice({ ...i, net }, lines as never, []);
          setLines(null); onSaved();
        }} />}
        {!!lines && <Button small kind="ghost" title="Cancel" onPress={() => setLines(null)} />}
        {locked && <Muted>{i.xero_id ? 'In Xero, so the lines are changed in Xero.' : 'Paid, so the lines stay as they are.'}</Muted>}
      </View>
    </View>
  );
}

// Code each line to a project and cost type (9219g): one invoice can cover several jobs.
export function CodeLines({ i, sites, onSaved }: { i: Row; sites: { id: string; job_number?: string | null; name?: string | null; status?: string | null }[]; onSaved: () => void }) {
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
          <View style={{ flexDirection: 'row' }}><Text style={{ flex: 1, fontWeight: '500', color: base.ink }}>{l.description || `Line ${k + 1}`}</Text><Text style={{ fontWeight: '500', color: base.ink }}>{money(l.amount)}</Text></View>
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
