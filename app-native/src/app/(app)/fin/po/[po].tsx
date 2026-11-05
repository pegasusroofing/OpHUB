// A purchase order (904 renderFinPo): items, the PO value (excl. VAT),
// purchase invoices against it, mark fully invoiced / cancel / reopen.
// New POs come from a project's Materials tile, or are raised here with typed lines (FinNewPo);
// emailing one from Finance is switched off during the Finance trial.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { ThinExportBar } from '@/components/FinFilterBar';
import { FinRow, FinStat } from '@/components/FinNav';
import { AllocRow } from '@/components/FinSplit';
import { FinNewPo } from '@/components/FinNewPo';
import { PoQuote } from '@/components/PoQuote';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { fdb, loadSettings } from '@/data/finance';
import { emailPo, filePoPdf, loadPo, removePoLines, savePoValue, setPoStatus, setPoStatusWithRequests } from '@/data/finPurchase';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { DocSplit } from '@/components/DocSplit';
import { viewDoc } from '@/components/DocViewer';
import { FinEmailPopup } from '@/components/FinEmailPopup';
import { buildPoPdf } from '@/lib/finPoPdf';
import { deliverPdf } from '@/lib/pdf';
import { COST_CATS, PI_STATUS, poInvoiced } from '@/lib/rules/finBook';
import { fdate, jobTag, money, num, rateMoney } from '@/lib/rules/finance';
import { base, page, radius, space } from '@/theme/theme';

type Row = Record<string, any>;

export default function FinPo() {
  const { po: poId, site, items: itemIds } = useLocalSearchParams<{ po: string; site?: string; items?: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const { data, isLoading } = useQuery({ queryKey: ['finPo', poId], enabled: poId !== 'new', queryFn: () => loadPo(poId) });
  const [val, setVal] = useState<string | null>(null);
  const [rm, setRm] = useState<Set<number> | null>(null); // ticking lines to take off (9219zr)
  const [mailing, setMailing] = useState<string | null>(null);
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
  const inv = poInvoiced(po, pinvs);
  const matBy: Record<string, Row> = {}; mats.forEach((m) => { matBy[m.id] = m; });
  const refresh = () => ['finPo', 'finPurchases', 'finBook'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  const poPdfUrl = async () => {
    const sup = po.supplier_id ? ((await fdb.from('suppliers').select('id,name,email').eq('id', po.supplier_id).maybeSingle()).data as Row | null) : null;
    const bytes = await buildPoPdf(po, sites.find((s) => s.id === po.site_id) as Row | undefined, await loadSettings(me.org_id), sup, org);
    return URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  };
  return (
    <DocSplit reloadKey={`${po.id}${po.updated_at || ''}`} name={`PO ${po.number}`} load={poPdfUrl}>
    <View style={{ flex: 1 }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={page(900)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: po.number }} />
      {/* View PO (the PDF beside it, or opened) and Send PO, like a sales invoice (Andy, 5 Nov 2026). */}
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginBottom: 10 }}>
        <Button small kind="ghost" title="👁 View PO" onPress={async () => { try { viewDoc(await poPdfUrl(), `PO ${po.number}.pdf`); } catch { toast('Could not build the PO PDF.'); } }} />
        {po.status !== 'cancelled' && <Button small title="✉ Send PO" onPress={async () => { const sup = po.supplier_id ? ((await fdb.from('suppliers').select('email').eq('id', po.supplier_id).maybeSingle()).data as Row | null) : null; setMailing(String(sup?.email || '')); }} />}
      </View>
      {mailing !== null && (
        <FinEmailPopup kind="po" title={`Send PO ${po.number}`} to={mailing} note="The PO PDF goes with it."
          vars={{ number: String(po.number || ''), project: sites.find((s) => s.id === po.site_id)?.name || '', job_no: sites.find((s) => s.id === po.site_id)?.job_number || '', supplier: po.supplier_name || '', amount: money(po.total ?? po.value), required_by: po.required_by ? fdate(po.required_by) : '' }}
          onSend={async (o) => {
            const sup = po.supplier_id ? ((await fdb.from('suppliers').select('id,name,email').eq('id', po.supplier_id).maybeSingle()).data as Row | null) : null;
            const e = await emailPo(me, po, await buildPoPdf(po, sites.find((s) => s.id === po.site_id) as Row | undefined, await loadSettings(me.org_id), sup, org), o);
            if (e) return e;
            toast(`PO emailed to ${o.to.join(', ')}`); refresh(); return null;
          }}
          onClose={() => setMailing(null)} />
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <FinStat v={`${po.number} · ${po.status}`} label="PO" /><FinStat v={po.supplier_name || '—'} label="Supplier" />
        <FinStat v={po.value != null ? money(po.value) : '—'} label="PO value" /><FinStat v={money(inv)} label="Invoiced" hot={po.value != null && inv > Number(po.value)} />
      </View>
      <Card>
        <FinRow title="Project" right={jobTag(sites.find((s) => s.id === po.site_id))} onPress={() => router.push(`/fin/job/${po.site_id}` as never)} />
        <AllocRow table="purchase_orders" row={po} onSaved={refresh} />
        <FinRow title="Ordered" right={`${fdate(String(po.created_at).slice(0, 10))} by ${po.ordered_by_name || '—'}`} />
        {!!po.yard_booked_at && <FinRow title="Booked into the yard" right={fdate(String(po.yard_booked_at).slice(0, 10))} />}
        {po.required_by && <FinRow title={po.fulfilment === 'collection' ? 'Collection' : 'Required for delivery'} right={fdate(po.required_by)} />}
        {po.fulfilment !== 'collection' && !!po.delivery_address && <FinRow title={po.delivery_to === 'office' ? 'Deliver to the office' : 'Deliver to'} right={po.delivery_address} />}
        {!!po.delivery_time && <FinRow title="Delivery time" right={po.delivery_time} />}
        {Array.isArray(po.offload) && po.offload.length > 0 && <FinRow title="Offload" right={po.offload.join(', ')} />}
        {!!po.site_contact && <FinRow title="Site contact" right={`${po.site_contact}${po.site_contact_phone ? ` · ${po.site_contact_phone}` : ''}`} />}
        {po.supplier_branch && <FinRow title="Branch" right={po.supplier_branch} />}{po.note && <FinRow title="Note" right={po.note} />}
        {po.sent_at && <FinRow title="Emailed" right={`${fdate(String(po.sent_at).slice(0, 10))} to ${po.sent_to || ''}`} />}
      </Card>
      <SectionTitle>Items</SectionTitle>
      <Card>
        {(po.items || []).map((it: Row, k: number) => { const m = it.material_id ? matBy[it.material_id] : null; return <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{rm && <Pressable hitSlop={8} onPress={() => setRm((x) => { const n = new Set(x ?? []); if (n.has(k)) n.delete(k); else n.add(k); return n; })}><Text style={{ fontSize: 18 }}>{rm.has(k) ? '☑' : '☐'}</Text></Pressable>}<View style={{ flex: 1 }}><FinRow title={`${it.item || 'Item'}${it.qty != null ? ` · ${it.qty}${it.unit ? ` ${it.unit}` : ''}` : ''}${it.rate != null ? ` × ${rateMoney(it.rate)}` : ''}`} sub={[it.site_id && it.site_id !== po.site_id ? jobTag(sites.find((x) => x.id === it.site_id) ?? { job_number: '', name: 'Other job' } as never) : '', it.cost_code ? COST_CATS[it.cost_code] : '', it.discount_pct ? `${it.discount_pct}% off ${rateMoney(it.list_rate)}` : '', m?.grn ? (m.grn.ok === false ? '⚠ problem on delivery' : '✓ received') : m ? 'not received yet' : '', m?.status === 'cancelled' ? 'cancelled' : ''].filter(Boolean).join(' · ')} right={it.amount != null ? money(it.amount) : ''} /></View></View>; })}
        {po.status === 'open' && (po.items || []).length > 1 && (rm ? (
          <View style={{ gap: 6, marginTop: 6 }}>
            <Muted>Tick the lines to take off this PO. A site request on a removed line is marked cancelled. Email the supplier the updated PO afterwards.</Muted>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button title="Remove ticked lines" onPress={async () => {
                if (!rm.size) { toast('Tick at least one line.'); return; }
                if (!(await confirmAsk(`Take ${rm.size} line${rm.size === 1 ? '' : 's'} off PO ${po.number || ''}?`, 'Remove'))) return;
                const r = await removePoLines(me, po.id, [...rm]);
                if (r.error) { toast(r.error); return; }
                toast(`${r.removed} line${r.removed === 1 ? '' : 's'} removed${r.cancelled ? ` — ${r.cancelled} site request${r.cancelled === 1 ? '' : 's'} marked cancelled` : ''}`); setRm(null); refresh();
              }} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setRm(null)} /></View>
            </View>
          </View>
        ) : <Pressable onPress={() => setRm(new Set())} style={{ marginTop: 6 }}><Text style={{ color: base.blue, fontWeight: '500' }}>Remove lines…</Text></Pressable>)}
        {po.vat != null && <><FinRow title="Subtotal" right={money(po.value)} /><FinRow title="VAT" right={money(po.vat)} /><FinRow title="Total" right={money(po.total ?? Number(po.value) + Number(po.vat))} /></>}
      </Card>
      {po.status !== 'cancelled' && (
        <Card>
          <Muted style={{ fontWeight: '500' }}>PO value (£, excl. VAT)</Muted>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={val ?? (po.value != null ? String(po.value) : '')} onChangeText={setVal} keyboardType="decimal-pad" placeholder="From the supplier’s quote or price list" style={{ flex: 1, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink }} />
            <Button title="Save" onPress={async () => { const v = num(val ?? (po.value != null ? String(po.value) : '')); if (v !== null && (isNaN(v) || v < 0)) { toast('Enter the value as a number.'); return; } if (await savePoValue(po, v)) { toast('PO value saved'); setVal(null); refresh(); } }} />
          </View>
          {po.value_estimated && po.value != null && <Text style={{ color: '#D98A00', marginTop: 4 }}>Estimate — some items are priced from the price book or not priced yet.</Text>}
        </Card>
      )}
      <SectionTitle>Purchase invoices</SectionTitle>
      {pinvs.length ? pinvs.map((i) => <FinRow key={i.id} left={i.invoice_no || '—'} title={fdate(i.invoice_date)} sub={i.paid_on ? 'Paid' : PI_STATUS[i.status]} right={money(i.net)} onPress={() => router.push(`/fin/pinv/${i.id}` as never)} />) : <Muted>None yet.</Muted>}
      {po.status !== 'cancelled' && <Button kind="ghost" title="+ Add invoice" onPress={() => router.push(`/fin/pinv/new?site=${po.site_id}&po=${po.id}` as never)} />}
      <View style={{ gap: 8, marginTop: 12 }}>
        {po.status === 'open' && <Button kind="ghost" title="Mark fully invoiced" onPress={async () => { if (await setPoStatus(po.id, 'invoiced')) { toast('PO marked fully invoiced'); refresh(); } }} />}
        {po.status === 'open' && <Button kind="ghost" title="Cancel PO" onPress={async () => { if (await confirmAsk('Cancel this purchase order? Its site requests are marked cancelled too.', 'Cancel PO')) { const n = await setPoStatusWithRequests(me, po.id, 'cancelled'); if (n !== null) { toast(n ? `PO cancelled — ${n} site request${n === 1 ? '' : 's'} marked cancelled` : 'PO cancelled'); refresh(); } } }} />}
        {po.status !== 'open' && <Button kind="ghost" title="Reopen PO" onPress={async () => { const n = await setPoStatusWithRequests(me, po.id, 'open'); if (n !== null) { toast(n ? `PO reopened — ${n} site request${n === 1 ? '' : 's'} put back` : 'PO reopened'); refresh(); } }} />}
      </View>
      {po.status !== 'cancelled' && <PoQuote me={me} po={po} onDone={refresh} />}
    </ScrollView>
    <ThinExportBar onPdf={async () => {
        try {
          const sup = po.supplier_id ? ((await fdb.from('suppliers').select('id,name,email').eq('id', po.supplier_id).maybeSingle()).data as Row | null) : null;
          const bytes = await buildPoPdf(po, sites.find((s) => s.id === po.site_id) as Row | undefined, await loadSettings(me.org_id), sup, org);
          void filePoPdf(me, po, bytes);
          if (!(await deliverPdf(bytes, `PO ${String(po.number).replace(/[^a-z0-9-]+/gi, '_')}.pdf`))) toast('Could not make the PDF — try again.');
        } catch { toast('Could not build the PO PDF.'); }
      }} />
    </View>
    </DocSplit>
  );
}
