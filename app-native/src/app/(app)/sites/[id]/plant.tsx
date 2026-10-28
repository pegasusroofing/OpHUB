// Plant on this job (740 renderPlant): each item with its photo, inspection due
// badge and status. Check Out (pre-use checklist) / Check In (photo + notes) for
// operatives; managers sign off or decline, mark out of service, remove, see plant
// at other jobs / the yard and Bring Here, and add new items.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle, Toggle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import {
  addPlantItem, bringHere, declineCheckin, declineCheckout, removePlant, requestCheckin, requestCheckout, setOutOfService, signOffCheckin, signOffCheckout, usePlant,
} from '@/data/plant';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { pickPhotos, type Picked } from '@/lib/photos';
import { readIsoDate } from '@/lib/rules/materials';
import { categoryLabel, dueBadge, effectiveState, PLANT_CHECKLIST, type PlantItem } from '@/lib/rules/plant';
import { isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
const toneColour = { none: base.slate, bad: base.red, warn: base.warn, ok: base.ok };

async function photo(): Promise<Picked | null> {
  const k = await chooseAction('Add photo', [{ key: 'camera', label: '📷 Take a photo' }, { key: 'library', label: '🖼 Choose from library' }]);
  if (!k) return null;
  const p = await pickPhotos(k as 'camera' | 'library', false);
  if ('error' in p) { showAlert(p.error); return null; }
  return p[0] ?? null;
}

export default function Plant() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [others, setOthers] = useState(false);
  const { data, isLoading } = usePlant(id, me?.org_id, others);
  const { data: people } = usePeople();
  const { data: sites } = useSites();
  const [open, setOpen] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Record<string, boolean>>>({});
  const [checkin, setCheckin] = useState<Record<string, { photo: Picked | null; notes: string }>>({});
  const [adding, setAdding] = useState<null | { name: string; category: string; serial: string; description: string; interval: number; nextDue: string; photo: Picked | null }>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const mgr = isManager(me);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['plant', id] });
  const signed = (msg: string) => { toast(msg); if (msg.startsWith('Adopt')) router.push('/signature'); refresh(); };

  const card = (item: PlantItem) => {
    const latest = data?.latest[item.id];
    const state = effectiveState(item, latest);
    const badge = dueBadge(item);
    const holder = latest?.operative_id ? nameOf(people, latest.operative_id) : '';
    const status = state === 'pending_checkout_signoff' ? `Awaiting PM sign-off — requested by ${holder}` : state === 'checked_out' ? `Checked out to ${holder}`
      : state === 'pending_checkin_signoff' ? `Check-in awaiting PM sign-off — ${holder}` : state === 'out_of_service' ? 'Out of service' : 'Available';
    const isOpen = open === item.id;
    const ans = answers[item.id];
    const ci = checkin[item.id];
    return (
      <Card key={item.id}>
        <Pressable onPress={() => setOpen(isOpen ? null : item.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {item.photo_path ? <StorageImage bucket="operative-tools" path={item.photo_path} style={{ width: 48, height: 48, borderRadius: 8 }} /> : <Text style={{ fontSize: 26 }}>🏗</Text>}
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{item.name}</Text>
            <Muted>{categoryLabel(item.category)}{item.serial_number ? ` · ${item.serial_number}` : ''}</Muted>
            <Text style={{ fontWeight: '700', color: base.ink, fontSize: 12.5 }}>{status}</Text>
          </View>
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: toneColour[badge.tone] }}>{badge.label}</Text>
        </Pressable>
        {isOpen && (
          <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: base.line, paddingTop: 10 }}>
            {!!item.description && <Muted style={{ marginBottom: 8 }}>{item.description}</Muted>}
            {state === 'available' && !ans && <Button title="Check Out" onPress={() => setAnswers({ ...answers, [item.id]: {} })} />}
            {state === 'available' && ans && (
              <View>
                <SectionTitle>Pre-Use Plant Checklist</SectionTitle>
                {PLANT_CHECKLIST.map((q) => (
                  <View key={q.key} style={{ marginBottom: 8 }}>
                    <Text style={{ fontWeight: '700', color: base.ink }}>{q.label}</Text>
                    <Muted>{q.text}</Muted>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      {[true, false].map((v) => (
                        <Pressable key={String(v)} onPress={() => { setAnswers({ ...answers, [item.id]: { ...ans, [q.key]: v } }); if (!v) showAlert("This will be flagged to your PM — they may decline the check-out until it's resolved."); }}
                          style={{ flex: 1, alignItems: 'center', padding: 9, borderRadius: 8, borderWidth: 1, borderColor: ans[q.key] === v ? base.ink : base.line, backgroundColor: ans[q.key] === v ? base.ink : base.card }}>
                          <Text style={{ fontWeight: '700', color: ans[q.key] === v ? '#fff' : base.ink }}>{v ? 'Yes' : 'No'}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
                <Button busy={busy} title="Request Check-Out" onPress={async () => {
                  if (PLANT_CHECKLIST.some((q) => ans[q.key] === undefined)) { toast('Answer every checklist question first.'); return; }
                  setBusy(true); const ok = await requestCheckout(me, id, item.id, ans); setBusy(false);
                  if (ok) { toast('Check-out requested — awaiting PM sign-off'); const n = { ...answers }; delete n[item.id]; setAnswers(n); setOpen(null); refresh(); } else toast('Could not save — try again.');
                }} />
              </View>
            )}
            {state === 'checked_out' && latest?.operative_id === me.id && !ci && <Button title="Check In" onPress={() => setCheckin({ ...checkin, [item.id]: { photo: null, notes: '' } })} />}
            {state === 'checked_out' && latest?.operative_id === me.id && ci && (
              <View>
                <SectionTitle>Check In</SectionTitle>
                {ci.photo ? <Image source={{ uri: ci.photo.uri }} style={{ width: 120, height: 120, borderRadius: 8, marginBottom: 8 }} /> : null}
                <Button kind="ghost" title={ci.photo ? 'Change photo' : 'Take Photo of Item (required)'} onPress={async () => { const p = await photo(); if (p) setCheckin({ ...checkin, [item.id]: { ...ci, photo: p } }); }} />
                <TextInput value={ci.notes} onChangeText={(t) => setCheckin({ ...checkin, [item.id]: { ...ci, notes: t } })} multiline placeholder="Condition notes (optional)" style={[box, { minHeight: 56 }]} />
                <Button busy={busy} title="Request Check-In" onPress={async () => {
                  if (!ci.photo || !latest) { toast('A photo is required to check this item back in.'); return; }
                  setBusy(true); const err = await requestCheckin(me, latest.id, ci.photo, ci.notes.trim()); setBusy(false);
                  if (err) { toast(err); return; }
                  toast('Check-in submitted — awaiting PM sign-off'); const n = { ...checkin }; delete n[item.id]; setCheckin(n); setOpen(null); refresh();
                }} />
              </View>
            )}
            {mgr && latest && state === 'pending_checkout_signoff' && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Button title="Sign Off Check-Out" onPress={async () => signed(await signOffCheckout(me, latest))} /></View>
                <View style={{ flex: 1 }}><Button kind="ghost" title="Decline" onPress={async () => { if (await confirmAsk('Decline this check-out request?', 'Decline') && await declineCheckout(latest.id)) { toast('Check-out declined'); refresh(); } }} /></View>
              </View>
            )}
            {mgr && latest && state === 'pending_checkin_signoff' && (
              <View>
                {!!latest.checkin_photo_path && <StorageImage bucket="operative-tools" path={latest.checkin_photo_path} style={{ width: 220, height: 220, borderRadius: 10, marginBottom: 8 }} />}
                {!!latest.checkin_notes && <Muted>Notes: {latest.checkin_notes}</Muted>}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><Button title="Sign Off Check-In" onPress={async () => signed(await signOffCheckin(me, latest))} /></View>
                  <View style={{ flex: 1 }}><Button kind="ghost" title="Decline" onPress={async () => { if (await confirmAsk('Decline this check-in? The item stays checked out to the operative.', 'Decline') && await declineCheckin(latest.id)) { toast('Check-in declined'); refresh(); } }} /></View>
                </View>
              </View>
            )}
            {mgr && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <View style={{ flex: 1 }}><Button kind="ghost" title={state === 'out_of_service' ? 'Mark Available' : 'Mark Out Of Service'} onPress={async () => { if (await setOutOfService(item.id, state !== 'out_of_service')) { toast(state !== 'out_of_service' ? 'Marked out of service' : 'Marked available'); refresh(); } }} /></View>
                <View style={{ flex: 1 }}><Button kind="ghost" title="Remove" onPress={async () => { if (await confirmAsk(`Remove "${item.name}" from the plant register? This cannot be undone.`, 'Remove') && await removePlant(item.id)) { toast('Removed'); refresh(); } }} /></View>
              </View>
            )}
          </View>
        )}
      </Card>
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Plant' }} />
      <Muted style={{ marginBottom: 12 }}>Check plant and equipment in and out — every check-out and check-in needs a Project Manager's electronic sign-off.</Muted>
      {isLoading || !data ? <Muted>Loading…</Muted> : data.items.length ? data.items.map(card) : <Empty>No plant assigned to this site yet.</Empty>}
      {mgr && (
        <>
          <Toggle title="Plant At Other Sites / Yard" open={others} onPress={() => setOthers(!others)} />
          {others && (data?.others.length ? data.others.map((it) => (
            <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginTop: 6, backgroundColor: base.card }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: base.ink }}>{it.name}</Text>
                <Muted>{it.current_site_id ? sites?.find((s) => s.id === it.current_site_id)?.name || 'Another site' : 'At the yard / base'} · {it.current_status === 'available' ? 'Available' : it.current_status === 'out_of_service' ? 'Out of service' : 'Checked out'}</Muted>
              </View>
              {it.current_status === 'available' && <Button kind="ghost" title="Bring Here" onPress={async () => { if (await confirmAsk(`Bring "${it.name}" to this site?`, 'Bring here')) { toast(await bringHere(me, id, it)); refresh(); } }} />}
            </View>
          )) : <Empty>No plant elsewhere.</Empty>)}
          {adding ? (
            <Card style={{ marginTop: 14 }}>
              <SectionTitle>Add Plant Item</SectionTitle>
              <TextInput value={adding.name} onChangeText={(t) => setAdding({ ...adding, name: t })} placeholder="Item name, e.g. Genie GS-1930 MEWP" style={box} />
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                {[['plant', 'Plant / Equipment'], ['pat', 'PAT Tested Appliance']].map(([v, l]) => (
                  <Pressable key={v} onPress={() => setAdding({ ...adding, category: v })} style={{ flex: 1, alignItems: 'center', padding: 9, borderRadius: 8, borderWidth: 1, borderColor: adding.category === v ? base.ink : base.line, backgroundColor: adding.category === v ? base.ink : base.card }}>
                    <Text style={{ fontWeight: '700', color: adding.category === v ? '#fff' : base.ink }}>{l}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput value={adding.serial} onChangeText={(t) => setAdding({ ...adding, serial: t })} placeholder="Serial / identification number" style={box} />
              <TextInput value={adding.description} onChangeText={(t) => setAdding({ ...adding, description: t })} multiline placeholder="Description (optional)" style={[box, { minHeight: 56 }]} />
              <Muted style={{ fontWeight: '700' }}>Recurring Inspection Interval</Muted>
              <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}>
                {[6, 12].map((m) => (
                  <Pressable key={m} onPress={() => setAdding({ ...adding, interval: m })} style={{ flex: 1, alignItems: 'center', padding: 9, borderRadius: 8, borderWidth: 1, borderColor: adding.interval === m ? base.ink : base.line, backgroundColor: adding.interval === m ? base.ink : base.card }}>
                    <Text style={{ fontWeight: '700', color: adding.interval === m ? '#fff' : base.ink }}>Every {m} months</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput value={adding.nextDue} onChangeText={(t) => setAdding({ ...adding, nextDue: t })} placeholder="Next inspection due (YYYY-MM-DD)" autoCapitalize="none" style={box} />
              {adding.photo && <Image source={{ uri: adding.photo.uri }} style={{ width: 100, height: 100, borderRadius: 8, marginBottom: 8 }} />}
              <Button kind="ghost" title={adding.photo ? 'Change photo' : 'Choose Photo (required)'} onPress={async () => { const p = await photo(); if (p) setAdding({ ...adding, photo: p }); }} />
              <Button busy={busy} title="Save Item" onPress={async () => {
                if (!adding.name.trim()) { toast('Enter an item name.'); return; }
                if (!adding.photo) { toast('A photo is required to add a plant item.'); return; }
                const d = readIsoDate(adding.nextDue);
                if (!d || d === 'bad') { toast('Set the next inspection due date (YYYY-MM-DD).'); return; }
                setBusy(true);
                const err = await addPlantItem(me, id, { ...adding, name: adding.name.trim(), serial: adding.serial.trim(), description: adding.description.trim(), nextDue: d, photo: adding.photo });
                setBusy(false);
                if (err) { toast(err); return; }
                toast('Plant item added'); setAdding(null); refresh();
              }} />
              <Button kind="ghost" title="Cancel" onPress={() => setAdding(null)} />
            </Card>
          ) : <Button title="+ Add Plant Item" onPress={() => setAdding({ name: '', category: 'plant', serial: '', description: '', interval: 12, nextDue: '', photo: null })} />}
        </>
      )}
    </ScrollView>
  );
}
