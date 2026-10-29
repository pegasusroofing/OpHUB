// Driver's delivery schedule. Ported from renderDriverSchedule (840): break bar,
// day picker, To do / Completed tabs, "what to pick up where", deliveries by drop,
// completion photos, Mark Complete, Push to Next Working Day and Re-open.
// ?preview=1 is a manager's "Driver view" (840 preview): the same screen for a
// chosen driver, view only (no break, photo, complete, push or re-open buttons).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import { useStoredPhotoMarkup } from '@/components/StoredPhotoMarkup';
import { confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import {
  addCompletionPhotos, completeDelivery, completionPhotos, deliveryPhotos, driverBreak, planPush, pushDelivery,
  removeCompletionPhoto, replaceCompletionPhoto, reopenDelivery, siteHeading, useDriverDay, useDriverStatus, type Delivery,
} from '@/data/driver';
import { useStaff } from '@/data/deliveries';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { pickPhotos } from '@/lib/photos';
import {
  collectionLine, continuations, DELIVERY_TIME_SLOTS, groupCollections, localISODate, slotLabel,
} from '@/lib/rules/driver';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space, useTheme } from '@/theme/theme';

type P = { id: string; name: string; phone: string | null };
function usePhones() {
  return useQuery({
    queryKey: ['phones'], staleTime: 300000,
    queryFn: async () => ((await supabase.from('profiles').select('id,name,phone')).data ?? []) as P[],
  });
}

export default function DriverSchedule() {
  const { me } = useAuth();
  const th = useTheme();
  const toast = useToast();
  const markup = useStoredPhotoMarkup();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ preview?: string; date?: string }>();
  const preview = params.preview === '1' && !!me && isManager(me);
  const [offset, setOffset] = useState(() => (params.date ? Math.round((new Date(`${params.date}T12:00:00`).getTime() - new Date(`${localISODate(new Date())}T12:00:00`).getTime()) / 864e5) : 0));
  const { data: staff = [] } = useStaff();
  const drivers = staff.filter((p) => p.role === 'driver');
  const [pick, setPick] = useState<string | null>(null);
  const viewAs = preview ? (pick && drivers.some((p) => p.id === pick) ? pick : drivers[0]?.id || '') : undefined;
  const [tab, setTab] = useState<'todo' | 'done'>('todo');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reopen, setReopen] = useState<Delivery | null>(null);
  const d = new Date(); d.setDate(d.getDate() + offset);
  const dateISO = localISODate(d);
  const { data, isLoading } = useDriverDay(dateISO, viewAs);
  const status = useDriverStatus();
  const { data: sites = [] } = useSites();
  const { data: people = [] } = usePhones();
  if (!me) return null;

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['driverDay'] }); };
  const tasks = data?.tasks ?? [];
  const done = tasks.filter((t) => t.status === 'completed').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
  const todo = tasks.filter((t) => t.status !== 'completed');
  const shown = tab === 'done' ? done : todo;
  const supplierName = (id: string | null | undefined) => (id ? data?.suppliers[id] : undefined);
  const today = offset === 0;
  const onDuty = !!status.data?.onDuty, brk = status.data?.openBreak;

  const pmOf = (t: Delivery) => {
    const site = t.site_id ? sites.find((s) => s.id === t.site_id) : null;
    const id = site?.responsible_pm_id || t.created_by;
    const p = id ? people.find((x) => x.id === id) : null;
    return p ? { name: p.name, phone: (p.phone || '').trim(), booked: !site?.responsible_pm_id } : null;
  };

  const addPhotos = async (t: Delivery, source: 'camera' | 'library') => {
    const picked = await pickPhotos(source);
    if ('error' in picked) { showAlert(picked.error); return; }
    if (!picked.length) return;
    setBusyId(t.id);
    const r = await addCompletionPhotos(me, t, picked);
    setBusyId(null);
    toast(r.failed ? `${r.failed} photo${r.failed === 1 ? '' : 's'} could not be uploaded — check your connection and try again.` : r.added === 1 ? 'Photo added' : `${r.added} photos added`);
    refresh();
  };
  const complete = async (t: Delivery) => {
    setBusyId(t.id);
    toast(await completeDelivery(me, t, sites));
    setBusyId(null); refresh();
  };
  const push = async (t: Delivery) => {
    const plan = await planPush(me, t, sites);
    if ('error' in plan) { showAlert(plan.error); return; }
    if (!(await confirmAsk(`Push this delivery to ${plan.label} (${slotLabel(plan.slot)})?`, 'Yes — push it', 'No'))) return;
    setBusyId(t.id);
    toast(await pushDelivery(me, t, plan, sites));
    setBusyId(null); refresh();
  };

  const collections = tab === 'todo' ? groupCollections(todo, supplierName) : [];
  const slots = DELIVERY_TIME_SLOTS.filter((s) => shown.some((t) => t.time_slot === s.key));

  return (
    <ScrollView contentContainerStyle={page(720)}>
      {preview ? (
        <Card style={{ backgroundColor: base.blueBg }}>
          <Text style={{ fontWeight: '700', color: base.ink }}>👁 Driver view</Text>
          <Muted>{drivers.length ? 'This is what the driver sees: their own deliveries plus any not yet given to a driver. View only.' : 'There are no drivers set up yet, so this shows only deliveries not given to a driver.'}</Muted>
          {drivers.length > 1 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{drivers.map((p) => <Pressable key={p.id} onPress={() => setPick(p.id)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: viewAs === p.id ? base.ink : base.line, backgroundColor: viewAs === p.id ? base.ink : base.card }}><Text style={{ fontWeight: '700', color: viewAs === p.id ? '#fff' : base.ink }}>{p.name}</Text></Pressable>)}</View>}
        </Card>
      ) : onDuty ? (
        <Button kind={brk ? 'primary' : 'ghost'} title={brk ? '▶ End Break' : '☕ Start Break'}
          onPress={async () => { const ok = await driverBreak(me, brk ? 'end' : 'start'); toast(ok ? (brk ? 'Break ended' : 'Break started') : 'Could not save — check your connection and try again.'); void qc.invalidateQueries({ queryKey: ['driverStatus'] }); }} />
      ) : <Muted style={{ textAlign: 'center', marginBottom: 6 }}>☕ Breaks — check in first</Muted>}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 14 }}>
        <Pressable onPress={() => setOffset(offset - 1)} style={navBtn}><Text style={{ fontSize: 20 }}>‹</Text></Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontWeight: '700', fontSize: 15, color: base.ink }}>
          {d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' })}{today ? ' (Today)' : ''}
        </Text>
        <Pressable onPress={() => setOffset(offset + 1)} style={navBtn}><Text style={{ fontSize: 20 }}>›</Text></Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {([['todo', `To do (${todo.length})`], ['done', `✓ Completed (${done.length})`]] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1, paddingVertical: 8, borderRadius: 16, borderWidth: 1, alignItems: 'center', borderColor: tab === k ? base.ink : base.line, backgroundColor: tab === k ? base.ink : base.card }}>
            <Text style={{ fontWeight: '700', color: tab === k ? '#fff' : base.ink }}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading && <Muted>Loading…</Muted>}
      {collections.length > 0 && <SectionTitle>Collections — what to pick up where</SectionTitle>}
      {collections.map((pl) => {
        const isOpen = !!open[pl.key];
        const left = pl.tasks.filter((t) => t.status !== 'completed').length;
        return (
          <View key={pl.key}>
            <Pressable onPress={() => setOpen({ ...open, [pl.key]: !isOpen })} style={collRow}>
              <Text style={{ color: base.slate, marginRight: 6 }}>{isOpen ? '▼' : '▶'}</Text>
              <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>📦 Collect from {pl.label}</Text>
              <Text style={{ fontSize: 12, color: base.slate }}>{pl.tasks.length} job{pl.tasks.length === 1 ? '' : 's'}{left < pl.tasks.length ? ` · ${left} left` : ''}</Text>
            </Pressable>
            {isOpen && (
              <Card>
                {pl.tasks.map((t, i) => (
                  <View key={t.id} style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: base.line, opacity: t.status === 'completed' ? 0.55 : 1 }}>
                    <Text style={{ fontWeight: '700', color: base.ink }}>{t.high_priority ? <Text style={{ color: th.brand1, fontWeight: '800' }}>1st DROP · </Text> : null}{siteHeading(t as Delivery, sites).join('\n')}</Text>
                    {!!(t as Delivery).description && <Text style={{ color: base.ink }}>{(t as Delivery).description}</Text>}
                    <Muted>{slotLabel(t.time_slot)}{t.status === 'completed' ? ' · ✓ Completed' : ''}</Muted>
                  </View>
                ))}
              </Card>
            )}
          </View>
        );
      })}

      {tab === 'done' && !done.length && !isLoading && <Empty>No completed deliveries {today ? 'yet today' : 'on this day'}.</Empty>}
      {tab === 'todo' && !todo.length && !done.length && !isLoading && <Empty>No deliveries booked {today ? 'for today' : 'on this day'}.</Empty>}
      {tab === 'todo' && !todo.length && done.length > 0 && (
        <Card style={{ alignItems: 'center' }}><Text style={{ fontWeight: '700', color: base.ok }}>✓ All done for {today ? 'today' : 'this day'}</Text></Card>
      )}

      {slots.map((slot) => (
        <View key={slot.key}>
          <SectionTitle>{slot.label}</SectionTitle>
          {shown.filter((t) => t.time_slot === slot.key).map((t) => {
            const pm = pmOf(t);
            const contact = t.site_contact_id ? people.find((p) => p.id === t.site_contact_id) : null;
            const cPhotos = completionPhotos(t);
            const busy = busyId === t.id;
            const inSlot = shown.filter((x) => x.time_slot === slot.key).length;
            return (
              <Card key={t.id} style={t.double_slot ? { borderLeftWidth: 4, borderLeftColor: th.brand1 } : undefined}>
                {t.high_priority && (
                  <Text style={{ color: th.brand1, fontWeight: '800', marginBottom: 6 }}>1st DROP{'\n'}<Text style={{ fontWeight: '500', fontSize: 12, color: base.slate }}>This is the first delivery of the day — do this one first.</Text></Text>
                )}
                <Text style={{ fontWeight: '700', color: base.ink, marginBottom: 4 }}>{siteHeading(t, sites).join('\n')}</Text>
                {pm ? (
                  <Text style={{ fontSize: 12.5, color: base.slate }}>{pm.booked ? 'Booked by' : 'PM'}: {pm.name}{pm.phone ? <Text style={{ color: base.blue }} onPress={() => Linking.openURL(`tel:${pm.phone.replace(/[^0-9+]/g, '')}`)}> · {pm.phone}</Text> : null}</Text>
                ) : <Text style={{ fontSize: 12.5, color: base.slate }}>PM: not set</Text>}
                {!!t.description && <Text style={{ color: base.ink, marginTop: 6 }}>{t.description}</Text>}
                <Muted style={{ marginTop: 4 }}>{collectionLine(t, supplierName(t.supplier_id))}</Muted>
                {contact && <Muted>👤 Site contact: {contact.name}{contact.phone ? ` · ${contact.phone}` : ''}</Muted>}
                {!contact && !!t.site_contact_manual && <Muted>👤 Site contact: {t.site_contact_manual}</Muted>}
                <Thumbs paths={deliveryPhotos(t)} />
                {inSlot > 1 && !!t.sub_priority && <Muted>Order within this drop: {t.sub_priority}</Muted>}
                {t.status === 'completed' ? (
                  <>
                    <Text style={{ color: base.ok, marginTop: 8 }}>✓ Completed {t.completed_at ? new Date(t.completed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</Text>
                    {!preview && <Button kind="ghost" title="↩ Re-open delivery" onPress={() => setReopen(t)} />}
                  </>
                ) : preview ? (
                  <>
                    {cPhotos.length > 0 && <Muted style={{ marginTop: 8 }}>Completion photos ({cPhotos.length})</Muted>}
                    <Thumbs paths={cPhotos} />
                  </>
                ) : (
                  <>
                    {cPhotos.length > 0 && <Muted style={{ marginTop: 8 }}>Completion photos ({cPhotos.length})</Muted>}
                    <Thumbs paths={cPhotos} onRemove={async (i) => { await removeCompletionPhoto(t, i); refresh(); }}
                      onMarkup={(i) => void markup.open(cPhotos[i], `${me?.org_id}/delivery/${t.id}`, async (np) => { toast((await replaceCompletionPhoto(t, cPhotos[i], np)) ? 'Photo updated' : 'Could not save — try again.'); refresh(); })} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}><Button kind="ghost" disabled={!!busyId} title={busy ? 'Uploading…' : '📷 Take photo'} onPress={() => addPhotos(t, 'camera')} /></View>
                      <View style={{ flex: 1 }}><Button kind="ghost" disabled={!!busyId} title="🖼 Choose photos" onPress={() => addPhotos(t, 'library')} /></View>
                    </View>
                    <Button disabled={!!busyId || !cPhotos.length} title={cPhotos.length ? '✓ Mark Complete' : 'Add a photo to complete'} onPress={() => complete(t)} />
                    <Button kind="ghost" disabled={busy} title={busy ? 'Moving…' : '⏭ Push to Next Working Day'} onPress={() => push(t)} />
                  </>
                )}
              </Card>
            );
          })}
          {continuations(shown, slot.key).map((t) => (
            <Muted key={`c-${t.id}`}>⤷ {siteHeading(t, sites)[0]} continues from the {slotLabel(t.time_slot)} (2-drop booking)</Muted>
          ))}
        </View>
      ))}

      <ReopenModal task={reopen} onClose={() => setReopen(null)} onDone={async (choice) => {
        if (!reopen) return;
        const r = await reopenDelivery(me, reopen, choice, sites);
        if (!r.ok) { showAlert(r.msg); return; }
        setReopen(null); toast(r.msg); refresh();
      }} />
      {markup.editor}
    </ScrollView>
  );
}

function Thumbs({ paths, onRemove, onMarkup }: { paths: string[]; onRemove?: (i: number) => void; onMarkup?: (i: number) => void }) {
  if (!paths.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 }}>
      {paths.map((p, i) => (
        <View key={p}>
          <Pressable disabled={!onMarkup} onPress={() => onMarkup?.(i)}><StorageImage bucket="site-photos" path={p} style={{ width: 64, height: 64, borderRadius: 8 }} /></Pressable>
          {onMarkup && <Text style={{ position: 'absolute', bottom: 2, left: 4, fontSize: 13 }}>✏️</Text>}
          {onRemove && (
            <Pressable onPress={() => onRemove(i)} hitSlop={8} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: base.red, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>×</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

function ReopenModal({ task, onClose, onDone }: { task: Delivery | null; onClose: () => void; onDone: (c: { date: string; slot: string }) => void }) {
  const todayISO = localISODate(new Date());
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState('');
  if (!task) return null;
  const isPast = task.scheduled_date < todayISO;
  const d = date || (isPast ? todayISO : task.scheduled_date);
  const sl = slot || task.time_slot;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: base.card, borderRadius: radius.card, padding: 16, maxWidth: 460, width: '100%', alignSelf: 'center' }}>
          <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 12 }}>Re-open this delivery</Text>
          <Button title={`Same date & time — ${new Date(`${task.scheduled_date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}, ${slotLabel(task.time_slot)}`}
            onPress={() => onDone({ date: task.scheduled_date, slot: task.time_slot })} />
          {isPast && <Text style={{ color: base.warn, marginTop: 4 }}>That date has already passed.</Text>}
          <Muted style={{ marginTop: 12, fontWeight: '700' }}>Or choose a new date</Muted>
          <TextInput value={d} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCapitalize="none"
            style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, marginVertical: 8, color: base.ink }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {DELIVERY_TIME_SLOTS.map((s) => (
              <Pressable key={s.key} onPress={() => setSlot(s.key)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: sl === s.key ? base.ink : base.line, backgroundColor: sl === s.key ? base.ink : base.card }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: sl === s.key ? '#fff' : base.ink }}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
          <Button title="Re-open on this date" onPress={() => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { showAlert('Choose a date first (YYYY-MM-DD).'); return; }
            onDone({ date: d, slot: sl });
          }} />
          <Button kind="ghost" title="Cancel" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const navBtn = { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: base.line, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: base.card };
const collRow = { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, padding: 12, marginBottom: 8 };
