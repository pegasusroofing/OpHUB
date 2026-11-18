// Home: the next five working days as a little calendar (Andy, 11 Nov 2026). Each day shows what's on the project
// calendars; tap a day to add something to it (and tag people), or the Calendar button for the full calendar. Bigger
// heading and day text, and Calendar as a proper button (Andy, 11 Nov 2026). Andy, 17 Nov 2026 ("I'm clicking them but
// it's asking to add again. In the iPhone I can click the items in there as well as add"): like the iPhone's calendar,
// tapping an item opens it (the calendar on that day with it open; an application opens its job), "+N More" opens
// that day, and the rest of the box, or the + at its foot, adds to that day. Andy, 17 Nov 2026 ("Can the next 5 days
// on calendar be swipe able for 10 days? Keep text as it is but let me see 5 more days on a swipe"): swipe the row for
// the 5 working days after (or tap the second dot under it); the heading stays Next 5 Days.
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { OphIcon } from '@/components/OphIcon';
import { appDateLines } from '@/data/calendar';
import { useAuth } from '@/lib/auth';
import { isFinanceUser } from '@/lib/roles';
import { localISODate } from '@/lib/rules/driver';
import { supabase } from '@/lib/supabase';
import type { Site } from '@/lib/types';
import { base, useDesk, useTheme } from '@/theme/theme';

/** The next five weekdays from today (today counts if it's a weekday). */
export function nextWorkingDays(from: Date, n = 5): string[] {
  const out: string[] = []; const d = new Date(from);
  while (out.length < n) { if (d.getDay() % 6 !== 0) out.push(localISODate(d)); d.setDate(d.getDate() + 1); }
  return out;
}

export function HomeWeek({ sites }: { sites: Site[] | undefined }) {
  const { me, org } = useAuth();
  // Application dates from Finance too, for PMs, admins and Finance users (Andy, 13 Nov 2026).
  const apps = !!me && (['pm', 'admin'].includes(me.role) || isFinanceUser(me, org));
  const t = useTheme();
  const desk = useDesk();
  const days = nextWorkingDays(new Date(), 10);
  const pages = [days.slice(0, 5), days.slice(5, 10)];
  const [w, setW] = useState(0);
  const [pageAt, setPageAt] = useState(0);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  // A new width (turning the phone, a wider window): the pages follow, staying on the five showing.
  const fit = (nw: number) => { if (!nw || Math.abs(nw - w) < 1) return; setW(nw); requestAnimationFrame(() => scroller.current?.scrollTo({ x: pageAt * nw, animated: false })); };
  const goPage = (i: number) => { scroller.current?.scrollTo({ x: i * w, animated: true }); setPageAt(i); };
  const today = localISODate(new Date());
  const ids = new Set((sites ?? []).map((s) => s.id));
  const { data: events = [] } = useQuery({
    queryKey: ['homeWeek', me?.org_id, days[0], days[9], apps], enabled: !!me && !!sites, staleTime: 60000,
    queryFn: async () => {
      const [ev, ap] = await Promise.all([
        (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from('site_calendar_events').select('id,site_id,title,event_date')
          .gte('event_date', days[0]).lte('event_date', days[9]).order('event_date').order('created_at').limit(300),
        apps ? appDateLines(null, days[0], days[9]) : Promise.resolve([]),
      ]);
      const job = (id: string) => { const x = (sites ?? []).find((y) => y.id === id); return x ? x.job_number || x.name : ''; };
      return [...((ev.data as { id: string; site_id: string; title: string; event_date: string }[] | null) ?? []).map((e) => ({ ...e, app: false })),
        ...ap.map((a) => ({ id: a.id, site_id: a.site_id, title: `${a.title.startsWith('💷 Application sent') ? '💷 Applied' : '💷 Application'} ${job(a.site_id)}`.trim(), event_date: a.event_date, app: true }))];
    },
  });
  const on = (d: string) => events.filter((e) => e.event_date === d && ids.has(e.site_id));
  const add = (d: string) => router.push({ pathname: '/pm/calendar', params: { date: d, add: '1' } } as never);
  const dayOf = (d: string) => router.push({ pathname: '/pm/calendar', params: { date: d } } as never);
  // An application goes where the full calendar sends it: Finance users to the job in Finance, others to the job's calendar.
  const openItem = (e: (typeof events)[number]) => router.push((e.app
    ? (isFinanceUser(me, org) ? `/fin/job/${e.site_id}` : `/sites/${e.site_id}/calendar`)
    : { pathname: '/pm/calendar', params: { date: e.event_date, open: e.id } }) as never);
  // The heading and the Calendar button are the same height (Andy, 15 Nov 2026: "I want the calendar button to be the
  // same height as the next 5 days").
  const rowH = desk ? 26 : 25;
  const dayBox = (d: string) => {
    const list = on(d), dt = new Date(`${d}T00:00:00`), isToday = d === today;
    const long = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const padX = desk ? 12 : 4;
    // Side by side, not one inside another (a button can't hold buttons): the day's name and the space at the foot
    // (with its +) add to the day; each item, and "+N More", is its own button between them.
    return (
      <View key={d} style={{ flex: 1, minWidth: 0, minHeight: 92, backgroundColor: base.card, borderWidth: isToday ? 1.5 : 1, borderColor: isToday ? t.brand1 : base.cardLine, borderRadius: 10, overflow: 'hidden' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Add to ${long}`} onPress={() => add(d)} style={{ paddingTop: desk ? 8 : 6, paddingHorizontal: padX + (desk ? 6 : 2) }}>
          <Text numberOfLines={1} style={{ fontSize: desk ? 14.5 : 13.5, fontWeight: '700', color: isToday ? t.brand1 : base.slate }}>{dt.toLocaleDateString('en-GB', { weekday: 'short' })} {dt.getDate()}</Text>
        </Pressable>
        {/* Each item its own button, on a light grey block so it reads as something to tap. */}
        {list.slice(0, 2).map((e) => (
          <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`Open ${e.title}`} onPress={() => openItem(e)}
            style={({ pressed }) => ({ marginTop: 3, marginHorizontal: padX, borderRadius: 5, paddingVertical: 2, paddingHorizontal: desk ? 6 : 3, backgroundColor: pressed ? '#E4E7EC' : '#F1F2F4' })}>
            {/* Smaller words, so one item doesn't fill the day (Andy, 18 Nov 2026). */}
                  <Text numberOfLines={2} style={{ fontSize: desk ? 12 : 10.5, lineHeight: desk ? 15 : 13, color: base.ink }}>{e.title}</Text>
          </Pressable>
        ))}
        {list.length > 2 && (
          <Pressable accessibilityRole="button" accessibilityLabel={`See all ${list.length} on ${long}`} onPress={() => dayOf(d)} style={{ paddingTop: 3, paddingHorizontal: padX + (desk ? 6 : 2) }}>
            <Text style={{ fontSize: 11.5, fontWeight: '600', color: base.slate }}>+{list.length - 2} More</Text>
          </Pressable>
        )}
        {/* The rest of the box, with a + at its foot on every day, so there's always somewhere obvious to add. */}
        <Pressable accessibilityRole="button" accessibilityLabel={`+ Add to ${long}`} onPress={() => add(d)}
          style={{ flex: 1, minHeight: 28, justifyContent: 'flex-end', paddingBottom: desk ? 6 : 4 }}>
          <Text style={{ fontSize: 18, lineHeight: 20, color: base.slateLight, textAlign: 'center' }}>+</Text>
        </Pressable>
      </View>
    );
  };
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        {/* Bigger heading and dates (Andy, 14 Nov 2026). */}
        <Text style={{ flex: 1, fontWeight: '700', color: base.ink, fontSize: desk ? 18 : 17, lineHeight: rowH }}>Next 5 Days</Text>
        {/* Calendar as a tile like the day boxes under it, with the calendar icon and an arrow (Andy, 14 Nov 2026: the
            round "Calendar ›" pill looked cheap; same place). */}
        <Pressable accessibilityRole="button" accessibilityLabel="Open the calendar" onPress={() => router.push('/pm/calendar' as never)} hitSlop={6}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: base.cardLine, backgroundColor: pressed ? '#F1F2F4' : base.card, borderRadius: 8, height: rowH, paddingVertical: 0, paddingLeft: 9, paddingRight: 7, shadowColor: '#0B1220', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } })}>
          <OphIcon name="calendar" size={15} color={t.brand1} stroke={2} />
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: base.ink }}>Calendar</Text>
          <OphIcon name="chevron" size={14} color={base.slate} stroke={2.2} />
        </Pressable>
      </View>
      {/* Two pages of five, each the full width: a swipe moves a whole page. Until the width is known, the first five. */}
      {w ? (
        <ScrollView ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false} testID="home-week" onLayout={(e) => fit(e.nativeEvent.layout.width)}
          onScroll={(e) => setPageAt(Math.round(e.nativeEvent.contentOffset.x / w))} scrollEventThrottle={50}>
          {pages.map((p, i) => <View key={i} style={{ width: w, flexGrow: 1, flexDirection: 'row', gap: 6 }}>{p.map(dayBox)}</View>)}
        </ScrollView>
      ) : <View onLayout={(e) => fit(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', gap: 6 }}>{pages[0].map(dayBox)}</View>}
      {/* Two dots: which five are showing; tap one to go there (on a laptop, where a swipe is awkward). */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 8 }}>
        {pages.map((_, i) => (
          <Pressable key={i} accessibilityRole="button" accessibilityLabel={i ? 'Show the 5 days after' : 'Show the next 5 days'} onPress={() => goPage(i)} hitSlop={10}
            style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: pageAt === i ? base.slate : base.line }} />
        ))}
      </View>
    </View>
  );
}
