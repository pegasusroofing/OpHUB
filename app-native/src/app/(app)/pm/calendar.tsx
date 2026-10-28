// Calendar across all projects (790 renderUnifiedCalendar), managers: key dates
// from every job plus upcoming jobs' start dates, optionally the driver's diary.
// Filter by PM and by site; week / 2 weeks / month. Tap an item for its details;
// tap its title to open that job's own calendar.
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { chooseAction } from '@/components/toast';
import { Card, Muted } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { useSites } from '@/data/sites';
import { usePmList } from '@/data/todos';
import { useAuth } from '@/lib/auth';
import { monthGrid } from '@/lib/rules/calendar';
import { siteStatusKey } from '@/lib/rules/checkin';
import { localISODate, slotLabel } from '@/lib/rules/driver';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Ev = { id: string; site_id: string | null; title: string; event_date: string; is_private?: boolean; recurrence_group_id?: string | null; created_by?: string | null; kind: 'event' | 'start' | 'driver'; colour: string; where?: string };
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return localISODate(d); };

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card }}><Text style={{ fontWeight: '700', color: on ? '#fff' : base.ink, fontSize: 12.5 }}>{label}</Text></Pressable>;
}

export default function AllCalendar() {
  const { me } = useAuth();
  const { data: sites } = useSites();
  const { data: pms } = usePmList();
  const { data: people } = usePeople();
  const today = localISODate(new Date());
  const [view, setView] = useState<'week' | 'twoweek' | 'month'>('month');
  const [month, setMonth] = useState(() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() }; });
  const [sel, setSel] = useState(today);
  const [pmF, setPmF] = useState<string[]>([]);
  const [siteF, setSiteF] = useState<string[]>([]);
  const [driver, setDriver] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const grid = monthGrid(month.y, month.m);
  const days = view === 'month' ? [sel] : Array.from({ length: view === 'week' ? 7 : 14 }, (_, i) => addDays(today, i));
  const from = view === 'month' ? grid[0] : today;
  const to = view === 'month' ? grid[grid.length - 1] : days[days.length - 1];
  const { data: raw } = useQuery({
    queryKey: ['allCalendar', from, to, driver, me?.org_id],
    enabled: !!me,
    queryFn: async () => {
      const [e, d] = await Promise.all([
        db.from('site_calendar_events').select('*').gte('event_date', from).lte('event_date', to).order('event_date').order('created_at'),
        driver ? db.from('delivery_tasks').select('id,site_id,manual_site_name,description,scheduled_date,time_slot,status').eq('org_id', me?.org_id as string).gte('scheduled_date', from).lte('scheduled_date', to) : Promise.resolve({ data: [] }),
      ]);
      return { events: (e.data as Omit<Ev, 'kind' | 'colour'>[] | null) ?? [], driver: (d.data as { id: string; site_id: string | null; manual_site_name: string | null; description: string | null; scheduled_date: string; time_slot: string; status: string }[] | null) ?? [] };
    },
  });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const byId = Object.fromEntries((sites ?? []).map((s) => [s.id, s]));
  const all: Ev[] = [
    ...(raw?.events ?? []).map((e) => ({ ...e, kind: 'event' as const, colour: e.is_private ? base.slate : base.red })),
    ...(sites ?? []).filter((s) => siteStatusKey(s) === 'upcoming' && s.start_date && s.start_date >= from && s.start_date <= to)
      .map((s) => ({ id: `start-${s.id}`, site_id: s.id, title: `🚧 Project start: ${s.name}`, event_date: s.start_date as string, kind: 'start' as const, colour: '#1E9E5A' })),
    ...(raw?.driver ?? []).filter((t) => t.status !== 'cancelled').map((t) => ({ id: `drv-${t.id}`, site_id: t.site_id, title: `🚚 ${slotLabel(t.time_slot)} · ${t.description || 'Delivery'}`, event_date: t.scheduled_date, kind: 'driver' as const, colour: '#6B4FD8', where: t.site_id ? undefined : t.manual_site_name || '' })),
  ].filter((e) => {
    const s = e.site_id ? byId[e.site_id] : undefined;
    if (e.kind === 'driver' && !s) return !pmF.length && !siteF.length;
    if (!s) return false;
    if (pmF.length && !pmF.includes(s.responsible_pm_id || '')) return false;
    if (siteF.length && !siteF.includes(s.id)) return false;
    return true;
  });
  const byDate: Record<string, Ev[]> = {};
  all.forEach((e) => { (byDate[e.event_date] ||= []).push(e); });
  const pickMany = async (title: string, opts: { id: string; name: string }[], cur: string[], set: (v: string[]) => void) => {
    const k = await chooseAction(title, [{ key: '__clear', label: 'Clear filter' }, ...opts.map((o) => ({ key: o.id, label: `${cur.includes(o.id) ? '☑' : '☐'} ${o.name}` }))]);
    if (k === '__clear') set([]); else if (k) set(cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Calendar' }} />
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <Chip on={!!pmF.length} label={pmF.length ? (pmF.length === 1 ? nameOf(people, pmF[0]) : `${pmF.length} PMs`) : 'Filter by PM'} onPress={() => void pickMany('Filter by PM', pms ?? [], pmF, setPmF)} />
        <Chip on={!!siteF.length} label={siteF.length ? `${siteF.length} sites` : 'Filter by site'} onPress={() => void pickMany('Filter by site', sites ?? [], siteF, setSiteF)} />
        <Chip on={driver} label="🚚 Driver diary" onPress={() => setDriver(!driver)} />
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
        <Chip on={view === 'week'} label="1 week" onPress={() => setView('week')} />
        <Chip on={view === 'twoweek'} label="2 weeks" onPress={() => setView('twoweek')} />
        <Chip on={view === 'month'} label="Month" onPress={() => setView('month')} />
      </View>
      {view === 'month' ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Pressable hitSlop={10} onPress={() => setMonth(month.m === 0 ? { y: month.y - 1, m: 11 } : { y: month.y, m: month.m - 1 })}><Text style={{ fontSize: 20, paddingHorizontal: 10 }}>‹</Text></Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontWeight: '800', color: base.ink }}>{new Date(month.y, month.m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Text>
            <Pressable hitSlop={10} onPress={() => setMonth(month.m === 11 ? { y: month.y + 1, m: 0 } : { y: month.y, m: month.m + 1 })}><Text style={{ fontSize: 20, paddingHorizontal: 10 }}>›</Text></Pressable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {grid.map((ds) => {
              const d = new Date(`${ds}T00:00:00`);
              return (
                <Pressable key={ds} onPress={() => setSel(ds)} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 6 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: sel === ds ? base.ink : 'transparent', borderWidth: ds === today ? 2 : 0, borderColor: base.red }}>
                    <Text style={{ color: sel === ds ? '#fff' : d.getMonth() === month.m ? base.ink : base.line, fontWeight: '700' }}>{d.getDate()}</Text>
                  </View>
                  <Text style={{ fontSize: 8, color: byDate[ds]?.length ? base.red : 'transparent' }}>●</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      ) : <Muted style={{ marginBottom: 8 }}>Next {days.length} days across every site — tap an item for details.</Muted>}
      {days.map((ds) => {
        const d = new Date(`${ds}T00:00:00`);
        const list = byDate[ds] ?? [];
        return (
          <View key={ds} style={{ flexDirection: 'row', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: base.line }}>
            <View style={{ width: 52, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: d.getDay() % 6 === 0 ? base.red : base.slate }}>{d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: base.ink }}>{d.getDate()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              {list.length ? list.map((e) => {
                const s = e.site_id ? byId[e.site_id] : undefined;
                if (openId === e.id && e.kind === 'event') {
                  return (
                    <Card key={e.id}>
                      <Pressable onPress={() => e.site_id && router.push(`/sites/${e.site_id}/calendar` as never)}><Text style={{ fontWeight: '800', color: base.blue }}>{e.is_private ? '🔒 ' : ''}{e.recurrence_group_id ? '🔁 ' : ''}{e.title} ›</Text></Pressable>
                      <Muted>Project: {s?.name ?? 'Unknown site'}</Muted>
                      <Muted>Date: {d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Muted>
                      {e.is_private && <Muted>Visibility: Private — PMs/admins only</Muted>}
                      {!!e.created_by && <Muted>Added by {nameOf(people, e.created_by)}</Muted>}
                      <Pressable onPress={() => setOpenId(null)}><Text style={{ color: base.slate, marginTop: 6 }}>Close</Text></Pressable>
                    </Card>
                  );
                }
                return (
                  <Pressable key={e.id} onPress={() => (e.kind === 'event' ? setOpenId(e.id) : e.kind === 'start' && e.site_id ? router.push(`/sites/${e.site_id}`) : undefined)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, borderRadius: radius.row }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: e.colour }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600', color: e.is_private ? base.slate : base.ink }}>{e.is_private ? '🔒 ' : ''}{e.title}</Text>
                      <Muted>{e.where ?? s?.name ?? ''}</Muted>
                    </View>
                  </Pressable>
                );
              }) : <Text style={{ color: base.line }}>—</Text>}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
