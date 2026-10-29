// One Pricing Element (390 renderPricingElementDetail): Price Total, Booked In
// (auto from the weekly build-up, or a manager's override), Balance, the weekly
// build-up (PriceWeeks — or qty per line when fed by a Price Sheet), and Variations to Price. Managers rename, close / reopen, delete and
// decide variations; anyone with price access can request one.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Check, Empty, Muted, SectionTitle } from '@/components/ui';
import { PriceFiles } from '@/components/PriceFiles';
import { PriceWeeks } from '@/components/PriceWeeks';
import { StorageImage } from '@/components/StorageImage';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { addVariationPhoto, decideVariation, deleteElement, patchElement, removeVariation, requestVariation, reviseVariation, usePriceTile, type PriceVariation } from '@/data/price';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { pickPhotos } from '@/lib/photos';
import { money, readAmount } from '@/lib/rules/price';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };

export default function PriceElementPage() {
  const { id, el: elId } = useLocalSearchParams<{ id: string; el: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data } = usePriceTile(me, site);
  const { data: people } = usePeople();
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState<string | null>(null);
  const [override, setOverride] = useState<string | null>(null);
  if (!me || !site || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const el = data.elements.find((x) => x.id === elId);
  if (!el) return <Muted style={{ padding: space.l }}>This price is no longer here.</Muted>;
  if (el.closed && !data.mgr && !el.closed_show_price_to_operatives) return <Muted style={{ padding: space.l }}>This price is closed.</Muted>;
  const f = data.figs[el.id], mgr = data.mgr, canPrice = data.canPrice(el.id);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['priceTile', site.id] }); };
  const vs = data.variations.filter((v) => v.element_id === el.id);
  const saveNum = async (field: 'price_total' | 'price_booked_override', v: string) => {
    const n = readAmount(v); if (n === 'bad') { toast('Enter a number'); return; }
    toast((await patchElement(el.id, { [field]: n })) ? 'Saved' : 'Could not save — try again.'); setTotal(null); setOverride(null); refresh();
  };
  const menu = async () => {
    const k = await chooseAction(el.name, [{ key: 'rename', label: 'Rename' }, { key: el.closed ? 'reopen' : 'close', label: el.closed ? 'Reopen' : 'Close' }, { key: 'delete', label: 'Delete' }]);
    if (k === 'rename') { const n = await promptText('Rename', el.name); if (n && n.trim()) { toast((await patchElement(el.id, { name: n.trim() })) ? 'Renamed' : 'Could not save — try again.'); refresh(); } }
    else if (k === 'close') { toast((await patchElement(el.id, { closed: true, closed_by: me.id, closed_at: new Date().toISOString() })) ? 'Pricing Element closed' : 'Could not save — try again.'); refresh(); }
    else if (k === 'reopen') { toast((await patchElement(el.id, { closed: false, closed_by: null, closed_at: null })) ? 'Reopened' : 'Could not save — try again.'); refresh(); }
    else if (k === 'delete') {
      if (!(await confirmAsk(`Delete the Pricing Element "${el.name}"? This deletes its price total, build-up, price sheet, labour invoices and variations. This can't be undone.`, 'Delete'))) return;
      if (await deleteElement(el.id)) { toast('Pricing Element deleted'); refresh(); router.back(); } else toast('Could not delete — try again.');
    }
  };
  const vMenu = async (v: PriceVariation) => {
    const opts = [
      ...(v.status === 'pending' ? [{ key: 'approve', label: 'Approve' }, { key: 'reject', label: 'Reject…' }] : []),
      { key: 'revise', label: v.status === 'pending' ? 'Revise and approve…' : v.status === 'rejected' ? 'Revisit (resubmit)…' : 'Edit…' },
      { key: 'remove', label: 'Remove' },
    ];
    const k = await chooseAction(money(v.amount), opts);
    if (k === 'approve') { toast((await decideVariation(me, site, v, true)) ? 'Approved' : 'Could not save — try again.'); refresh(); }
    else if (k === 'reject') { const r = await promptText('Reason for rejecting', ''); if (r === null) return; if (!r.trim()) { toast('Enter a reason for rejecting.'); return; } toast((await decideVariation(me, site, v, false, r.trim())) ? 'Rejected' : 'Could not save — try again.'); refresh(); }
    else if (k === 'revise') {
      const a = await promptText('Amount (£)', String(v.amount ?? '')); if (a === null) return;
      const n = readAmount(a); if (n === 'bad' || !n || n <= 0) { toast('Enter an amount'); return; }
      const t = await promptText('Explain the variation', v.note || ''); if (t === null) return; if (!t.trim()) { toast('Explain the variation'); return; }
      const msg = await reviseVariation(me, site, v, n, t.trim()); toast(msg || 'Could not save — try again.'); refresh();
    } else if (k === 'remove') { if (!(await confirmAsk('Remove this variation request?', 'Remove'))) return; toast((await removeVariation(me, site.id, v)) ? 'Request removed' : 'Could not remove — try again.'); refresh(); }
  };
  const row = (l: string, v: string, colour: string = base.ink) => <View style={{ flexDirection: 'row', paddingVertical: 4 }}><Text style={{ flex: 1, color: base.slate }}>{l}</Text><Text style={{ fontWeight: '800', color: colour }}>{v}</Text></View>;

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: el.name, headerRight: mgr ? () => <Pressable onPress={() => void menu()} hitSlop={10} style={{ paddingHorizontal: 12 }}><Text style={{ fontSize: 18, color: base.ink }}>⋮</Text></Pressable> : undefined }} />
      {el.closed && <Muted style={{ marginBottom: 8 }}>This price is closed.</Muted>}
      {canPrice ? (
        <Card>
          {row('Price Total', money(f.priceTotal))}
          {row(`Booked In${f.hasOverride ? ' (set by hand)' : ''}`, money(f.bookedIn))}
          {f.awApprovedTotal > 0 && row('Approved variations', `+ ${money(f.awApprovedTotal)}`)}
          {f.awNotApprovedTotal > 0 && row('Variations waiting', money(f.awNotApprovedTotal), base.slate)}
          {row('Balance', money(f.balance), f.balance < 0 ? base.warn : base.ok)}
          {mgr && (
            <View style={{ marginTop: 10 }}>
              <Muted style={{ fontWeight: '700' }}>Price Total (£)</Muted>
              <TextInput value={total ?? (el.price_total == null ? '' : String(el.price_total))} onChangeText={setTotal} keyboardType="decimal-pad" style={box} onBlur={() => { if (total != null) void saveNum('price_total', total); }} />
              <Muted style={{ fontWeight: '700' }}>Booked In override (£) — leave blank to add up the weeks ({money(f.autoBookedIn)})</Muted>
              <TextInput value={override ?? (el.price_booked_override == null ? '' : String(el.price_booked_override))} onChangeText={setOverride} keyboardType="decimal-pad" style={box} onBlur={() => { if (override != null) void saveNum('price_booked_override', override); }} />
              {el.closed && <Check label="Operatives can see the price while closed" value={!!el.closed_show_price_to_operatives} onChange={async (v) => { toast((await patchElement(el.id, { closed_show_price_to_operatives: v })) ? 'Saved' : 'Could not save — try again.'); refresh(); }} />}
            </View>
          )}
        </Card>
      ) : <Muted style={{ marginBottom: 8 }}>You can see this price&apos;s labour invoices only.</Muted>}
      <PriceFiles me={me} site={site} el={el} mgr={mgr} canPrice={canPrice} canLabour={data.canLabour(el.id)} />

      {canPrice && <PriceWeeks me={me} site={site} elementId={el.id} mgr={mgr} />}

      {canPrice && (
        <>
          <SectionTitle>Variations to Price</SectionTitle>
          {vs.length ? vs.map((v) => (
            <Pressable key={v.id} disabled={!mgr} onPress={() => void vMenu(v)}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: base.ink }}>{money(v.amount)} · {v.note || ''}</Text>
                  <Muted>{v.requested_by ? `${nameOf(people, v.requested_by)} · ` : ''}{new Date(v.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}{v.rejection_reason ? ` · Reason: ${v.rejection_reason}` : ''}</Muted>
                  {!!v.photo_path && <Pressable onPress={async () => { const u = await openDocLink('site-photos', v.photo_path as string); if (u) void Linking.openURL(u); }}><StorageImage bucket="site-photos" path={v.photo_path} style={{ width: 64, height: 64, borderRadius: 8, marginTop: 6 }} /></Pressable>}
                </View>
                {!v.photo_path && (mgr || v.requested_by === me.id) && (
                  <Pressable hitSlop={6} onPress={async () => {
                    const src = await chooseAction('Add a photo', [{ key: 'camera', label: 'Take a photo' }, { key: 'library', label: 'Choose from library' }]); if (!src) return;
                    const picked = await pickPhotos(src as 'camera' | 'library', false); if ('error' in picked) { toast(picked.error); return; } if (!picked[0]) return;
                    toast((await addVariationPhoto(site.id, v, picked[0])) ? 'Photo added' : 'Could not add the photo — try again.'); refresh();
                  }} style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: base.line, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 13 }}>📷</Text></Pressable>
                )}
                <Text style={{ fontWeight: '700', color: v.status === 'approved' ? base.ok : v.status === 'rejected' ? base.red : base.warn }}>{v.status === 'approved' ? 'Approved' : v.status === 'rejected' ? 'Rejected' : 'Pending'}</Text>
              </Card>
            </Pressable>
          )) : <Empty>No variations to price yet.</Empty>}
          <Card>
            <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Request a variation to price</Muted>
            <TextInput value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="Amount (£)" style={box} />
            <TextInput value={note} onChangeText={setNote} placeholder="Explain the variation" multiline style={[box, { minHeight: 56 }]} />
            <Button busy={busy} title="Add request" onPress={async () => {
              const n = readAmount(amt); if (n === 'bad' || !n || n <= 0) { toast('Enter an amount'); return; }
              if (!note.trim()) { toast('Explain the variation'); return; }
              setBusy(true); const ok = await requestVariation(me, site, el.id, n, note.trim(), money(n)); setBusy(false);
              if (ok) { toast('Request added'); setAmt(''); setNote(''); refresh(); } else toast('Could not save — try again.');
            }} />
          </Card>
        </>
      )}
    </ScrollView>
  );
}
