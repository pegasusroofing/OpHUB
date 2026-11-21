// Admin Centre › People › Check-In Logs (260 checkinlogs; drivers' from 840 driverCheckinLogHtml). Andy, 18 Nov 2026:
// "move the driver check in logs into check in logs, also make the check in logs page a bit simpler, have a type drop
// down list for who to search for, also allow for searching by role, i can type in site managers etc and it pulls all,
// or their name. remove the two buttons weekly monthly and leave it as a date range". So: Type ▾ (Everyone, Operatives,
// Site Managers, Project Managers, Drivers), a box that finds a name or a role, and From / To dates (this week to start).
// Each person with check-ins: their days, times (with the site) and hours. A driver's breaks come off their hours, with
// a map link where the phone gave one. Who had none is listed underneath. Drivers for full managers only, as before.
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { DateBox } from '@/components/DateField';
import { SelectBox } from '@/components/SelectBox';
import { Card, Muted } from '@/components/ui';
import { useTeam } from '@/data/admin';
import { useOrgRoles } from '@/data/orgRoles';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { isFullManager, isManager } from '@/lib/roles';
import { logRange, pairSessions, personMatches, type LogRow, type Session } from '@/lib/rules/checkinLog';
import { localISODate, minsLabel } from '@/lib/rules/driver';
import { roleOf } from '@/lib/rules/orgRoles';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Chk = LogRow & { lat?: number | null; lon?: number | null };
type Brk = { user_id: string; started_at: string; ended_at: string | null };
const TYPES: [string, string][] = [['all', 'Everyone'], ['operative', 'Operatives'], ['site_manager', 'Site Managers'], ['pm', 'Project Managers'], ['driver', 'Drivers']];
const hm = (ts: string) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayWord = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const ukDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const brkMins = (b: Brk) => (b.ended_at ? Math.max(0, (+new Date(b.ended_at) - +new Date(b.started_at)) / 60000) : 0);

/** All rows between two times, a thousand at a time. */
async function allRows<T>(table: string, col: string, start: number, end: number, orgId?: string): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    let qy = db.from(table).select('*').gte(col, new Date(start).toISOString()).lt(col, new Date(end).toISOString());
    if (orgId) qy = qy.eq('org_id', orgId);
    const r = ((await qy.order(col).range(i, i + 999)).data as T[] | null) ?? [];
    out.push(...r); if (r.length < 1000) break;
  }
  return out;
}

export default function CheckinLogs() {
  const { me } = useAuth();
  const { data: team = [] } = useTeam(me?.org_id);
  const { data: roles = [] } = useOrgRoles(me?.org_id);
  const { data: sites = [] } = useSites();
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(() => localISODate(new Date(logRange('weekly', 0).start)));
  const [to, setTo] = useState(() => localISODate(new Date()));
  const okDates = !!from && !!to && from <= to;
  const range = logRange('weekly', 0, okDates ? from : undefined, okDates ? to : undefined);
  const drivers = isFullManager(me);
  const { data, isLoading } = useQuery({
    queryKey: ['checkinLog', me?.org_id, range.start, range.end, drivers],
    enabled: !!me && okDates,
    queryFn: async () => {
      const [site, drv, brk] = await Promise.all([
        allRows<Chk>('checkins', 'ts', range.start, range.end),
        drivers ? allRows<Chk>('driver_checkins', 'ts', range.start, range.end, me?.org_id as string) : Promise.resolve([] as Chk[]),
        drivers ? allRows<Brk>('driver_breaks', 'started_at', range.start, range.end, me?.org_id as string) : Promise.resolve([] as Brk[]),
      ]);
      return { site, drv, brk };
    },
  });
  if (!me) return null;
  if (!isManager(me)) return <><Stack.Screen options={{ title: 'Check-In Logs' }} /><Muted style={{ padding: space.l }}>Managers only.</Muted></>;
  const siteName = (id: string | null) => (id ? sites.find((s) => s.id === id)?.name || '' : '');
  const siteIds = new Set(sites.map((s) => s.id)), teamIds = new Set(team.map((p) => p.id));
  const siteRows = (data?.site ?? []).filter((c) => (c.site_id && siteIds.has(c.site_id)) || teamIds.has(c.user_id));
  const types = TYPES.filter(([k]) => k !== 'driver' || drivers);
  const ofType = (role: string) => type === 'all' || role === type || (type === 'pm' && role === 'admin');
  const people = team.filter((p) => p.role !== 'client' && (p.role !== 'driver' || drivers) && ofType(p.role || '') && personMatches(q, p, roleOf(p, roles)?.name));
  // Each person's sessions, and for drivers their breaks.
  const rowsOf = (p: { id: string; role?: string | null }) => (p.role === 'driver' ? (data?.drv ?? []) : siteRows).filter((c) => c.user_id === p.id);
  const withLogs = people.filter((p) => rowsOf(p).length);
  const without = people.filter((p) => !rowsOf(p).length);
  const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: base.card, color: base.ink, fontSize: 14 } as const;
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Check-In Logs' }} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <SelectBox title="Type" value={type} options={types} onChange={setType} style={{ width: 150 }} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search A Name Or A Role" accessibilityLabel="Search a name or a role" placeholderTextColor={base.slateLight} autoCapitalize="none" style={[box, { flex: 1, minWidth: 0 }]} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <DateBox value={from} onChange={setFrom} placeholder="From" title="From" clearable={false} style={{ flex: 1, paddingVertical: 7 }} />
        <Text style={{ color: base.slate }}>to</Text>
        <DateBox value={to} onChange={setTo} placeholder="To" title="To" clearable={false} style={{ flex: 1, paddingVertical: 7 }} />
      </View>
      {!okDates ? <Muted style={{ marginBottom: 8 }}>Choose a From date before the To date.</Muted>
        : <Muted style={{ marginBottom: 10 }}>{ukDate(from)} To {ukDate(to)} · {withLogs.length} {withLogs.length === 1 ? 'Person' : 'People'} Checked In</Muted>}
      {isLoading ? <Muted>Loading…</Muted> : withLogs.map((p) => {
        const list = rowsOf(p);
        const driver = p.role === 'driver';
        const sessions = pairSessions(list);
        const breaks = driver ? (data?.brk ?? []).filter((b) => b.user_id === p.id) : [];
        const days: Record<string, Session[]> = {};
        sessions.forEach((s) => { (days[localISODate(new Date((s.inTs || s.outTs) as string))] ||= []).push(s); });
        const workMins = sessions.reduce((t, s) => t + (s.inTs && s.outTs ? (+new Date(s.outTs) - +new Date(s.inTs)) / 60000 : 0), 0);
        const brk = breaks.reduce((t, b) => t + brkMins(b), 0);
        const hours = (Math.max(0, workMins - brk) / 60).toFixed(1);
        const where = (s: Session) => { const c = list.find((r) => r.ts === s.inTs); return c && typeof c.lat === 'number' && typeof c.lon === 'number' ? c : null; };
        return (
          <Card key={p.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: '600', color: base.ink }}>{p.name}</Text>
                <Text style={{ fontSize: 12, color: base.slate }}>{roleOf(p, roles)?.name || TYPES.find(([k]) => k === p.role)?.[1] || p.role}</Text>
              </View>
              <Text style={{ fontWeight: '600', color: base.ink, backgroundColor: base.paper, paddingHorizontal: 8, borderRadius: 10 }}>{hours}h</Text>
            </View>
            {Object.keys(days).sort().map((d) => {
              const dayBrk = breaks.filter((b) => localISODate(new Date(b.started_at)) === d).reduce((t, b) => t + brkMins(b), 0);
              return (
                <View key={d} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4, borderTopWidth: 1, borderTopColor: '#F0F1F4', gap: 8 }}>
                  <Text style={{ fontSize: 12.5, color: base.ink, width: 86 }}>{dayWord(d)}</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    {days[d].map((s, i) => {
                      const at = driver ? where(s) : null;
                      return (
                        <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
                          <Text style={{ fontSize: 12.5, color: base.slate, textAlign: 'right' }}>
                            {`${s.inTs ? hm(s.inTs) : '—'} – ${s.outTs ? hm(s.outTs) : 'No Check-Out'}${siteName(s.siteId) ? ` · ${siteName(s.siteId)}` : ''}`}
                          </Text>
                          {!!at && <Pressable onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${at.lat},${at.lon}`)}><Text style={{ fontSize: 12.5, color: base.blue }}>Map ↗</Text></Pressable>}
                        </View>
                      );
                    })}
                    {dayBrk > 0 && <Text style={{ fontSize: 12, color: base.slate }}>{minsLabel(dayBrk)} Breaks</Text>}
                  </View>
                </View>
              );
            })}
          </Card>
        );
      })}
      {!isLoading && okDates && !!without.length && (
        <Muted style={{ marginTop: 6 }}>No check-ins: {without.map((p) => p.name).join(', ')}</Muted>
      )}
      {!isLoading && !people.length && <Muted>Nobody matches.</Muted>}
    </ScrollView>
  );
}
