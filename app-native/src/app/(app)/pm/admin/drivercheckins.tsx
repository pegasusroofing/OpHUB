// Admin Centre › Driver Check-In Log (840 driverCheckinLogHtml): last 14 / 30 /
// 90 days, day by day per driver — check-ins and outs with a map link, breaks,
// time worked (breaks taken off), on duty now / no check-out.
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { Card, Empty, Muted } from '@/components/ui';
import { useTeam } from '@/data/admin';
import { useAuth } from '@/lib/auth';
import { dayTotals, localISODate, minsLabel } from '@/lib/rules/driver';
import { isFullManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Chk = { user_id: string; type: string; ts: string; lat: number | null; lon: number | null; accuracy_m: number | null };
type Brk = { user_id: string; started_at: string; ended_at: string | null };
const time = (ts: string) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function DriverCheckins() {
  const { me } = useAuth();
  const { data: team = [] } = useTeam(me?.org_id);
  const [days, setDays] = useState(14);
  const { data, isLoading } = useQuery({
    queryKey: ['driverLog', me?.org_id, days],
    enabled: !!me,
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - days); since.setHours(0, 0, 0, 0);
      const [c, b] = await Promise.all([
        db.from('driver_checkins').select('*').eq('org_id', me?.org_id as string).gte('ts', since.toISOString()).order('ts', { ascending: false }).limit(1000),
        db.from('driver_breaks').select('*').eq('org_id', me?.org_id as string).gte('started_at', since.toISOString()).order('started_at').limit(1000),
      ]);
      return { rows: (c.data as Chk[] | null) ?? [], breaks: (b.data as Brk[] | null) ?? [] };
    },
  });
  if (!me) return null;
  if (!isFullManager(me)) return <Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted>;
  const rows = data?.rows ?? [], breaks = data?.breaks ?? [];
  const dayKeys: string[] = [];
  rows.forEach((r) => { const k = localISODate(new Date(r.ts)); if (!dayKeys.includes(k)) dayKeys.push(k); });
  const today = localISODate(new Date());
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Driver Check-In Log' }} />
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
        {[14, 30, 90].map((n) => (
          <Pressable key={n} onPress={() => setDays(n)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: days === n ? base.ink : base.line, backgroundColor: days === n ? base.ink : base.card }}>
            <Text style={{ fontWeight: '700', fontSize: 12, color: days === n ? '#fff' : base.ink }}>Last {n} days</Text>
          </Pressable>
        ))}
      </View>
      {isLoading ? <Muted>Loading…</Muted> : dayKeys.length ? dayKeys.map((k) => {
        const dayRows = rows.filter((r) => localISODate(new Date(r.ts)) === k);
        const drivers = [...new Set(dayRows.map((r) => r.user_id))];
        return (
          <View key={k}>
            <Muted style={{ fontWeight: '700', marginTop: 12, marginBottom: 6 }}>{new Date(`${k}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}</Muted>
            {drivers.map((uid) => {
              const list = dayRows.filter((r) => r.user_id === uid).sort((a, b) => +new Date(a.ts) - +new Date(b.ts));
              let mins = 0, open: Chk | null = null;
              list.forEach((r) => { if (r.type === 'in') open = r; else if (r.type === 'out' && open) { mins += Math.max(0, Math.round((+new Date(r.ts) - +new Date((open as Chk).ts)) / 60000)); open = null; } });
              const mine = breaks.filter((b) => b.user_id === uid && localISODate(new Date(b.started_at)) === k);
              const tot = dayTotals(list, mine, k);
              const dur = mins ? `${minsLabel(Math.max(0, mins - Math.min(mins, tot.brk)))} worked${tot.brk ? ` · ${minsLabel(tot.brk)} breaks` : ''}` : '';
              const stillIn = !!open && k === today;
              const events = [
                ...list.map((r) => ({ ts: r.ts, text: `${r.type === 'in' ? '▶ Checked in' : '■ Checked out'} ${time(r.ts)}`, r })),
                ...mine.map((b) => ({ ts: b.started_at, text: `☕ Break ${time(b.started_at)} – ${b.ended_at ? `${time(b.ended_at)} (${minsLabel((+new Date(b.ended_at) - +new Date(b.started_at)) / 60000)})` : 'on break'}`, r: null as Chk | null })),
              ].sort((a, b) => +new Date(a.ts) - +new Date(b.ts));
              return (
                <Card key={uid}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>🚐 {team.find((p) => p.id === uid)?.name || 'Unknown driver'}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: stillIn ? base.ok : open ? base.warn : base.slate }}>{stillIn ? 'On duty now' : open ? 'No check-out' : dur}</Text>
                  </View>
                  {events.map((e, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 6, marginTop: 3 }}>
                      <Muted>{e.text}</Muted>
                      {!!e.r && typeof e.r.lat === 'number' && typeof e.r.lon === 'number' && <Pressable onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${e.r?.lat},${e.r?.lon}`)}><Text style={{ color: base.blue, fontSize: 12.5 }}>Map ↗{e.r.accuracy_m ? ` (±${e.r.accuracy_m}m)` : ''}</Text></Pressable>}
                    </View>
                  ))}
                  {stillIn && !!dur && <Muted style={{ marginTop: 3 }}>{dur} earlier today</Muted>}
                </Card>
              );
            })}
          </View>
        );
      }) : <Empty>No driver check-ins in the last {days} days.</Empty>}
    </ScrollView>
  );
}
