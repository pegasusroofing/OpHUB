// Home: the next five working days as a little calendar (Andy, 11 Nov 2026). Each day shows what's on the project
// calendars; tap a day to add something to it (and tag people), or the Calendar button for the full calendar. Bigger
// heading and day text, and Calendar as a proper button (Andy, 11 Nov 2026).
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { appDateLines } from '@/data/calendar';
import { useAuth } from '@/lib/auth';
import { isFinanceUser } from '@/lib/roles';
import { localISODate } from '@/lib/rules/driver';
import { supabase } from '@/lib/supabase';
import type { Site } from '@/lib/types';
import { base, useTheme } from '@/theme/theme';

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
  const days = nextWorkingDays(new Date());
  const today = localISODate(new Date());
  const ids = new Set((sites ?? []).map((s) => s.id));
  const { data: events = [] } = useQuery({
    queryKey: ['homeWeek', me?.org_id, days[0], days[4], apps], enabled: !!me && !!sites, staleTime: 60000,
    queryFn: async () => {
      const [ev, ap] = await Promise.all([
        (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from('site_calendar_events').select('id,site_id,title,event_date')
          .gte('event_date', days[0]).lte('event_date', days[4]).order('event_date').order('created_at').limit(300),
        apps ? appDateLines(null, days[0], days[4]) : Promise.resolve([]),
      ]);
      const job = (id: string) => { const x = (sites ?? []).find((y) => y.id === id); return x ? x.job_number || x.name : ''; };
      return [...((ev.data as { id: string; site_id: string; title: string; event_date: string }[] | null) ?? []),
        ...ap.map((a) => ({ id: a.id, site_id: a.site_id, title: `${a.title.startsWith('💷 Application sent') ? '💷 Applied' : '💷 Application'} ${job(a.site_id)}`.trim(), event_date: a.event_date }))];
    },
  });
  const on = (d: string) => events.filter((e) => e.event_date === d && ids.has(e.site_id));
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ flex: 1, fontWeight: '700', color: base.ink, fontSize: 16 }}>Next 5 Days</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Open the calendar" onPress={() => router.push('/pm/calendar' as never)} hitSlop={6}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: base.line, backgroundColor: pressed ? '#F1F2F4' : base.card, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 })}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: base.ink }}>Calendar ›</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {days.map((d) => {
          const list = on(d), dt = new Date(`${d}T00:00:00`), isToday = d === today;
          return (
            <Pressable key={d} accessibilityRole="button" accessibilityLabel={`${dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}: ${list.length} on. Tap to add.`}
              onPress={() => router.push({ pathname: '/pm/calendar', params: { date: d, add: '1' } } as never)}
              style={{ flex: 1, minWidth: 0, minHeight: 92, backgroundColor: base.card, borderWidth: isToday ? 1.5 : 1, borderColor: isToday ? t.brand1 : base.cardLine, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 6 }}>
              <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '700', color: isToday ? t.brand1 : base.slate }}>{dt.toLocaleDateString('en-GB', { weekday: 'short' })} {dt.getDate()}</Text>
              {list.slice(0, 2).map((e) => <Text key={e.id} numberOfLines={2} style={{ fontSize: 12, color: base.ink, marginTop: 3 }}>{e.title}</Text>)}
              {list.length > 2 && <Text style={{ fontSize: 11.5, fontWeight: '600', color: base.slate, marginTop: 2 }}>+{list.length - 2} More</Text>}
              {!list.length && <Text style={{ fontSize: 18, color: base.slateLight, marginTop: 6, textAlign: 'center' }}>+</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
