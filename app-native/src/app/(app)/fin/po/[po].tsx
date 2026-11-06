// A purchase order (904 renderFinPo). New and saved POs open on the same screen (FinNewPo; Andy, 7 Nov 2026); a saved one
// has its purchase invoices, site-request lines to take off, mark fully invoiced / reopen and the supplier's quote under it.
// New POs come from a project's Materials tile, or are raised here with typed lines (FinNewPo);
// emailing one from Finance is switched off during the Finance trial.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FinRow } from '@/components/FinNav';
import { FinNewPo } from '@/components/FinNewPo';
import { PoQuote } from '@/components/PoQuote';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { loadPo, removePoLines, setPoStatus, setPoStatusWithRequests } from '@/data/finPurchase';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { PI_STATUS, poInvoiced } from '@/lib/rules/finBook';
import { fdate, money } from '@/lib/rules/finance';
import { base, page, space } from '@/theme/theme';

type Row = Record<string, any>;

export default function FinPo() {
  const { po: poId, site, items: itemIds } = useLocalSearchParams<{ po: string; site?: string; items?: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const { data, isLoading } = useQuery({ queryKey: ['finPo', poId], enabled: poId !== 'new', queryFn: () => loadPo(poId) });
  const [rm, setRm] = useState<Set<number> | null>(null); // ticking lines to take off (9219zr)
  const newSv = useRef<ComponentRef<typeof ScrollView>>(null); // the new PO page, so View PO can go back to the top // Send PO: the supplier's email (Andy, 5 Nov 2026)
  if (!me) return null;
  if (poId === 'new') {
    const st = sites.find((x) => x.id === site);
    return (
      <ScrollView ref={newSv} contentContainerStyle={page(1300)} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: 'New purchase order' }} />
        {/* Opens straight away; the project is chosen on the form when it didn't come from one (Andy, 5 Nov 2026). */}
        {site && !st ? <Muted>Loading…</Muted> : <FinNewPo key={st?.id || 'none'} site={st || null} itemIds={itemIds ? itemIds.split(',').filter(Boolean) : []} toTop={() => newSv.current?.scrollTo({ y: 0, animated: true })} />}
      </ScrollView>
    );
  }
  if (isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!data) return <Muted style={{ padding: space.l }}>PO not found.</Muted>;
  const { po, pinvs, mats } = data;
  const st = sites.find((x) => x.id === po.site_id);
  const inv = poInvoiced(po, pinvs);
  const matBy: Record<string, Row> = {}; mats.forEach((m) => { matBy[m.id] = m; });
  const refresh = () => ['finPo', 'finPurchases', 'finBook'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  const fromRequests = (po.items || []).some((it: Row) => it.material_id);
  // A saved PO opens on the same screen it was made on (Andy, 7 Nov 2026: no separate PO page). Underneath, what only a
  // saved PO has: its invoices, taking site-request lines off, marking it fully invoiced, reopening, the supplier's quote.
  return (
    <ScrollView ref={newSv} contentContainerStyle={page(1300)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: po.number }} />
      {sites.length === 0 ? <Muted>Loading…</Muted> : <FinNewPo key={po.id} site={st || null} po={po} toTop={() => newSv.current?.scrollTo({ y: 0, animated: true })} />}
      <Card style={{ marginTop: 14 }}>
        <SectionTitle>This Purchase Order</SectionTitle>
        <Muted style={{ marginBottom: 6 }}>{[`Ordered ${fdate(String(po.created_at).slice(0, 10))} by ${po.ordered_by_name || '—'}`, po.sent_at ? `emailed ${fdate(String(po.sent_at).slice(0, 10))} to ${po.sent_to || ''}` : '', po.yard_booked_at ? `booked into the yard ${fdate(String(po.yard_booked_at).slice(0, 10))}` : '', `invoiced ${money(inv)}${po.value != null ? ` of ${money(po.value)}` : ''}`].filter(Boolean).join(' · ')}</Muted>
        {fromRequests && po.status === 'open' && (
          <View style={{ marginBottom: 8 }}>
            {(po.items || []).map((it: Row, k: number) => { const m = it.material_id ? matBy[it.material_id] : null; if (!m) return null; return (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {rm && <Pressable hitSlop={8} onPress={() => setRm((x) => { const n = new Set(x ?? []); if (n.has(k)) n.delete(k); else n.add(k); return n; })}><Text style={{ fontSize: 18 }}>{rm.has(k) ? '☑' : '☐'}</Text></Pressable>}
                <Text style={{ flex: 1, color: base.ink, fontSize: 13 }}>{it.item} <Text style={{ color: base.slate }}>· site request{m.grn ? (m.grn.ok === false ? ' · ⚠ problem on delivery' : ' · ✓ received') : ' · not received yet'}{m.status === 'cancelled' ? ' · cancelled' : ''}</Text></Text>
              </View>
            ); })}
            {(po.items || []).length > 1 && (rm ? (
              <View style={{ gap: 6, marginTop: 6 }}>
                <Muted>Tick the lines to take off this PO. A site request on a removed line is marked cancelled. Email the supplier the updated PO afterwards.</Muted>
                <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
                  <Button small title="Remove Ticked Lines" onPress={async () => {
                    if (!rm.size) { toast('Tick at least one line.'); return; }
                    if (!(await confirmAsk(`Take ${rm.size} line${rm.size === 1 ? '' : 's'} off PO ${po.number || ''}?`, 'Remove'))) return;
                    const r = await removePoLines(me, po.id, [...rm]);
                    if (r.error) { toast(r.error); return; }
                    toast(`${r.removed} line${r.removed === 1 ? '' : 's'} removed${r.cancelled ? ` — ${r.cancelled} site request${r.cancelled === 1 ? '' : 's'} marked cancelled` : ''}`); setRm(null); refresh();
                  }} />
                  <Button small kind="ghost" title="Cancel" onPress={() => setRm(null)} />
                </View>
              </View>
            ) : <Pressable onPress={() => setRm(new Set())} style={{ marginTop: 6 }}><Text style={{ color: base.blue, fontWeight: '500' }}>Remove Site-Request Lines…</Text></Pressable>)}
          </View>
        )}
        <Text style={{ fontWeight: '600', color: base.ink, marginTop: 4, marginBottom: 2 }}>Purchase Invoices</Text>
        {pinvs.length ? pinvs.map((i) => <FinRow key={i.id} left={i.invoice_no || '—'} title={fdate(i.invoice_date)} sub={i.paid_on ? 'Paid' : PI_STATUS[i.status]} right={money(i.net)} onPress={() => router.push(`/fin/pinv/${i.id}` as never)} />) : <Muted>None yet.</Muted>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 10 }}>
          {po.status !== 'cancelled' && <Button small kind="ghost" title="+ Add Invoice" onPress={() => router.push(`/fin/pinv/new?site=${po.site_id}&po=${po.id}` as never)} />}
          {po.status === 'open' && !po.is_draft && <Button small kind="ghost" title="Mark Fully Invoiced" onPress={async () => { if (await setPoStatus(po.id, 'invoiced')) { toast('PO marked fully invoiced', { confirm: true }); refresh(); } }} />}
          {po.status !== 'open' && <Button small kind="ghost" title="Reopen PO" onPress={async () => { const n = await setPoStatusWithRequests(me, po.id, 'open'); if (n !== null) { toast(n ? `PO reopened — ${n} site request${n === 1 ? '' : 's'} put back` : 'PO reopened', { confirm: true }); refresh(); } }} />}
        </View>
      </Card>
      {po.status !== 'cancelled' && <PoQuote me={me} po={po} onDone={refresh} />}
    </ScrollView>
  );
}
