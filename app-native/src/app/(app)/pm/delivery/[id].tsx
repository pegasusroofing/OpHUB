// Add / edit a delivery (870 renderDeliveryForm + saveDeliveryTask). Site (or a
// job not on the app), which address on a multi-address job, what's needed,
// where to collect from (yard / supplier + branch / typed / none / clear site),
// 1 or 2 drops, site contact, date and drop (taken drops are greyed), driver,
// photos and the 1st DROP tick (one a day — booking a second offers to swap).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Check, Muted } from '@/components/ui';
import { blankDraft, deleteDelivery, draftFrom, existingFirstDrop, loadDelivery, saveDelivery, uploadDraftPhotos, useDeliveryRequests, useStaff, type Draft, type FullDelivery, type Orig } from '@/data/deliveries';
import { completionPhotos, dayList, placeOf, reopenDelivery, siteLabel } from '@/data/driver';
import { useSuppliers } from '@/data/materials';
import { useSites, useSubAddresses } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { pickPhotos } from '@/lib/photos';
import { siteStatusKey } from '@/lib/rules/checkin';
import { blockedSlots, CLEAR_SITE, collectionKind, DELIVERY_TIME_SLOTS, localISODate, nextSlotKey, NO_COLLECTION, slotLabel, slotProblem } from '@/lib/rules/driver';
import { branchLabel, readIsoDate, subAddrLabel } from '@/lib/rules/materials';
import { supabase } from '@/lib/supabase';
import { base, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 10 };
const Label = ({ children }: { children: string }) => <Text style={{ fontSize: 12, fontWeight: '700', color: base.slate, marginBottom: 4 }}>{children}</Text>;
function Pick({ value, placeholder, onPress }: { value: string; placeholder: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[box, { paddingVertical: 12 }]}><Text style={{ color: value ? base.ink : base.slate }}>▼ {value || placeholder}</Text></Pressable>;
}

export default function DeliveryForm() {
  const { id, date, slot, req } = useLocalSearchParams<{ id: string; date?: string; slot?: string; req?: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const { data: people = [] } = useStaff();
  const { data: suppliers = [] } = useSuppliers(me?.org_id);
  const { data: reqs } = useDeliveryRequests(me?.org_id);
  const [d, setD] = useState<Draft | null>(null);
  const [orig, setOrig] = useState<Orig>(null);
  const [task, setTask] = useState<FullDelivery | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const isNew = id === 'new';
  const site = d && !d.manualSite ? sites.find((s) => s.id === d.site_id) : undefined;
  const { data: addrs = [] } = useSubAddresses(site?.id, !!site?.multi_site);
  const { data: siteOps = [] } = useQuery({
    queryKey: ['siteOpsForDelivery', d?.site_id], enabled: !!d?.site_id,
    queryFn: async () => (((await supabase.from('site_assignments').select('user_id').eq('site_id', d?.site_id as string)).data ?? []) as { user_id: string }[]).map((r) => r.user_id),
  });
  const { data: dayTasks = [] } = useQuery({ queryKey: ['dayList', me?.org_id, d?.scheduled_date], enabled: !!me && !!d?.scheduled_date, queryFn: () => dayList(me?.org_id as string, d?.scheduled_date as string) });
  const drivers = people.filter((p) => p.role === 'driver');

  useEffect(() => {
    if (d || !me) return;
    if (!isNew) { void loadDelivery(id).then((t) => { if (!t) { toast('Delivery not found'); router.back(); return; } const x = draftFrom(t); setTask(t); setOrig(x.orig); setD(x.draft); }); return; }
    if (req && !reqs) return;
    const r = req ? (reqs ?? []).find((x) => x.id === req) ?? null : null;
    setD(blankDraft(date || localISODate(new Date()), slot || null, r, people));
  }, [d, me, id, isNew, req, reqs, date, slot, people, toast]);
  // New: start on the first free drop; one driver: assign them.
  useEffect(() => {
    if (!d || !isNew) return;
    if (!slot && slotProblem(dayTasks, { id: 'new', double_slot: d.double_slot }, d.time_slot, placeOf(sites))) {
      const free = DELIVERY_TIME_SLOTS.find((s) => !slotProblem(dayTasks, { id: 'new', double_slot: d.double_slot }, s.key, placeOf(sites)));
      if (free && free.key !== d.time_slot) setD({ ...d, time_slot: free.key });
    }
    if (drivers.length === 1 && !d.driver_id) setD({ ...d, driver_id: drivers[0].id });
  }, [d, dayTasks, drivers, isNew, sites, slot]);
  if (!me || !d) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });

  const pickSite = async () => {
    const sorted = sites.slice().sort((a, b) => a.name.localeCompare(b.name));
    const group = (k: string) => sorted.filter((s) => siteStatusKey(s) === k).map((s) => ({ key: s.id, label: s.name }));
    const live = sorted.filter((s) => !['upcoming', 'closed'].includes(siteStatusKey(s))).map((s) => ({ key: s.id, label: s.name }));
    const k = await chooseAction('Site', [{ key: '__manual', label: '✏️ Not on the app — type the address' }, ...live, ...group('upcoming').map((o) => ({ ...o, label: `Upcoming · ${o.label}` })), ...group('closed').map((o) => ({ ...o, label: `Closed · ${o.label}` }))]);
    if (k) set({ manualSite: k === '__manual', site_id: k === '__manual' ? '' : k, site_contact_id: '', sub_site_id: '', sub_site_label: null });
  };
  const collectionValue = () => {
    const k = collectionKind(d as never);
    if (k === 'yard') return 'YARD';
    if (k === 'supplier') return suppliers.find((s) => s.id === d.supplier_id)?.name || 'Supplier';
    return k === 'none' ? 'No collection' : k === 'clear' ? 'Clear site' : 'Other (type address)';
  };
  const pickCollection = async () => {
    const k = await chooseAction('Collection', [{ key: 'yard', label: 'YARD' }, ...suppliers.map((s) => ({ key: `supplier:${s.id}`, label: s.name })), { key: 'manual', label: 'Other (type address)' }, { key: 'none', label: 'No collection' }, { key: 'clear', label: 'Clear site' }]);
    if (!k) return;
    if (k === 'yard') set({ collection_type: 'yard', supplier_id: '', supplier_branch: null });
    else if (k === 'manual') set({ collection_type: 'manual', supplier_id: '', supplier_branch: null, collection_address_manual: collectionKind(d as never) === 'manual' ? d.collection_address_manual : '' });
    else if (k === 'none' || k === 'clear') set({ collection_type: 'manual', supplier_id: '', supplier_branch: null, collection_address_manual: k === 'none' ? NO_COLLECTION : CLEAR_SITE });
    else { const sid = k.split(':')[1]; set({ collection_type: 'supplier', supplier_id: sid, supplier_branch: sid === d.supplier_id ? d.supplier_branch : null }); }
  };
  const sup = suppliers.find((s) => s.id === d.supplier_id);
  const branches = sup?.branches ?? [];
  const contactLabel = () => {
    if (d.site_contact_id === '__typed') return '✏️ Type a name & number…';
    const p = people.find((x) => x.id === d.site_contact_id);
    return p ? `${p.name}${p.phone ? ` — ${p.phone}` : ' (no phone saved)'}` : 'None';
  };
  const pickContact = async () => {
    const opt = (p: (typeof people)[number], g: string) => ({ key: p.id, label: `${g} · ${p.name}${p.phone ? ` — ${p.phone}` : ' (no phone saved)'}` });
    const on = new Set(siteOps);
    const k = await chooseAction('Site contact', [
      { key: '', label: 'None' }, { key: '__typed', label: '✏️ Type a name & number…' },
      ...people.filter((p) => p.role === 'admin').map((p) => opt(p, 'Admin')),
      ...people.filter((p) => p.role === 'pm').map((p) => opt(p, 'PM')),
      ...people.filter((p) => p.role === 'site_manager').map((p) => opt(p, 'Site Manager')),
      ...people.filter((p) => p.role === 'operative' && on.has(p.id)).map((p) => opt(p, 'On this site')),
      ...people.filter((p) => p.role === 'operative' && !on.has(p.id)).map((p) => opt(p, 'Operative')),
    ]);
    if (k !== null) set({ site_contact_id: k });
  };
  const others = blockedSlots(dayTasks.filter((x) => x.id !== d.id));
  const why = slotProblem(dayTasks, { id: d.id || 'new', double_slot: d.double_slot }, d.time_slot, placeOf(sites));
  const pickDrop = async () => {
    const opts = DELIVERY_TIME_SLOTS.map((s) => {
      const w = slotProblem(dayTasks, { id: d.id || 'new', double_slot: d.double_slot }, s.key, placeOf(sites));
      return { key: s.key, label: `${s.label}${others[s.key] ? ' — taken (extra time)' : w ? ' — not free' : ''}`, w };
    });
    const k = await chooseAction('Drop', opts.map((o) => ({ key: o.key, label: o.label })));
    if (!k) return;
    const o = opts.find((x) => x.key === k);
    if (o?.w && k !== d.time_slot) { showAlert(o.w); return; }
    set({ time_slot: k });
  };
  const addPhotos = async () => {
    const picked = await pickPhotos('library', true);
    if ('error' in picked) { toast(picked.error); return; }
    if (!picked.length) return;
    setPhotoBusy(true);
    const r = await uploadDraftPhotos(me, picked);
    setPhotoBusy(false);
    if (r.failed) toast(`${r.failed} photo${r.failed === 1 ? '' : 's'} could not be uploaded — try again.`);
    set({ photo_paths: [...d.photo_paths, ...r.paths] });
  };

  const save = async () => {
    if (d.manualSite) { if (!d.manual_site_address.trim() && !d.manual_site_name.trim()) { toast('Type the site address.'); return; } }
    else if (!d.site_id) { toast('Choose a site.'); return; }
    if (site?.multi_site && addrs.length && !d.sub_site_id) { toast('Choose which address on this job.'); return; }
    if (!d.description.trim()) { toast('Add a description.'); return; }
    const dt = readIsoDate(d.scheduled_date); if (!dt || dt === 'bad') { toast('Enter the date as YYYY-MM-DD.'); return; }
    if (d.collection_type === 'manual' && !d.collection_address_manual.trim()) { toast('Enter a collection address.'); return; }
    if (d.collection_type === 'supplier' && !d.supplier_id) { toast('Choose a supplier.'); return; }
    if (drivers.length > 1 && !d.driver_id) { toast('Choose a driver, or pick Unassigned.'); return; }
    let clear: FullDelivery[] = [];
    if (d.high_priority && d.time_slot === DELIVERY_TIME_SLOTS[0].key) {
      clear = await existingFirstDrop(me, d);
      if (clear.length) {
        const o = clear[0];
        const swap = await confirmAsk(`There is already a 1st drop on this day (${siteLabel(o, sites)}${o.description ? ` — ${o.description}` : ''}). Only one delivery can be the 1st drop — make this one the 1st drop instead?`, 'Yes');
        if (!swap) { set({ high_priority: false }); toast('Kept the existing 1st drop — this one is unticked.'); return; }
      }
    }
    setBusy(true);
    const r = await saveDelivery(me, { ...d, scheduled_date: dt }, orig, sites, clear);
    setBusy(false);
    if (!r.ok) { showAlert(r.msg); return; }
    toast(r.msg);
    void qc.invalidateQueries({ queryKey: ['scheduleDay'] }); void qc.invalidateQueries({ queryKey: ['deliveryRequests'] }); void qc.invalidateQueries({ queryKey: ['driverDay'] });
    router.back();
  };

  const done = task?.status === 'completed';
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'Add Delivery' : 'Edit Delivery' }} />
      {done && task && (
        <Card style={{ borderColor: base.ok }}>
          <Text style={{ fontWeight: '800', color: base.ok }}>✓ Completed{task.completed_at ? ` ${new Date(task.completed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</Text>
          {!!task.completed_by && <Muted>By {people.find((p) => p.id === task.completed_by)?.name || ''}</Muted>}
          {completionPhotos(task).length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{completionPhotos(task).map((p) => <StorageImage key={p} bucket="site-photos" path={p} style={{ width: 90, height: 90, borderRadius: 8 }} />)}</View> : <Muted>No completion photo on file.</Muted>}
          <Button kind="ghost" title="↩ Re-open delivery" onPress={async () => {
            if (!(await confirmAsk('Re-open this delivery on the same day and drop?', 'Re-open'))) return;
            const r = await reopenDelivery(me, task, { date: task.scheduled_date, slot: task.time_slot }, sites);
            toast(r.msg); if (r.ok) { void qc.invalidateQueries({ queryKey: ['scheduleDay'] }); router.back(); }
          }} />
        </Card>
      )}
      <Label>Site</Label>
      <Pick value={d.manualSite ? '✏️ Not on the app' : site?.name || ''} placeholder="Choose a site…" onPress={() => void pickSite()} />
      {!!site?.multi_site && addrs.length > 0 && (
        <>
          <Label>Which address on this job?</Label>
          <Pick value={addrs.find((a) => a.id === d.sub_site_id) ? subAddrLabel(addrs.find((a) => a.id === d.sub_site_id)) : ''} placeholder="Choose an address…"
            onPress={async () => { const k = await chooseAction('Which address?', addrs.map((a) => ({ key: a.id, label: subAddrLabel(a) }))); if (k) set({ sub_site_id: k, sub_site_label: subAddrLabel(addrs.find((a) => a.id === k)) || null }); }} />
        </>
      )}
      {d.manualSite && (
        <Card>
          <Muted style={{ marginBottom: 6 }}>For a job that isn&apos;t set up on the app. Type the details the driver needs.</Muted>
          <Label>Site address</Label>
          <TextInput value={d.manual_site_address} onChangeText={(v) => set({ manual_site_address: v })} multiline placeholder="e.g. 14 High Street, Croydon, CR0 1AB" style={[box, { minHeight: 56 }]} />
        </Card>
      )}
      <Label>Description</Label>
      <TextInput value={d.description} onChangeText={(v) => set({ description: v })} multiline placeholder="What's needed?" style={[box, { minHeight: 70 }]} />
      <Label>Collection</Label>
      <Pick value={collectionValue()} placeholder="" onPress={() => void pickCollection()} />
      {d.collection_type === 'supplier' && !!d.supplier_id && (branches.length ? (
        <>
          <Label>Branch</Label>
          <Pick value={d.supplier_branch ? branchLabel(d.supplier_branch) : ''} placeholder="— Choose a branch —" onPress={async () => {
            const k = await chooseAction('Branch', [{ key: '', label: '— No branch —' }, ...branches.map((b) => ({ key: b.id, label: branchLabel(b) }))]);
            if (k === null) return;
            const b = branches.find((x) => x.id === k);
            set({ supplier_branch: b ? { id: b.id, name: b.name || '', address: b.address || '', phone: b.phone || '' } : null });
          }} />
        </>
      ) : <Muted style={{ marginBottom: 10 }}>This supplier has no branches saved — add them in Admin › Suppliers.</Muted>)}
      {collectionKind(d as never) === 'manual' && (
        <>
          <Label>Collection address</Label>
          <TextInput value={d.collection_address_manual} onChangeText={(v) => set({ collection_address_manual: v })} placeholder="Address or pickup details" style={box} />
        </>
      )}
      <Label>Is additional time required?</Label>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
        {[[false, '1 drop', 'Normal'], [true, '2 drops', 'Extra time']].map(([v, a, b]) => (
          <Pressable key={String(v)} onPress={() => set({ double_slot: v as boolean })} style={{ flex: 1, padding: 10, borderRadius: radius.input, borderWidth: 2, borderColor: d.double_slot === v ? base.ink : base.line, alignItems: 'center', backgroundColor: base.card }}>
            <Text style={{ fontWeight: '800', color: base.ink }}>{a as string}</Text><Muted>{b as string}</Muted>
          </Pressable>
        ))}
      </View>
      {d.double_slot && <Muted style={{ marginBottom: 10 }}>Takes the chosen drop and the one after it — nothing else can be booked into that next drop.</Muted>}
      <Label>Site contact</Label>
      <Pick value={contactLabel()} placeholder="None" onPress={() => void pickContact()} />
      {d.site_contact_id === '__typed' && <TextInput value={d.site_contact_manual} onChangeText={(v) => set({ site_contact_manual: v })} placeholder="e.g. Dave (foreman) 07123 456789" style={box} />}
      {!!d.site_id && !siteOps.length && <Muted style={{ marginBottom: 10 }}>No operatives assigned to this site yet.</Muted>}
      <Label>Date (YYYY-MM-DD)</Label>
      <TextInput value={d.scheduled_date} onChangeText={(v) => set({ scheduled_date: v })} autoCapitalize="none" style={box} />
      <Label>Drop</Label>
      <Pick value={slotLabel(d.time_slot)} placeholder="" onPress={() => void pickDrop()} />
      {why ? <Text style={{ color: base.warn, marginTop: -6, marginBottom: 10 }}>{why}</Text> : d.double_slot && nextSlotKey(d.time_slot) ? <Muted style={{ marginTop: -6, marginBottom: 10 }}>Also takes the {slotLabel(nextSlotKey(d.time_slot) as string)}.</Muted> : null}
      {drivers.length ? (
        <>
          <Label>Driver</Label>
          <Pick value={d.driver_id === 'none' ? 'Unassigned — no driver yet' : drivers.find((x) => x.id === d.driver_id)?.name || ''} placeholder="Choose a driver…" onPress={async () => {
            const k = await chooseAction('Driver', [...drivers.map((x) => ({ key: x.id, label: x.name })), { key: 'none', label: 'Unassigned — no driver yet' }]);
            if (k) set({ driver_id: k });
          }} />
          <Muted style={{ marginTop: -6, marginBottom: 10 }}>An unassigned delivery shows on every driver&apos;s schedule until one is chosen.</Muted>
        </>
      ) : <Text style={{ color: base.warn, marginBottom: 10 }}>No delivery drivers set up yet — this will sit unassigned until one is added.</Text>}
      <Label>Photos (optional)</Label>
      {d.photo_paths.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {d.photo_paths.map((p, i) => (
            <Pressable key={p} onPress={async () => { if (await confirmAsk('Remove this photo?', 'Remove')) set({ photo_paths: d.photo_paths.filter((_, j) => j !== i) }); }}>
              <StorageImage bucket="site-photos" path={p} style={{ width: 80, height: 80, borderRadius: 8 }} />
            </Pressable>
          ))}
        </View>
      )}
      <Button kind="ghost" busy={photoBusy} title={d.photo_paths.length ? '📷 Add more photos' : '📷 Add photos'} onPress={() => void addPhotos()} />
      <Card style={{ marginTop: 10 }}>
        <Check label="1st DROP" value={d.high_priority} onChange={(v) => set({ high_priority: v, time_slot: v ? DELIVERY_TIME_SLOTS[0].key : d.time_slot })} />
        <Muted>Tick this if it must be the driver&apos;s first delivery of the day. Only one delivery can be the 1st drop each day — it shows at the top of the driver&apos;s list.</Muted>
      </Card>
      <Button busy={busy} title={isNew ? 'Add to Delivery Schedule' : 'Save Changes'} onPress={() => void save()} />
      {!isNew && task && <Button kind="ghost" title="Delete Delivery" onPress={async () => {
        if (!(await confirmAsk('Delete this delivery? This cannot be undone.', 'Delete'))) return;
        if (await deleteDelivery(me, task)) { toast('Delivery deleted'); void qc.invalidateQueries({ queryKey: ['scheduleDay'] }); router.back(); } else toast('Could not delete — try again.');
      }} />}
    </ScrollView>
  );
}
