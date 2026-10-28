// The "send an order" panel (760 orderFulfilmentHtml + supplier picker): supplier
// (or Email to me), branch, who gets the email, delivery or collection, date, who
// collects, note and CCs. Used for one request, a grouped order and Send Again.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Muted, SectionTitle } from '@/components/ui';
import { sendOrder, toggleFavourite, useOrderPeople, useSuppliers, type FullSupplier } from '@/data/materials';
import { useAuth } from '@/lib/auth';
import { DELIVERY_TIME_SLOTS, localISODate } from '@/lib/rules/driver';
import { branchLabel, companyOperativeLabel, orderNote, parseCc, readIsoDate, sendToOptions, sortSuppliers, type Branch, type Fulfil, type Mat, type SendTo } from '@/lib/rules/materials';
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
  const [pickOpen, setPickOpen] = useState(true);
  const [q, setQ] = useState('');
  const [supId, setSupId] = useState<string | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [sendTo, setSendTo] = useState<SendTo>('branch');
  const [mode, setMode] = useState<'delivery' | 'collection'>('delivery');
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

  const pickSupplier = (id: string) => { setSupId(id); setBranch(null); setSendTo('branch'); setPickOpen(false); setQ(''); };

  const confirm = async () => {
    if (!supId) { toast('Please choose a supplier before sending this order.'); return; }
    if (toMe && !me.email) { toast('There is no email address on your profile.'); return; }
    const d = readIsoDate(date);
    if (!d || d === 'bad') { toast(`${mode === 'collection' ? 'Collection' : 'Delivery'} date is required before sending (YYYY-MM-DD).`); return; }
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
    toast(toMe || sendKey === 'pm' ? 'Emailing the order to you…' : `Order routed to ${sup?.name} — emailing…`);
    const msg = await sendOrder(me, { siteId, mats, supplier: sup, toMe, f, financeUser: isFinanceUser(me, org), people: [...drivers, ...ops], orgName: org?.name ?? null, skipBooking: skip });
    setBusy(false);
    toast(msg);
    void qc.invalidateQueries({ queryKey: ['materials', siteId] });
    onDone();
  };

  const chip = (on: boolean, label: string, onPress: () => void, key?: string) => (
    <Pressable key={key ?? label} onPress={onPress} style={{ paddingVertical: 8, paddingHorizontal: 10, borderWidth: on ? 1.5 : 1, borderColor: on ? base.ink : base.line, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
      <Text style={{ color: base.ink, fontWeight: on ? '700' : '400' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View>
      <SectionTitle>{again ? `Send again — ${n} order${n > 1 ? 's' : ''}` : n > 1 ? `Grouped order — ${n} items` : 'Order from merchant'}</SectionTitle>
      <Muted style={{ marginBottom: 6 }}>{mats.map((m) => `${m.item}${m.qty ? ` × ${m.qty}` : ''}`).join(' · ')}</Muted>

      <Pressable onPress={() => setPickOpen(!pickOpen)} style={{ paddingVertical: 8 }}>
        <Text style={{ fontWeight: '700', color: base.ink }}>{pickOpen ? '▼' : '▶'} {toMe ? '✉ Email to me' : sup?.name ?? 'Supplier'}</Text>
      </Pressable>
      {pickOpen && (
        <View>
          {(suppliers?.length ?? 0) > 10 && <TextInput value={q} onChangeText={setQ} placeholder="Filter suppliers…" style={box} />}
          {chip(toMe, `✉ Email to me${me.email ? ` (${me.email})` : ''}`, () => pickSupplier(ME_KEY), 'me')}
          {sortSuppliers(suppliers ?? [], q).map((s) => (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>{chip(supId === s.id, s.name, () => pickSupplier(s.id))}</View>
              <Pressable hitSlop={8} onPress={async () => { const e = await toggleFavourite(me.org_id as string, s); if (e) toast(e); else void refetch(); }}>
                <Text style={{ fontSize: 20, color: s.favourite ? '#D9A441' : base.line }}>{s.favourite ? '★' : '☆'}</Text>
              </Pressable>
            </View>
          ))}
          {!suppliers?.length && <Muted>No suppliers yet — add them in Admin › Suppliers.</Muted>}
        </View>
      )}

      {!!supId && (
        <>
          {branches.length > 0 && (
            <View style={{ marginTop: 6 }}>
              <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Branch / address</Muted>
              {chip(!branch, '— Any branch / not specified —', () => setBranch(null), 'nobranch')}
              {branches.map((b) => chip(branch?.id === b.id, branchLabel(b), () => setBranch({ id: b.id, name: b.name || '', address: b.address || '', phone: b.phone || '', email: b.email || '' }), b.id))}
            </View>
          )}
          {sup && (
            <View style={{ marginTop: 6 }}>
              <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Send order email to</Muted>
              {sendOpts.map((o) => chip(sendKey === o.key, o.label, () => setSendTo(o.key), o.key))}
            </View>
          )}
          <Muted style={{ fontWeight: '700', marginTop: 6, marginBottom: 4 }}>Delivery or collection</Muted>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>{chip(mode === 'delivery', 'Delivery — to site', () => setMode('delivery'))}</View>
            <View style={{ flex: 1 }}>{chip(mode === 'collection', 'Collection — we pick up', () => setMode('collection'))}</View>
          </View>
          <Muted style={{ marginBottom: 4 }}>The supplier will see this date on the order.</Muted>
          <TextInput value={date} onChangeText={setDate} autoCapitalize="none" placeholder={`${mode === 'collection' ? 'Collection' : 'Delivery'} date (YYYY-MM-DD), e.g. ${localISODate(new Date())}`} style={box} />
          {mode === 'collection' && (
            <View>
              <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Who is collecting</Muted>
              {chip(who === 'rtbop:', `👷 ${companyOperativeLabel(org?.name)}`, () => setWho('rtbop:'), 'rtbop')}
              {drivers.length > 0 && <Muted>Driver — adds to the Delivery Schedule</Muted>}
              {drivers.map((d) => chip(who === `driver:${d.id}`, `🚐 ${d.name}`, () => setWho(`driver:${d.id}`), d.id))}
              {ops.length > 0 && <Muted>Operative — goes on the Collections tab</Muted>}
              {ops.map((o) => chip(who === `op:${o.id}`, `👷 ${o.name}`, () => setWho(`op:${o.id}`), o.id))}
              {!drivers.length && !ops.length && <Text style={{ color: base.warn, marginBottom: 8 }}>No drivers or site operatives to choose from yet.</Text>}
              {who.startsWith('driver:') && (
                <View>
                  <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Collection drop</Muted>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {DELIVERY_TIME_SLOTS.map((s) => chip(slot === s.key, s.label, () => setSlot(s.key), s.key))}
                  </View>
                </View>
              )}
            </View>
          )}
          <TextInput value={note} onChangeText={setNote} multiline maxLength={500} placeholder="Note (optional) — e.g. which branch, what each item is for…" style={[box, { minHeight: 56 }]} />
          {ops.some((o) => o.email) && (
            <View style={{ marginBottom: 8 }}>
              <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Also email a copy to (optional)</Muted>
              {ops.filter((o) => o.email).map((o) => (
                <Pressable key={o.id} onPress={() => { const s = new Set(ccIds); if (s.has(o.id)) s.delete(o.id); else s.add(o.id); setCcIds(s); }}>
                  <Text style={{ paddingVertical: 5, color: base.ink }}>{ccIds.has(o.id) ? '☑' : '☐'} {o.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <TextInput value={ccRaw} onChangeText={setCcRaw} autoCapitalize="none" keyboardType="email-address" placeholder="CC other emails (optional, separate with commas)" style={box} />
          <Muted style={{ marginBottom: 8 }}>When the order goes to a branch's own email, the supplier's main order email is copied in automatically. You are always copied in.</Muted>
          <Button busy={busy} title={`Confirm & ${toMe ? `Email ${n > 1 ? `${n} Items ` : ''}to me` : `Send ${n > 1 ? `${n} Items ` : ''}to ${sup?.name ?? ''}`}`} onPress={() => void confirm()} />
        </>
      )}
      <Button kind="ghost" title="Cancel" onPress={onCancel} />
    </View>
  );
}
