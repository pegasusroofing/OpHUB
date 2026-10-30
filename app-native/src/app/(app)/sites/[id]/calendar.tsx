// The job calendar (780). Managers default to the month grid (tap a day to see its
// dates), others to the next 2 weeks; a 1-week view too. Anyone on the job can add
// a plain key date; managers also get private, repeating, email reminders, edit,
// delete (one date or the rest of a series) and "Also Add to Delivery Schedule".
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { CalTools, MonthGrid, type GridItem } from '@/components/MonthGrid';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Check, Muted } from '@/components/ui';
import { DateBox } from '@/components/DateField';
import { addEvent, addToDeliverySchedule, deleteEvent, saveEvent, useCalendar, useRecipients, type CalEvent, type CalLine, type Draft } from '@/data/calendar';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { heading } from '@/lib/fonts';
import { deliverFile, exportFilename } from '@/lib/pdf';
import { monthGrid, ordinal, REPEAT_LABEL, type Repeat } from '@/lib/rules/calendar';
import { localISODate } from '@/lib/rules/driver';
import { readIsoDate } from '@/lib/rules/materials';
import { buildIcs } from '@/lib/rules/ics';
import { isFinanceUser, isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space, useTheme } from '@/theme/theme';

type View_ = 'week' | 'twoweek' | 'month';
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
const blank = (date: string): Draft => ({ title: '', date, private: false, remind: false, timing: 'day_before', custom: '', recipients: [], repeat: 'none' });
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return localISODate(d); };

export default function SiteCalendar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const th = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const mgr = !!me && isManager(me);
  const today = localISODate(new Date());
  const [view, setView] = useState<View_>(mgr ? 'month' : 'twoweek');
  const [month, setMonth] = useState(() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() }; });
  const [sel, setSel] = useState(today);
  const grid = monthGrid(month.y, month.m);
  const days = view === 'month' ? [sel] : Array.from({ length: view === 'week' ? 7 : 14 }, (_, i) => addDays(today, i));
  const from = view === 'month' ? grid[0] : today;
  const to = view === 'month' ? grid[grid.length - 1] : days[days.length - 1];
  const { data: byDate } = useCalendar(id, from, to, !!me && (['pm', 'admin'].includes(me.role) || isFinanceUser(me, org)));
  const { data: recipients } = useRecipients(id, mgr);
  const [form, setForm] = useState<{ at: string; editId: string | null; d: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['calendar', id] });

  const submit = async () => {
    if (!form) return;
    const d = form.d;
    if (!d.title.trim()) { toast('Enter what this date is for.'); return; }
    const date = readIsoDate(d.date);
    if (!date || date === 'bad') { toast('Pick a date.'); return; }
    if (mgr && d.remind && d.timing === 'custom' && readIsoDate(d.custom) === 'bad') { toast('Pick a reminder date.'); return; }
    if (mgr && d.remind && d.timing === 'custom' && !d.custom.trim()) { toast('Pick a custom reminder date.'); return; }
    setBusy(true);
    const clean = { ...d, title: d.title.trim(), date };
    const msg = form.editId ? ((await saveEvent(form.editId, clean)) ? 'Updated' : null) : await addEvent(me, site, clean, mgr);
    setBusy(false);
    if (!msg) { toast('Could not save — try again.'); return; }
    toast(msg); setForm(null); refresh();
  };

  const editor = (at: string) => form && form.at === at && (
    <Card style={{ marginTop: 6, borderColor: base.ink, borderWidth: 1.5 }}>
      <Muted style={{ fontWeight: '700' }}>What&apos;s happening</Muted>
      <TextInput value={form.d.title} onChangeText={(t) => setForm({ ...form, d: { ...form.d, title: t } })} placeholder="e.g. Scaffold delivery" style={box} />
      <Muted style={{ fontWeight: '700' }}>Date</Muted>
      <DateBox value={form.d.date} onChange={(t) => setForm({ ...form, d: { ...form.d, date: t } })} clearable={false} title="Date" style={{ marginBottom: 8 }} />
      {mgr && !form.editId && (
        <>
          <Muted style={{ fontWeight: '700' }}>Repeats</Muted>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => <Chip key={r} on={form.d.repeat === r} label={REPEAT_LABEL[r]} onPress={() => setForm({ ...form, d: { ...form.d, repeat: r } })} />)}
          </View>
          {form.d.repeat !== 'none' && <Muted style={{ marginBottom: 8 }}>Creates this key date on a repeating basis (up to a year ahead) and stops automatically once the site is closed.</Muted>}
        </>
      )}
      {mgr ? <Check label="Private — only PMs/admins can see this" value={form.d.private} onChange={(v) => setForm({ ...form, d: { ...form.d, private: v } })} />
        : <Muted style={{ marginBottom: 8 }}>A PM/admin can open it afterwards to make it private, repeat it or add a reminder.</Muted>}
      {mgr && !!recipients?.length && (
        <>
          <Check label="Email a reminder" value={form.d.remind} onChange={(v) => setForm({ ...form, d: { ...form.d, remind: v } })} />
          {form.d.remind && (
            <View>
              <Muted style={{ fontWeight: '700' }}>Send the reminder</Muted>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                {([['day_before', 'Day before'], ['day_of', 'Day of'], ['custom', 'Custom date']] as const).map(([k, l]) => <Chip key={k} on={form.d.timing === k} label={l} onPress={() => setForm({ ...form, d: { ...form.d, timing: k } })} />)}
              </View>
              {form.d.timing === 'custom' && <DateBox value={form.d.custom} onChange={(t) => setForm({ ...form, d: { ...form.d, custom: t } })} placeholder="Reminder date" title="Reminder date" style={{ marginBottom: 8 }} />}
              <Muted style={{ fontWeight: '700' }}>Send it to</Muted>
              {recipients.map((p) => {
                const on = form.d.recipients.includes(p.id);
                return (
                  <Pressable key={p.id} onPress={() => setForm({ ...form, d: { ...form.d, recipients: on ? form.d.recipients.filter((x) => x !== p.id) : [...form.d.recipients, p.id] } })}>
                    <Text style={{ paddingVertical: 4, color: base.ink }}>{on ? '☑' : '☐'} {p.name}{p.role !== 'operative' ? <Text style={{ color: base.slate }}> ({p.role === 'pm' ? 'PM' : p.role === 'site_manager' ? 'Site Manager' : p.role})</Text> : null}</Text>
                  </Pressable>
                );
              })}
              <Muted style={{ marginVertical: 6 }}>You&apos;ll be copied on the reminder too, as the person who created it.</Muted>
            </View>
          )}
        </>
      )}
      <Button busy={busy} title={form.editId ? 'Save' : 'Add Key Date'} onPress={() => void submit()} />
      <Button kind="ghost" title="Cancel" onPress={() => setForm(null)} />
      {mgr && !form.editId && <Button kind="ghost" title="🚚 Also Add to Delivery Schedule" onPress={async () => {
        const date = readIsoDate(form.d.date);
        if (!form.d.title.trim()) { toast('Enter what this date is for first.'); return; }
        if (!date || date === 'bad') { toast('Pick a date first.'); return; }
        const added = await addToDeliverySchedule(me, id, form.d.title.trim(), date);
        if (added.error) { toast(added.error); return; }
        toast('Added to Delivery Schedule — fill in collection details, which drop and site contact.');
        router.push(`/pm/delivery/${added.id}` as never);
      }} />}
    </Card>
  );

  const line = (l: CalLine) => (
    <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 }}>
      <Text style={{ flex: 1, color: l.kind === 'app' ? l.colour : l.kind === 'delivery' ? base.blue : l.kind === 'leave' ? '#7B3FB5' : l.kind === 'event' && l.is_private ? base.slate : base.ink, fontStyle: l.kind === 'leave' ? 'italic' : 'normal' }}>
        {l.kind === 'leave' ? '🏖 ' : ''}{l.kind === 'event' && l.is_private ? '🔒 ' : ''}{l.kind === 'event' && l.recurrence_group_id ? '🔁 ' : ''}{l.title}
      </Text>
      {mgr && l.kind === 'event' && (
        <Pressable hitSlop={6} onPress={async () => {
          const e = l as CalEvent;
          const k = await chooseAction(e.title, [{ key: 'edit', label: '✎ Edit' }, { key: 'del', label: '🗑 Delete', danger: true }]);
          if (k === 'edit') setForm({ at: e.event_date, editId: e.id, d: { title: e.title, date: e.event_date, private: e.is_private, remind: !!e.reminder_recipient_ids?.length, timing: e.reminder_timing || 'day_before', custom: e.reminder_timing === 'custom' ? e.reminder_date || '' : '', recipients: e.reminder_recipient_ids || [], repeat: 'none' } });
          else if (k === 'del') {
            let whole = false;
            if (e.recurrence_group_id) {
              const c = await chooseAction('This is part of a repeating series.', [{ key: 'all', label: 'Delete this and all future', danger: true }, { key: 'one', label: 'Delete this date only' }]);
              if (!c) return; whole = c === 'all';
            } else if (!(await confirmAsk("Delete this key date? This can't be undone.", 'Delete'))) return;
            if (await deleteEvent(me, id, e, whole)) { toast(whole ? 'Series deleted' : 'Deleted'); refresh(); } else toast('Could not delete — try again.');
          }
        }}><Text style={{ color: base.slate, fontSize: 16, paddingHorizontal: 4 }}>⋮</Text></Pressable>
      )}
    </View>
  );

  const phoneCal = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const evs = ((await supabase.from('site_calendar_events').select('id,title,event_date').eq('site_id', id).gte('event_date', today).order('event_date')).data ?? []) as { id: string; title: string | null; event_date: string }[];
      if (!evs.length) { toast('No upcoming key dates to export.'); return; }
      const ok = await deliverFile(new TextEncoder().encode(buildIcs(evs, site?.name || '')), exportFilename(site?.name || '', 'Key Dates', 'ics'), 'text/calendar', 'com.apple.ical.ics');
      toast(ok ? 'Calendar file ready — open it to add these to your phone calendar' : 'Could not build the calendar file — please try again.');
  };
  const gridItems: Record<string, GridItem[]> = {};
  Object.entries(byDate ?? {}).forEach(([ds, list]) => { gridItems[ds] = list.map((l) => ({ id: l.id, title: l.title, colour: l.kind === 'app' ? l.colour || '#B45309' : l.kind === 'delivery' ? '#1F5FA6' : l.kind === 'leave' ? '#7B3FB5' : l.kind === 'event' && l.is_private ? base.slateLight : th.brand1 })); });
  const anchorMonth = new Date().getMonth();
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Calendar' }} />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 }}>
        <CalTools view={view} onView={setView} label="Options" extra={[
          { key: 'add', label: '＋ Add a key date', run: () => setForm({ at: 'top', editId: null, d: blank(view === 'month' && sel >= today ? sel : today) }) },
          { key: 'ics', label: '📅 Add to phone calendar', run: () => void phoneCal() },
        ]} />
      </View>
      {editor('top')}

      {view === 'month' ? (
        <>
          <MonthGrid year={month.y} month={month.m} sel={sel} today={today} items={gridItems} onSelect={setSel}
            onShift={(n) => { const m = new Date(month.y, month.m + n, 1); setMonth({ y: m.getFullYear(), m: m.getMonth() }); const now = new Date(); setSel(m.getFullYear() === now.getFullYear() && m.getMonth() === now.getMonth() ? today : localISODate(m)); }}
            onToday={() => { const n = new Date(); setMonth({ y: n.getFullYear(), m: n.getMonth() }); setSel(today); }} />
          <Text style={[heading(800), { fontSize: 17, color: base.ink, marginTop: 10, marginBottom: 2 }]}>{new Date(`${sel}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}{(byDate?.[sel] ?? []).length ? ` · ${(byDate?.[sel] ?? []).length} booked` : ''}</Text>
        </>
      ) : <Muted style={{ marginBottom: 8 }}>Next {days.length} days{mgr ? ' — 🔒 items are only seen by PMs/admins' : ''}.</Muted>}

      {days.map((ds) => {
        const d = new Date(`${ds}T00:00:00`);
        const list = byDate?.[ds] ?? [];
        const weekend = d.getDay() === 0 || d.getDay() === 6;
        return (
          <View key={ds} style={{ borderBottomWidth: 1, borderBottomColor: base.line, paddingVertical: 8 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 64, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: weekend ? base.red : base.slate }}>{d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}</Text>
                <Text style={{ fontWeight: '800', color: base.ink, borderWidth: ds === today ? 2 : 0, borderColor: th.brand1, borderRadius: 12, paddingHorizontal: 5 }}>
                  {d.getDate()}{ordinal(d.getDate())}{d.getMonth() !== anchorMonth ? ` ${d.toLocaleDateString('en-GB', { month: 'short' })}` : ''}
                </Text>
              </View>
              <View style={{ flex: 1 }}>{list.length ? list.map(line) : <Text style={{ color: base.line }}>{view === 'month' ? 'Nothing booked — tap + to add' : '—'}</Text>}</View>
              <Pressable hitSlop={8} onPress={() => setForm(form?.at === ds && !form.editId ? null : { at: ds, editId: null, d: blank(ds) })}>
                <Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 6 }}>{form?.at === ds && !form.editId ? '−' : '+'}</Text>
              </Pressable>
            </View>
            {editor(ds)}
          </View>
        );
      })}
    </ScrollView>
  );
}

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card }}>
      <Text style={{ fontWeight: '700', color: on ? '#fff' : base.ink }}>{label}</Text>
    </Pressable>
  );
}
