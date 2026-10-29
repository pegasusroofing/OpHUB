// Delivery Schedule, office side (870 renderDeliverySchedulePM): one day at a
// time, drop by drop. "To schedule" lists waste / leftovers flagged on site.
// ▲▼ reorder within a drop and hop into the next free drop at the ends, ⇄ move
// straight to any drop (the current app's drag and drop); push a
// delivery to the next working day; tap one to edit. Driver hours underneath.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { HowTo } from '@/components/HowTo';
import { dismissRequest, moveDelivery, moveToSlot, useDeliveryRequests, useDriverHours, useScheduleDay, useStaff, type FullDelivery } from '@/data/deliveries';
import { planPush, pushDelivery, siteHeading } from '@/data/driver';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { exportDeliverySchedule } from '@/lib/deliveryExport';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { blockedSlots, bySlotOrder, collectionLine, dayTotals, DELIVERY_TIME_SLOTS, fullSlots, localISODate, minsLabel, slotLabel } from '@/lib/rules/driver';
import { readIsoDate } from '@/lib/rules/materials';
import { isManager } from '@/lib/roles';
import { base, page, radius, space, useTheme } from '@/theme/theme';

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return localISODate(d); };

export default function DeliverySchedule() {
  const { me, org } = useAuth();
  const th = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const today = localISODate(new Date());
  const [iso, setIso] = useState(today);
  const [jump, setJump] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [week, setWeek] = useState(0);
  const { data: sites = [] } = useSites();
  const { data: people = [] } = useStaff();
  const { data, refetch, isRefetching } = useScheduleDay(me?.org_id, iso);
  const { data: reqs = [] } = useDeliveryRequests(me?.org_id);
  const hours = useDriverHours(me?.org_id, week, hoursOpen);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const tasks = data?.tasks ?? [];
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['scheduleDay'] }); void qc.invalidateQueries({ queryKey: ['deliveryRequests'] }); };
  const blocked = blockedSlots(tasks), full = fullSlots(tasks);
  const name = (id: string | null | undefined) => people.find((p) => p.id === id)?.name || '';
  const day = new Date(`${iso}T12:00:00`);
  const dayLabel = day.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' }) + (iso === today ? ' (Today)' : day.getFullYear() !== new Date().getFullYear() ? ` ${day.getFullYear()}` : '');
  const add = (slot?: string) => router.push(`/pm/delivery/new?date=${iso}${slot ? `&slot=${slot}` : ''}` as never);
  const place = (t: FullDelivery) => siteHeading(t, sites)[0];
  const jobPm = (t: FullDelivery) => { const s = t.site_id ? sites.find((x) => x.id === t.site_id) : null; const p = s?.responsible_pm_id ? people.find((x) => x.id === s.responsible_pm_id) : null; return p ? `PM: ${p.name}${p.phone ? ` · ${p.phone}` : ''}` : ''; };

  const move = async (t: FullDelivery, dir: 'up' | 'down') => {
    setBusy(t.id);
    const why = await moveDelivery(me, t, dir, sites);
    setBusy(null);
    if (why) { if (why.startsWith('Already')) toast(why); else showAlert(why); }
    refresh();
  };
  const push = async (t: FullDelivery) => {
    setBusy(t.id);
    const plan = await planPush(me, t, sites);
    if ('error' in plan) { setBusy(null); showAlert(plan.error); return; }
    const msg = await pushDelivery(me, t, plan, sites);
    setBusy(null); toast(msg); refresh();
  };
  const drivers = people.filter((p) => p.role === 'driver');

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />}>
      <Stack.Screen options={{ title: 'Delivery Schedule' }} />
      <HowTo k="delivery" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Pressable onPress={() => setIso(addDays(iso, -1))} style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: th.brand1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: th.brand1Text, fontSize: 30, fontWeight: '800' }}>‹</Text></Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontWeight: '700', fontSize: 15, color: base.ink }} numberOfLines={1}>{dayLabel} <Text style={{ color: base.slate, fontWeight: '400' }}>({tasks.length})</Text></Text>
        <Pressable onPress={() => setIso(addDays(iso, 1))} style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: th.brand1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: th.brand1Text, fontSize: 30, fontWeight: '800' }}>›</Text></Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: base.ink }}>JUMP TO</Text>
        <TextInput value={jump} onChangeText={setJump} placeholder="YYYY-MM-DD" autoCapitalize="none" onSubmitEditing={() => { const d = readIsoDate(jump); if (d && d !== 'bad') { setIso(d); setJump(''); } else toast('Enter the date as YYYY-MM-DD.'); }}
          style={{ flex: 1, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card }} />
        {iso !== today && <Pressable onPress={() => setIso(today)} style={{ padding: 10 }}><Text style={{ color: base.blue, fontWeight: '700' }}>Today</Text></Pressable>}
      </View>

      {reqs.length > 0 && (
        <Card>
          <Text style={{ fontWeight: '800', color: base.ink }}>📥 To schedule ({reqs.length})</Text>
          <Muted style={{ marginBottom: 8 }}>Waste and leftover material flagged on site — book a collection for each.</Muted>
          {reqs.map((r) => {
            const s = sites.find((x) => x.id === r.site_id);
            return (
              <View key={r.id} style={{ borderTopWidth: 1, borderTopColor: base.line, paddingTop: 8, marginTop: 8 }}>
                <Text style={{ fontWeight: '800', color: base.ink }}>{r.waste ? '🗑 ' : ''}{r.leftover ? '📦 ' : ''}{s?.name || 'Project'}</Text>
                {!!s && !!fullSiteAddress(s) && <Muted>{fullSiteAddress(s)}</Muted>}
                <Text style={{ color: base.ink }}>{r.description}</Text>
                <Muted>{r.flagged_by ? `Flagged by ${name(r.flagged_by)} · ` : ''}{new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Muted>
                {!!r.photo_paths?.length && <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>{r.photo_paths.map((p) => <StorageImage key={p} bucket="site-photos" path={p} style={{ width: 54, height: 54, borderRadius: 8 }} />)}</View>}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <View style={{ flex: 1 }}><Button title="Schedule" onPress={() => router.push(`/pm/delivery/new?date=${iso}&req=${r.id}` as never)} /></View>
                  <View style={{ flex: 1 }}><Button kind="ghost" title="Dismiss" onPress={async () => {
                    if (!(await confirmAsk('Remove this from the "To schedule" list without booking it?', 'Remove'))) return;
                    if (await dismissRequest(r.id)) { toast('Removed'); refresh(); } else toast('Could not save — try again.');
                  }} /></View>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      <Button title="+ Add Delivery" onPress={() => add()} />
      <View style={{ marginTop: 8 }}><Button kind="ghost" title="👁 Driver view" onPress={() => router.push(`/driver/schedule?preview=1&date=${iso}` as never)} /></View>
      <Text style={{ textAlign: 'center', fontSize: 10.5, fontStyle: 'italic', color: base.slateLight, marginTop: 4, marginBottom: 8 }}>Tip: tap ⇄ on a delivery to move it to another drop.</Text>
      {DELIVERY_TIME_SLOTS.map((slot) => {
        const list = tasks.filter((t) => t.time_slot === slot.key).sort(bySlotOrder);
        const carry = blocked[slot.key];
        return (
          <View key={slot.key}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}><SectionTitle>{slot.label}</SectionTitle></View>
              {!full[slot.key] && <Pressable hitSlop={8} onPress={() => add(slot.key)} style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: base.line, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}><Text style={{ fontWeight: '800', fontSize: 16, color: base.ink }}>+</Text></Pressable>}
            </View>
            {!!carry && <Muted style={{ marginBottom: 6 }}>⏱ Taken — {place(carry)} needs extra time (carries on from the {slotLabel(carry.time_slot)})</Muted>}
            {list.length ? list.map((t) => (
              <View key={t.id} style={{ flexDirection: 'row', gap: 8, padding: 12, borderWidth: 1, borderColor: t.double_slot ? base.blue : base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card, opacity: t.status === 'completed' ? 0.6 : 1 }}>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(`/pm/delivery/${t.id}` as never)}>
                  <Text style={{ fontWeight: '700', color: base.ink }}>
                    {t.high_priority ? <Text style={{ color: base.red, fontWeight: '800' }}>1st DROP · </Text> : null}
                    {place(t)}{!t.site_id ? ' (not on app)' : ''}{list.length > 1 ? ` (order ${t.sub_priority || '?'})` : ''}
                    {t.needs_completing ? <Text style={{ color: base.warn }}> ⚠ Needs completing</Text> : null}
                    {t.double_slot ? <Text style={{ color: base.blue }}> · 2 drops</Text> : null}
                  </Text>
                  {!!t.sub_site_label && <Muted>{t.sub_site_label}</Muted>}
                  {!!jobPm(t) && <Muted>{jobPm(t)}</Muted>}
                  <Muted>{t.description || ''}{t.status === 'completed' ? ' · ✓ Completed' : ''}</Muted>
                  <Text style={{ fontWeight: '700', color: base.ink, fontSize: 12.5 }}>{collectionLine(t, t.supplier_id ? data?.suppliers[t.supplier_id] : undefined)}</Text>
                  <Text style={{ fontSize: 12.5, color: t.driver_id ? base.slate : base.warn }}>🚐 {t.driver_id ? name(t.driver_id) || 'Driver' : 'Unassigned'}</Text>
                  {t.status !== 'completed' && (
                    <Pressable disabled={busy === t.id} onPress={() => void push(t)} style={{ alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: base.line }}>
                      <Text style={{ fontSize: 11, color: base.ink }}>{busy === t.id ? 'Moving…' : '⏭ Push to next day'}</Text>
                    </Pressable>
                  )}
                </Pressable>
                <View style={{ gap: 4 }}>
                  <Pressable disabled={busy === t.id} onPress={() => void move(t, 'up')} style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: base.line, alignItems: 'center', justifyContent: 'center' }}><Text>▲</Text></Pressable>
                  <Pressable disabled={busy === t.id} onPress={() => void move(t, 'down')} style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: base.line, alignItems: 'center', justifyContent: 'center' }}><Text>▼</Text></Pressable>
                  <Pressable disabled={busy === t.id} accessibilityLabel="Move to another drop" onPress={async () => {
                    const k = await chooseAction('Move to which drop?', DELIVERY_TIME_SLOTS.filter((s) => s.key !== t.time_slot).map((s) => ({ key: s.key, label: s.label })));
                    if (!k) return;
                    if (t.high_priority && k !== DELIVERY_TIME_SLOTS[0].key && !(await confirmAsk('This is the 1st DROP. Moving it to a later drop takes the 1st DROP off it — carry on?', 'Yes — move it', 'No'))) return;
                    setBusy(t.id); const why = await moveToSlot(me, t, k, sites); setBusy(null);
                    if (why) showAlert(why); else toast(`Moved to the ${slotLabel(k)}`);
                    refresh();
                  }} style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: base.line, alignItems: 'center', justifyContent: 'center' }}><Text>⇄</Text></Pressable>
                </View>
              </View>
            )) : !carry ? <Text style={{ textAlign: 'center', color: base.slateLight, fontSize: 12.5, paddingVertical: 22 }}>Nothing in this drop.</Text> : null}
          </View>
        );
      })}

      <Pressable onPress={() => setHoursOpen(!hoursOpen)} style={{ marginTop: 18, padding: 14, borderWidth: 1, borderColor: base.cardLine, borderRadius: 16, backgroundColor: base.card, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: base.ink }}>🕒 Driver hours</Text>
          <Muted>Each driver&apos;s hours for the week, breaks taken off</Muted>
        </View>
        <Text style={{ color: base.slate }}>{hoursOpen ? '▾' : '▸'}</Text>
      </Pressable>
      {hoursOpen && (
        <Card style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
            {[[0, 'This week'], [-1, 'Last week']].map(([n, l]) => (
              <Pressable key={n} onPress={() => setWeek(n as number)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: week === n ? base.ink : base.line, backgroundColor: week === n ? base.ink : base.card }}>
                <Text style={{ fontWeight: '700', color: week === n ? '#fff' : base.ink }}>{l}</Text>
              </Pressable>
            ))}
          </View>
          {!hours.data ? <Muted>Loading…</Muted> : drivers.length ? (
            <ScrollView horizontal>
              <View>
                <View style={{ flexDirection: 'row' }}>
                  <Text style={{ width: 110 }} />
                  {hours.data.days.map((k) => <Text key={k} style={{ width: 64, fontSize: 11, fontWeight: '700', color: base.slate }}>{new Date(`${k}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</Text>)}
                  <Text style={{ width: 70, fontSize: 11, fontWeight: '800', color: base.ink }}>Total</Text>
                </View>
                {drivers.map((dv) => {
                  const c = hours.data.checks.filter((x) => x.user_id === dv.id), b = hours.data.breaks.filter((x) => x.user_id === dv.id);
                  let tot = 0;
                  const cells = hours.data.days.map((k) => { const t = dayTotals(c, b, k); const w = Math.max(0, t.duty - t.brk); tot += w; return w; });
                  return (
                    <View key={dv.id} style={{ flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1, borderTopColor: base.line }}>
                      <Text style={{ width: 110, fontWeight: '700', color: base.ink }} numberOfLines={1}>{dv.name}</Text>
                      {cells.map((w, i) => <Text key={i} style={{ width: 64, fontSize: 12, color: base.ink }}>{w ? minsLabel(w) : '—'}</Text>)}
                      <Text style={{ width: 70, fontSize: 12, fontWeight: '800', color: base.ink }}>{tot ? minsLabel(tot) : '—'}</Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          ) : <Empty>No drivers set up.</Empty>}
          <Muted style={{ marginTop: 8 }}>Check-in to check-out, with breaks taken off.</Muted>
        </Card>
      )}
      <Card style={{ marginTop: space.m }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {([['x', '📊 Export Excel'], ['p', '📄 Export PDF']] as const).map(([k, l]) => <Button key={k} kind="ghost" title={busy === `exp${k}` ? 'Building…' : l} onPress={async () => { setBusy(`exp${k}`); const why = await exportDeliverySchedule(k, me.org_id as string, Array.from({ length: 7 }, (_, i) => addDays(iso, i)), sites, people, org); setBusy(null); if (why) toast(why); }} />)}
        </View>
        <Button kind="ghost" title="🚐 Vehicle health checks" onPress={() => router.push('/pm/vehicles' as never)} />
        <Muted>Exports cover 7 days from the day shown.</Muted>
      </Card>
    </ScrollView>
  );
}
