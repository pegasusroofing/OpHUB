// The "send an order" panel (760 orderFulfilmentHtml + supplier picker): supplier (type to narrow,
// favourites first, or Email to me), branch, who gets the email, then a drop-down for Deliver to site /
// Driver collection / Operative collection, the date from a calendar, who collects, note and CCs.
// Operative collection with no supplier just puts the items on Collections (the old "Add to collections").
// Used for one request, a grouped order and Send Again.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { DateBox, todayIso } from '@/components/DateField';
import { SelectBox } from '@/components/SelectBox';
import { SuggestField } from '@/components/SuggestField';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Muted, SectionTitle } from '@/components/ui';
import { sendOrder, toCollections, toggleFavourite, useOrderPeople, useSuppliers, type FullSupplier } from '@/data/materials';
import { useAuth } from '@/lib/auth';
import { DELIVERY_TIME_SLOTS } from '@/lib/rules/driver';
import { branchLabel, companyOperativeLabel, orderNote, parseCc, sendToOptions, sortSuppliers, type Branch, type Fulfil, type Mat, type SendTo } from '@/lib/rules/materials';
import { isFinanceUser } from '@/lib/roles';
import { base, radius } from '@/theme/theme';

const ME_KEY = 'me';
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };

export function OrderPanel({ siteId, mats, again, onDone, onCancel }: { siteId: string; mats: Mat[]; again: boolean; onDone: () => void; onCancel: () => void }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: suppliers, refetch } = useSuppliers(me?.org_id);
  const { data: people } = useOrderPeople(siteId, true);
  const [q, setQ] = useState('');
  const [supId, setSupId] = useState<string | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [sendTo, setSendTo] = useState<SendTo>('branch');
  const [how, setHow] = useState<'site' | 'driver' | 'op'>('site');
  const mode: 'delivery' | 'collection' = how === 'site' ? 'delivery' : 'collection';
  const [date, setDate] = useState('');
  const [who, setWho] = useState('');
  const [slot, setSlot] = useState('7am');
  const [note, setNote] = useState('');
  const [ccIds, setCcIds] = useState<Set<string>>(new Set());
  const [ccRaw, setCcRaw] = useState('');
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  const toMe = supId === ME_KEY;
  const sup: FullSupplier | null = !toMe ? suppliers?.find((s) => s.id === supId) ?? null : null;
  const branches = (Array.isArray(sup?.branches) ? sup?.branches : []) as Branch[];
  const sendOpts = sup ? sendToOptions(sup, branch, me.email || '') : [];
  const sendKey = sendOpts.some((o) => o.key === sendTo) ? sendTo : sendOpts[0]?.key ?? 'branch';
  const drivers = people?.drivers ?? [];
  const ops = people?.siteOps ?? [];
  const n = mats.length;

  const pickSupplier = (id: string) => { setSupId(id); setBranch(null); setSendTo('branch'); setQ(id === ME_KEY ? `✉ Email to me${me.email ? ` (${me.email})` : ''}` : suppliers?.find((x) => x.id === id)?.name ?? ''); };

  const confirm = async () => {
    // Operative collection with no supplier: straight onto Collections (no email).
    if (how === 'op' && !supId) {
      const opId = who.startsWith('op:') ? who.slice(3) : null;
      setBusy(true); const ok = await toCollections(me, siteId, mats, { assignTo: opId }); setBusy(false);
      if (!ok) { toast('Could not add to Collections — try again.'); return; }
      void qc.invalidateQueries({ queryKey: ['materials', siteId] }); onDone(); return;
    }
    if (!supId) { toast('Please choose a supplier before sending this order.'); return; }
    if (toMe && !me.email) { toast('There is no email address on your profile.'); return; }
    const d = date;
    if (!d) { toast(`Choose the ${mode === 'collection' ? 'collection' : 'delivery'} date.`); return; }
    const cc = parseCc(ccRaw);
    if (cc.bad.length) { toast(`Check the CC email${cc.bad.length > 1 ? 's' : ''}: ${cc.bad.join(', ')}`); return; }
    let kind: Fulfil['collectorKind'] = null; let cid: string | null = null;
    if (mode === 'collection') {
      if (!who) { toast('Choose who is collecting.'); return; }
      const [k, v] = who.split(':'); kind = k as Fulfil['collectorKind']; cid = v || null;
    }
    const f: Fulfil = { mode, date: d, note: orderNote(note.trim(), branch, mode, mats.map((m) => m.sub_site_label)), branch, sendTo: sendKey, ccIds: [...ccIds], ccEmails: cc.ok, collectorKind: kind, collectorId: cid, slot: kind === 'driver' ? slot : null };
    let skip = false;
    if (mode === 'collection' && kind !== 'rtbop' && mats.some((m) => m.sent_at || m.email_sent_at)) {
      const where = kind === 'driver' ? 'Delivery Schedule' : 'Collections tab';
      const name = [...drivers, ...ops].find((p) => p.id === cid)?.name || 'them';
      skip = !(await confirmAsk(`This order has been sent before. Add it to the ${where} for ${name} again? Choose No if it is already on there — the email will still be sent.`, 'Yes — add it again', 'No — email only'));
    }
    setBusy(true);
    const msg = await sendOrder(me, { siteId, mats, supplier: sup, toMe, f, financeUser: isFinanceUser(me, org), people: [...drivers, ...ops], orgName: org?.name ?? null, skipBooking: skip });
    setBusy(false);
    toast(msg);
    void qc.invalidateQueries({ queryKey: ['materials', siteId] });
    onDone();
  };

  const chip = (on: boolean, label: string, onPress: () => void, key?: string) => (
    <Pressable key={key ?? label} onPress={onPress} style={{ paddingVertical: 7, paddingHorizontal: 10, borderWidth: on ? 1.5 : 1, borderColor: on ? base.ink : base.line, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
      <Text style={{ color: base.ink, fontWeight: on ? '700' : '400' }}>{label}</Text>
    </Pressable>
  );
  const supItems = [{ key: ME_KEY, label: `✉ Email to me${me.email ? ` (${me.email})` : ''}`, top: false }, ...sortSuppliers(suppliers ?? [], '').map((x) => ({ key: x.id, label: x.name, top: !!x.favourite }))];
  const branchOpts: [string, string][] = [['', mode === 'delivery' ? 'Any branch (delivery)' : 'Any branch / not specified'], ...branches.map((b) => [b.id, branchLabel(b)] as [string, string])];
  const opOpts: [string, string][] = [['rtbop:', `👷 ${companyOperativeLabel(org?.name)}`], ...ops.map((o) => [`op:${o.id}`, `👷 ${o.name}`] as [string, string])];
  const drvOpts: [string, string][] = drivers.map((d) => [`driver:${d.id}`, `🚐 ${d.name}`] as [string, string]);
  const opNoSup = how === 'op' && !supId;

  return (
    <View>
      <SectionTitle>{again ? `Send again — ${n} order${n > 1 ? 's' : ''}` : n > 1 ? `Grouped order — ${n} items` : 'Order from Merchant'}</SectionTitle>
      <View style={{ marginBottom: 10 }}>
        {mats.map((m) => (
          <View key={m.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: base.line }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: base.ink }}>{m.item}</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: base.ink }}>× {m.qty || '1'}</Text>
          </View>
        ))}
      </View>

      <SelectBox label="Delivery" value={how} onChange={(k) => { setHow(k); setWho(''); }} options={[['site', '🚚 Deliver to site'], ['driver', '🚐 Driver collection'], ['op', '👷 Operative collection']]} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, zIndex: 5 }}>
        <View style={{ flex: 1 }}>
          <SuggestField label={how === 'op' ? 'Supplier (optional — leave blank to just add to Collections)' : 'Supplier'} value={q} onChangeText={(t) => { setQ(t); if (supId) { setSupId(null); setBranch(null); } }}
            placeholder="Type to find a supplier — ★ favourites first" items={supItems} showAllOnFocus max={12} onPick={(x) => pickSupplier(x.key)} />
        </View>
        {!!sup && <Pressable hitSlop={8} style={{ paddingBottom: 18 }} accessibilityLabel="Favourite" onPress={async () => { const e = await toggleFavourite(me.org_id as string, sup); if (e) toast(e); else void refetch(); }}>
          <Text style={{ fontSize: 22, color: sup.favourite ? '#D9A441' : base.slateLight }}>{sup.favourite ? '★' : '☆'}</Text>
        </Pressable>}
      </View>
      {!suppliers?.length && <Muted>No suppliers yet — add them in Admin › Suppliers.</Muted>}
      {branches.length > 0 && <SelectBox label="Branch" value={branch?.id ?? ''} options={branchOpts} onChange={(k) => { const b = branches.find((x) => x.id === k); setBranch(b ? { id: b.id, name: b.name || '', address: b.address || '', phone: b.phone || '', email: b.email || '' } : null); }} />}
      {sup && sendOpts.length > 1 && <SelectBox label="Send the order email to" value={sendKey} options={sendOpts.map((o) => [o.key, o.label] as [SendTo, string])} onChange={(k) => setSendTo(k)} />}

      {!opNoSup && <View style={{ marginBottom: 10 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: base.slate, marginBottom: 4 }}>{mode === 'collection' ? 'Collection date' : 'Delivery date'} (the supplier sees this)</Text>
        <DateBox value={date} onChange={setDate} min={todayIso()} clearable={false} title={mode === 'collection' ? 'Collection date' : 'Delivery date'} />
      </View>}
      {how === 'driver' && (drvOpts.length ? <SelectBox label="Which driver" value={who} options={drvOpts} onChange={setWho} placeholder="Choose the driver" /> : <Text style={{ color: base.warn, marginBottom: 8 }}>No drivers set up yet.</Text>)}
      {how === 'driver' && who.startsWith('driver:') && <SelectBox label="Collection drop" value={slot} options={DELIVERY_TIME_SLOTS.map((x) => [x.key, x.label] as [string, string])} onChange={setSlot} />}
      {how === 'op' && <SelectBox label={opNoSup ? 'Who collects (optional — you can choose later on Collections)' : 'Who collects'} value={who} options={opOpts} onChange={setWho} placeholder="Choose the operative" />}

      {!opNoSup && (
        <>
          <TextInput value={note} onChangeText={setNote} multiline maxLength={500} placeholder="Note (optional) — e.g. what each item is for…" placeholderTextColor={base.slateLight} style={[box, { minHeight: 52 }]} />
          {ops.some((o) => o.email) && (
            <View style={{ marginBottom: 8 }}>
              <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Also email a copy to (optional)</Muted>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {ops.filter((o) => o.email).map((o) => chip(ccIds.has(o.id), `${ccIds.has(o.id) ? '☑' : '☐'} ${o.name}`, () => { const x = new Set(ccIds); if (x.has(o.id)) x.delete(o.id); else x.add(o.id); setCcIds(x); }, o.id))}
              </View>
            </View>
          )}
          <TextInput value={ccRaw} onChangeText={setCcRaw} autoCapitalize="none" keyboardType="email-address" placeholder="CC other emails (optional, separate with commas)" placeholderTextColor={base.slateLight} style={box} />
          <Muted style={{ marginBottom: 8, fontSize: 12 }}>When the order goes to a branch&apos;s own email, the supplier&apos;s main order email is copied in. You are always copied in.</Muted>
        </>
      )}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button small busy={busy} title={opNoSup ? `📦 Add ${n > 1 ? `${n} items ` : ''}to Collections` : `Confirm & ${toMe ? 'email it to me' : `send to ${sup?.name ?? 'the supplier'}`}`} onPress={() => void confirm()} />
        <Button small kind="ghost" title="Cancel" onPress={onCancel} />
      </View>
    </View>
  );
}
