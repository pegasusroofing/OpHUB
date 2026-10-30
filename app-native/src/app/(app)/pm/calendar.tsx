// Calendar (790 renderUnifiedCalendar): every project's key dates in one place
// for PMs and admins, with upcoming project starts, application dates (9219zp),
// supplier deliveries (9219zr) and, if switched on, the driver diary. Filter by
// PM or site. Month view is the grid (on a computer, the chosen day's items sit
// beside it); Week / 2 Weeks list the days from today.
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { CalTools, MonthGrid, type CalView, type GridItem } from '@/components/MonthGrid';
import { chooseAction } from '@/components/toast';
import { Card, Muted } from '@/components/ui';
import { HowTo } from '@/components/HowTo';
import { appDateLines, deliveryDateLines } from '@/data/calendar';
import { nameOf, usePeople } from '@/data/hs';
import { useSites } from '@/data/sites';
import { usePmList } from '@/data/todos';
import { useAuth } from '@/lib/auth';
import { heading } from '@/lib/fonts';
import { monthGrid } from '@/lib/rules/calendar';
import { siteStatusKey } from '@/lib/rules/checkin';
import { localISODate, slotLabel } from '@/lib/rules/driver';
import { isFinanceUser, isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space, useDesk, useTheme } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Ev = { id: string; site_id: string | null; title: string; event_date: string; is_private?: boolean; recurrence_group_id?: string | null; created_by?: string | null; kind: 'event' | 'start' | 'driver' | 'app' | 'delivery'; colour: string; where?: string };
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return localISODate(d); };

/** The small uppercase filter buttons (Filter by PM ▼ …). */
function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: base.line, backgroundColor: on ? t.brand1 : '#fff' }}>
      <Text style={{ fontWeight: '700', color: on ? t.brand1Text : base.slate, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</Text>
    </Pressable>
  );
}

export default function AllCalendar() {
  const { me, org } = useAuth();
  const t = useTheme();
  const desk = useDesk();
  const { data: sites } = useSites();
  const { data: pms } = usePmList();
  const { data: people } = usePeople();
  const today = localISODate(new Date());
  const [view, setView] = useState<CalView>('month');
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [sel, setSel] = useState(today);
  const [pmF, setPmF] = useState<string[]>([]);
  const [siteF, setSiteF] = useState<string[]>([]);
  const [driver, setDriver] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const grid = monthGrid(month.y, month.m);
  const days = view === 'month' ? [sel] : Array.from({ length: view === 'week' ? 7 : 14 }, (_, i) => addDays(today, i));
  const from = view === 'month' ? grid[0] : today;
  const to = view === 'month' ? grid[grid.length - 1] : days[days.length - 1];
  const appsOk = !!me && (['pm', 'admin'].includes(me.role) || isFinanceUser(me, org));
  const liveIds = (sites ?? []).filter((s) => ['live', 'upcoming'].includes(siteStatusKey(s))).map((s) => s.id);
  const { data: raw } = useQuery({
    queryKey: ['allCalendar', from, to, driver, me?.org_id, appsOk, liveIds.join(',')],
    enabled: !!me && !!sites,
    queryFn: async () => {
      const [e, d, apps, dlv] = await Promise.all([
        db.from('site_calendar_events').select('*').gte('event_date', from).lte('event_date', to).order('event_date').order('created_at'),
        driver ? db.from('delivery_tasks').select('id,site_id,manual_site_name,description,scheduled_date,time_slot,status').eq('org_id', me?.org_id as string).gte('scheduled_date', from).lte('scheduled_date', to) : Promise.resolve({ data: [] }),
        appsOk ? appDateLines(null, from, to) : Promise.resolve([]),
        deliveryDateLines(liveIds, from, to),
      ]);
      return {
        events: (e.data as Omit<Ev, 'kind' | 'colour'>[] | null) ?? [],
        driver: (d.data as { id: string; site_id: string | null; manual_site_name: string | null; description: string | null; scheduled_date: string; time_slot: string; status: string }[] | null) ?? [],
        extra: [...apps, ...dlv],
      };
    },
  });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const byId = Object.fromEntries((sites ?? []).map((s) => [s.id, s]));
  const all: Ev[] = [
    ...(raw?.events ?? []).map((e) => ({ ...e, kind: 'event' as const, colour: e.is_private ? base.slateLight : t.brand1 })),
    ...(raw?.extra ?? []).map((x) => ({ id: x.id, site_id: x.site_id, title: x.title, event_date: x.event_date, kind: x.kind, colour: x.colour })),
    ...(sites ?? []).filter((s) => siteStatusKey(s) === 'upcoming' && s.start_date && s.start_date >= from && s.start_date <= to)
      .map((s) => ({ id: `start-${s.id}`, site_id: s.id, title: `🚧 Project start: ${s.name}`, event_date: s.start_date as string, kind: 'start' as const, colour: '#1E9E5A' })),
    ...(raw?.driver ?? []).filter((x) => x.status !== 'cancelled').map((x) => ({ id: `drv-${x.id}`, site_id: x.site_id, title: `🚚 ${slotLabel(x.time_slot)} · ${x.description || 'Delivery'}`, event_date: x.scheduled_date, kind: 'driver' as const, colour: '#6B4FD8', where: x.site_id ? undefined : x.manual_site_name || '' })),
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
  const gridItems: Record<string, GridItem[]> = {};
  Object.entries(byDate).forEach(([ds, list]) => { gridItems[ds] = list.map((e) => ({ id: e.id, title: e.title, colour: e.colour, site: e.kind === 'start' ? undefined : e.where ?? (e.site_id ? byId[e.site_id]?.name : undefined) })); });
  const pickMany = async (title: string, opts: { id: string; name: string }[], cur: string[], set: (v: string[]) => void) => {
    const k = await chooseAction(title, [{ key: '__clear', label: 'Clear filter' }, ...opts.map((o) => ({ key: o.id, label: `${cur.includes(o.id) ? '☑' : '☐'} ${o.name}` }))]);
    if (k === '__clear') set([]); else if (k) set(cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]);
  };
  const tap = (e: Ev) => {
    if (e.kind === 'event') setOpenId(openId === e.id ? null : e.id);
    else if (e.kind === 'start' && e.site_id) router.push(`/sites/${e.site_id}`);
    else if (e.kind === 'app' && e.site_id) router.push((isFinanceUser(me, org) ? `/fin/job/${e.site_id}` : `/sites/${e.site_id}/calendar`) as never);
    else if (e.kind === 'delivery' && e.site_id) router.push(`/sites/${e.site_id}/materials` as never);
  };

  const dayItems = (ds: string) => {
    const d = new Date(`${ds}T00:00:00`);
    const list = byDate[ds] ?? [];
    return list.length ? list.map((e) => {
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
        <Pressable key={e.id} onPress={() => (e.kind === 'driver' ? router.push(`/pm/delivery/${e.id.replace(/^drv-/, '')}` as never) : tap(e))} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderRadius: radius.row }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: e.colour }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', color: e.is_private ? base.slate : base.ink }}>{e.is_private ? '🔒 ' : ''}{e.title}</Text>
            <Muted>{e.where ?? s?.name ?? ''}</Muted>
          </View>
        </Pressable>
      );
    }) : <Text style={{ color: base.slateLight }}>—</Text>;
  };
  const dayRow = (ds: string) => {
    const d = new Date(`${ds}T00:00:00`);
    return (
      <View key={ds} style={{ flexDirection: 'row', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: base.line }}>
        <View style={{ width: 52, alignItems: 'center' }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: d.getDay() % 6 === 0 ? base.red : base.slate }}>{d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}</Text>
          <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: ds === today ? 2 : 0, borderColor: t.brand1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: base.ink }}>{d.getDate()}</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>{dayItems(ds)}</View>
      </View>
    );
  };
  const selHead = (
    <Text style={[heading(800), { fontSize: desk ? 20 : 17, color: base.ink, marginTop: desk ? 4 : 8, marginBottom: desk ? 12 : 6 }]}>
      {new Date(`${sel}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}{(byDate[sel] ?? []).length ? ` · ${(byDate[sel] ?? []).length} booked` : ''}
    </Text>
  );
  const shift = (n: number) => {
    const m = new Date(month.y, month.m + n, 1);
    setMonth({ y: m.getFullYear(), m: m.getMonth() });
    const now = new Date();
    setSel(m.getFullYear() === now.getFullYear() && m.getMonth() === now.getMonth() ? today : localISODate(m));
  };
  const monthGridEl = (
    <MonthGrid year={month.y} month={month.m} sel={sel} today={today} items={gridItems} onSelect={(ds) => { setSel(ds); setOpenId(null); }}
      onShift={shift} onToday={() => { const n = new Date(); setMonth({ y: n.getFullYear(), m: n.getMonth() }); setSel(today); }} />
  );

  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Calendar' }} />
      <HowTo k="calendar" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Chip on={!!pmF.length} label={`${pmF.length ? (pmF.length === 1 ? nameOf(people, pmF[0]) : `${pmF.length} PMs`) : 'Filter by PM'} ▼`} onPress={() => void pickMany('Filter by PM', pms ?? [], pmF, setPmF)} />
        <Chip on={!!siteF.length} label={`${siteF.length ? `${siteF.length} sites` : 'Filter by site'} ▼`} onPress={() => void pickMany('Filter by site', sites ?? [], siteF, setSiteF)} />
        <Chip on={driver} label="🚚 Driver diary" onPress={() => setDriver(!driver)} />
        <View style={{ flex: 1 }} />
        <CalTools view={view} onView={setView} />
      </View>
      {view === 'month' ? (
        desk ? (
          <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
            <View style={{ flex: 1, minWidth: 0 }}>{monthGridEl}</View>
            <View style={{ width: 360, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ECEEF2', borderRadius: 20, padding: 16 }}>
              {selHead}
              {dayItems(sel)}
            </View>
          </View>
        ) : (
          <>
            {monthGridEl}
            {selHead}
            <View>{dayItems(sel)}</View>
          </>
        )
      ) : (
        <>
          <Muted style={{ marginBottom: 8 }}>Next {days.length} days across every project — tap an item for details.</Muted>
          {days.map(dayRow)}
        </>
      )}
    </ScrollView>
  );
}
