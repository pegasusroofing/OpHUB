// Vehicle health checks (880, managers, from the Delivery Schedule): each
// vehicle's miles since its last 10,000-mile health check (with "health check
// done" to restart the count), and the drivers' weekly checklists, newest
// first, filterable to ones with failed items. Open one (?id=) to see every
// item, fail notes and photos. Read-only — drivers own their checklists.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { VEHICLE_ITEMS, VEHICLE_PHOTOS, type VItem } from '@/lib/rules/driver';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Check = { id: string; driver_id: string; vehicle_reg: string | null; week_start: string; mileage: number | null; has_fails: boolean; submitted_at: string | null; items: VItem[] | null };
type VStat = { vehicle_reg: string; last_miles: number | null; baseline_miles: number | null; health_check_done_at: string | null };
const day = (d: string) => new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

export default function Vehicles() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: people } = usePeople();
  const [fails, setFails] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['vehicleChecks', me?.org_id], enabled: !!me, queryFn: async () => {
    const [c, v] = await Promise.all([
      db.from('vehicle_checklists').select('*').eq('org_id', me?.org_id as string).eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(200),
      db.from('vehicle_service_status').select('*').eq('org_id', me?.org_id as string).order('vehicle_reg'),
    ]);
    return { checks: (c.data as Check[] | null) ?? [], vstat: (v.data as VStat[] | null) ?? [] };
  } });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  if (isLoading || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;

  if (id) {
    const r = data.checks.find((x) => x.id === id);
    if (!r) return <Muted style={{ padding: space.l }}>Checklist not found.</Muted>;
    const by: Record<string, VItem> = Object.fromEntries((r.items || []).map((it) => [it.key, it]));
    const cats = [...new Set(VEHICLE_ITEMS.map((i) => i.cat))];
    return (
      <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <Stack.Screen options={{ title: 'Vehicle Checklist' }} />
        <Card>
          <Text style={{ fontWeight: '800', color: base.ink }}>{nameOf(people, r.driver_id) || 'Unknown driver'}</Text>
          <Muted>{[r.vehicle_reg, r.mileage ? `${Number(r.mileage).toLocaleString('en-GB')} miles` : '', `Week of ${day(r.week_start)}`].filter(Boolean).join(' · ')}</Muted>
          {r.submitted_at && <Muted>Submitted {new Date(r.submitted_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Muted>}
        </Card>
        <SectionTitle>Vehicle photos</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {VEHICLE_PHOTOS.map((p) => (
            <View key={p.key} style={{ width: '48%' }}>
              {by[p.key]?.photo_path ? <StorageImage bucket="site-photos" path={by[p.key].photo_path} style={{ width: '100%', height: 120, borderRadius: radius.row }} /> : <View style={{ height: 120, borderRadius: radius.row, backgroundColor: base.line, alignItems: 'center', justifyContent: 'center' }}><Muted>No photo</Muted></View>}
              <Muted style={{ textAlign: 'center' }}>{p.label}</Muted>
            </View>
          ))}
        </View>
        {cats.map((cat) => (
          <View key={cat}>
            <SectionTitle>{cat}</SectionTitle>
            {VEHICLE_ITEMS.filter((i) => i.cat === cat).map((item) => {
              const a = by[item.key] || {};
              return (
                <Card key={item.key} style={{ paddingVertical: 8 }}>
                  <Text style={{ color: base.ink }}>{item.label}</Text>
                  <Text style={{ fontWeight: '700', color: a.result === 'fail' ? base.warn : base.ok }}>{a.result === 'fail' ? '✕ Fail' : a.result === 'pass' ? '✓ Pass' : '— Not answered'}</Text>
                  {a.result === 'fail' && !!a.note && <Muted>{a.note}</Muted>}
                  {a.result === 'fail' && !!a.photo_path && <StorageImage bucket="site-photos" path={a.photo_path} style={{ width: 80, height: 80, borderRadius: 8, marginTop: 6 }} />}
                </Card>
              );
            })}
          </View>
        ))}
      </ScrollView>
    );
  }

  const shown = fails ? data.checks.filter((r) => r.has_fails) : data.checks;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Vehicle health checks' }} />
      <SectionTitle>Vehicles · 10,000-mile health checks</SectionTitle>
      {data.vstat.length ? data.vstat.map((v) => {
        const since = v.last_miles != null && v.baseline_miles != null ? v.last_miles - v.baseline_miles : 0, due = since >= 10000;
        return (
          <Card key={v.vehicle_reg}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: base.ink }}>{v.vehicle_reg}</Text>
                <Muted>{v.last_miles != null ? `${Number(v.last_miles).toLocaleString('en-GB')} miles · ` : ''}{Number(since).toLocaleString('en-GB')} since last health check{v.health_check_done_at ? ` (${new Date(v.health_check_done_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })})` : ''}</Muted>
              </View>
              {due && <Text style={{ fontWeight: '800', color: base.red }}>Due</Text>}
            </View>
            <View style={{ height: 6, borderRadius: 99, backgroundColor: '#ECEEF2', marginVertical: 8, overflow: 'hidden' }}><View style={{ height: 6, width: `${Math.max(0, Math.min(100, Math.round(since / 100)))}%`, backgroundColor: due ? base.red : base.ok }} /></View>
            <Button kind="ghost" title="✓ Health check done" onPress={async () => {
              if (!(await confirmAsk(`Mark the vehicle health check for ${v.vehicle_reg} as done? This restarts its 10,000-mile count.`, 'Yes'))) return;
              const now = new Date().toISOString();
              const r = await db.from('vehicle_service_status').update({ baseline_miles: v.last_miles, last_reminder_miles: null, health_check_done_at: now, health_check_done_by: me.id, updated_at: now } as never).eq('org_id', me.org_id as string).eq('vehicle_reg', v.vehicle_reg);
              toast(r.error ? 'Could not save — try again.' : `Health check recorded for ${v.vehicle_reg}`);
              void qc.invalidateQueries({ queryKey: ['vehicleChecks'] });
            }} />
          </Card>
        );
      }) : <Muted style={{ marginBottom: 12 }}>Mileage starts being tracked from each vehicle&apos;s next weekly check.</Muted>}
      <SectionTitle>Weekly checklists</SectionTitle>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        {([[false, 'All'], [true, '⚠ Had Fails']] as const).map(([k, l]) => <Pressable key={l} onPress={() => setFails(k)} style={{ flex: 1, paddingVertical: 8, borderRadius: 16, borderWidth: 1, alignItems: 'center', borderColor: fails === k ? base.ink : base.line, backgroundColor: fails === k ? base.ink : base.card }}><Text style={{ fontWeight: '700', color: fails === k ? '#fff' : base.ink }}>{l}</Text></Pressable>)}
      </View>
      {shown.length ? shown.map((r) => (
        <Pressable key={r.id} onPress={() => router.setParams({ id: r.id })}>
          <Card>
            <Text style={{ fontWeight: '700', color: base.ink }}>{nameOf(people, r.driver_id) || 'Unknown driver'}{r.vehicle_reg ? ` · ${r.vehicle_reg}` : ''}</Text>
            <Muted>Week of {day(r.week_start)}{r.mileage ? ` · ${Number(r.mileage).toLocaleString('en-GB')} miles` : ''} · {r.has_fails ? '⚠ Had failed items' : 'All passed'}</Muted>
          </Card>
        </Pressable>
      )) : <Empty>No submitted checklists{fails ? ' with failed items' : ''} yet.</Empty>}
    </ScrollView>
  );
}
