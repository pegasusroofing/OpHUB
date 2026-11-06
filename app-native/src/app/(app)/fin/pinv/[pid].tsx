// A purchase invoice or receipt (904 openPurchaseInvoiceView / Form). "new" (?site=&po=) adds one by hand with the
// duplicate check. A saved one opens on the same screen (Andy, 6 Nov 2026: no separate read-only page): change it,
// Save, Save & Query To PM or Approve Invoice; under it the conversation with the PM, Xero, paid and reject.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View, TextInput } from 'react-native';

import { SelectBox } from '@/components/SelectBox';
import { PinvEditor } from '@/components/PinvEditor';
import { XeroRow } from '@/components/FinXero';
import { FinRow } from '@/components/FinNav';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { fdb } from '@/data/finance';
import { nameOf, usePeople } from '@/data/hs';
import { addPiThreadReply, piLabel, tellPmOfPi, isInXero, loadPinv, setPinvPaid, setPinvStatus } from '@/data/finPurchase';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { COST_CATS } from '@/lib/rules/finBook';
import { codePatch, codeStart, type CodeLine } from '@/lib/rules/piCode';
import { fdate, jobTag, money, round2, today } from '@/lib/rules/finance';
import { base, radius, space } from '@/theme/theme';

const XERO_Q = 'This is already in Xero. Changing it here won’t change Xero — change it in Xero too, or the two won’t match.';

type Row = Record<string, any>;
export default function FinPinv() {
  const { pid, site, po, receipt, sup, no, amt, date, edit } = useLocalSearchParams<{ pid: string; site?: string; po?: string; receipt?: string; sup?: string; no?: string; amt?: string; date?: string; edit?: string }>();
  // Add Manually opens the line-by-line screen (Andy, 5 Nov 2026); the project is chosen on it.
  if (pid === 'new') return <PinvEditor key={`${site || ''}${po || ''}${receipt || ''}${no || ''}`} siteId={site || undefined} poId={po || undefined} start={sup || no ? { supplier: sup, no, amount: amt ? Number(amt) : undefined, date } : undefined} />;
  return <ViewPinv id={pid} startEdit={edit === '1'} />;
}

function ViewPinv({ id, startEdit }: { id: string; startEdit?: boolean }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const { data, isLoading } = useQuery({ queryKey: ['finPinv', id], queryFn: () => loadPinv(id) });
  const { data: people } = usePeople();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const { data: askedPm } = useQuery({ queryKey: ['finPiAsked', id, data?.i?.status], enabled: !!data?.i, queryFn: async () => ((await fdb.from('messages').select('recipient_id').eq('related_id', id).eq('kind', 'pi_query').order('created_at', { ascending: false }).limit(1)).data as Row[] | null)?.[0]?.recipient_id as string | undefined ?? null });
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
  const under = (
    <View style={{ marginTop: 12 }}>
        {(() => {
          // 9219zr: the conversation with the job's PM about a queried invoice, with a reply box while it's a query.
          const thread = (Array.isArray(i.query_thread) ? i.query_thread : []).filter((x: Row) => x && x.text) as Row[];
          if (!thread.length && !(i.status === 'query' && askedPm)) return null;
          const pm = askedPm || sites.find((x) => x.id === i.site_id)?.responsible_pm_id;
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
                    setSending(true); const r = await addPiThreadReply(me, i.id, reply.trim(), askedPm || undefined); setSending(false);
                    if (!r.ok) { toast('Couldn’t save the reply — try again.'); return; }
                    toast(r.sent ? `Reply sent to ${nameOf(people, r.pm as string)}` : 'Reply saved'); setReply(''); refresh();
                  }} />
                </View>
              ) : <Muted style={{ marginTop: 6 }}>This project has no PM set, so nobody on site can be asked.</Muted>)}
            </Card>
          );
        })()}
      {(i.status === 'approved' || i.xero_id || i.paid_on) && (
        <Card>
          <XeroRow kind="bill" rec={i} onDone={refresh} />
          {i.paid_on && <FinRow title="Paid" right={fdate(i.paid_on)} />}
        </Card>
      )}
    </View>
  );
  const buttons = (
    <>
      {i.status === 'approved' && <Button small kind="ghost" title={i.paid_on ? 'Remove Paid Date' : 'Mark Paid Today'} onPress={async () => { if (await setPinvPaid(id, i.paid_on ? null : today())) { toast(i.paid_on ? 'Paid date removed' : 'Marked paid', { confirm: true }); refresh(); } }} />}
      {i.status !== 'rejected' && !i.paid_on && <Button small kind="ghost" title="Reject" onPress={async () => { if (await confirmAsk('Reject this purchase invoice?', 'Reject')) void status('rejected', 'Reject this purchase invoice'); }} />}
    </>
  );
  return <PinvEditor key={i.id} pi={i} below={under} buttons={buttons} startEdit={startEdit} />;
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
