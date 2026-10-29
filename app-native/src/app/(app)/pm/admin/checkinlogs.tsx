// Admin Centre › Check-In Logs (260 checkinlogs): every operative's check-in /
// check-out times across all sites, weekly or monthly (or chosen dates), filter
// by operative, day by day with total hours.
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { chooseAction, useToast } from '@/components/toast';
import { Card, Empty, Muted } from '@/components/ui';
import { useTeam } from '@/data/admin';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { byDay, logRange, pairSessions, type LogRow } from '@/lib/rules/checkinLog';
import { readIsoDate } from '@/lib/rules/materials';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export default function CheckinLogs() {
  const { me } = useAuth();
  const toast = useToast();
  const { data: team = [] } = useTeam(me?.org_id);
  const { data: sites = [] } = useSites();
  const [mode, setMode] = useState<'weekly' | 'monthly'>('weekly');
  const [offset, setOffset] = useState(0);
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [ops, setOps] = useState<string[]>([]);
  const f = readIsoDate(from), t = readIsoDate(to);
  const custom = !!f && !!t && f !== 'bad' && t !== 'bad';
  const range = logRange(mode, offset, custom ? (f as string) : undefined, custom ? (t as string) : undefined);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['checkinLog', me?.org_id, range.start, range.end],
    enabled: !!me,
    queryFn: async () => {
      const out: LogRow[] = [];
      for (let i = 0; ; i += 1000) {
        const r = ((await db.from('checkins').select('*').gte('ts', new Date(range.start).toISOString()).lt('ts', new Date(range.end).toISOString()).order('ts').order('id').range(i, i + 999)).data as LogRow[] | null) ?? [];
        out.push(...r); if (r.length < 1000) break;
      }
      return out;
    },
  });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const siteIds = new Set(sites.map((s) => s.id)), teamIds = new Set(team.map((p) => p.id));
  const mine = rows.filter((c) => (c.site_id && siteIds.has(c.site_id)) || teamIds.has(c.user_id));
  const operatives = team.filter((p) => p.role === 'operative' && (!ops.length || ops.includes(p.id)));
  const chip = (on: boolean, l: string, onPress: () => void) => <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card }}><Text style={{ fontWeight: '700', fontSize: 12, color: on ? '#fff' : base.ink }}>{l}</Text></Pressable>;
  const dateBox = (v: string, set: (s: string) => void, ph: string) => <TextInput value={v} onChangeText={set} placeholder={ph} autoCapitalize="none" style={{ flex: 1, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 8, fontSize: 12, color: base.ink, backgroundColor: base.card }} />;
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Check-In Logs' }} />
      <Muted style={{ marginBottom: 10 }}>Every operative&apos;s check-in / check-out times, across all sites.</Muted>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        {chip(mode === 'weekly', 'Weekly', () => { setMode('weekly'); setOffset(0); })}
        {chip(mode === 'monthly', 'Monthly', () => { setMode('monthly'); setOffset(0); })}
        <View style={{ flex: 1 }} />
        {chip(!!ops.length, ops.length ? (ops.length === 1 ? team.find((p) => p.id === ops[0])?.name || '1 selected' : `${ops.length} selected`) : 'All operatives', async () => {
          const k = await chooseAction('Filter by operative', [{ key: '__clear', label: 'Clear filter' }, ...team.filter((p) => p.role === 'operative').map((p) => ({ key: p.id, label: `${ops.includes(p.id) ? '☑' : '☐'} ${p.name}` }))]);
          if (k === '__clear') setOps([]); else if (k) setOps(ops.includes(k) ? ops.filter((x) => x !== k) : [...ops, k]);
        })}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Pressable disabled={custom} onPress={() => setOffset(offset - 1)} style={{ opacity: custom ? 0.35 : 1, padding: 8 }}><Text style={{ fontSize: 18 }}>‹</Text></Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontWeight: '800', color: base.ink }}>{range.label}</Text>
        <Pressable disabled={custom || offset >= 0} onPress={() => setOffset(offset + 1)} style={{ opacity: custom || offset >= 0 ? 0.35 : 1, padding: 8 }}><Text style={{ fontSize: 18 }}>›</Text></Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, alignItems: 'center' }}>
        {dateBox(from, setFrom, 'From YYYY-MM-DD')}{dateBox(to, setTo, 'To YYYY-MM-DD')}
        {(!!from || !!to) && <Pressable onPress={() => { setFrom(''); setTo(''); }}><Text style={{ color: base.blue }}>Clear</Text></Pressable>}
      </View>
      {(f === 'bad' || t === 'bad') && <Text style={{ color: base.warn, marginBottom: 8 }} onPress={() => toast('Enter the dates as YYYY-MM-DD.')}>Enter the dates as YYYY-MM-DD.</Text>}
      {isLoading ? <Muted>Loading…</Muted> : operatives.length ? operatives.map((op) => {
        const list = mine.filter((c) => c.user_id === op.id);
        if (!list.length) return <Card key={op.id}><Text style={{ fontWeight: '800', color: base.ink }}>{op.name}</Text><Muted>No check-ins this {mode === 'weekly' ? 'week' : 'month'}.</Muted></Card>;
        const { days, hours } = byDay(pairSessions(list));
        return (
          <Card key={op.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ flex: 1, fontWeight: '800', color: base.ink }}>{op.name}</Text>
              <Text style={{ fontWeight: '800', color: base.ink, backgroundColor: base.paper, paddingHorizontal: 8, borderRadius: 10 }}>{hours}h</Text>
            </View>
            {Object.entries(days).map(([day, ss]) => (
              <View key={day} style={{ flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: base.line }}>
                <Text style={{ fontSize: 12.5, color: base.ink, width: 90 }}>{day}</Text>
                <Text style={{ flex: 1, fontSize: 12.5, color: base.slate, textAlign: 'right' }}>{ss.map((s) => `${s.inTs ? new Date(s.inTs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'} – ${s.outTs ? new Date(s.outTs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'still on site'}`).join(', ')}</Text>
              </View>
            ))}
          </Card>
        );
      }) : <Empty>No operatives yet.</Empty>}
    </ScrollView>
  );
}
