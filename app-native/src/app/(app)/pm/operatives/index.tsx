// Operatives (320 renderOperativesList): every operative with their site and
// certificate counts; search; tap one for their full record. Opened from a job's
// H&S › Operatives tile with ?site= it lists just the people on that job.
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Card, Empty, Muted } from '@/components/ui';
import { useOperativeList } from '@/data/certs';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, radius, space } from '@/theme/theme';

export default function Operatives() {
  const { site } = useLocalSearchParams<{ site?: string }>();
  const { me } = useAuth();
  const [q, setQ] = useState('');
  const { data: ops = [], isLoading } = useOperativeList(me?.org_id);
  const { data: sites = [] } = useSites();
  const { data: onSite } = useQuery({
    queryKey: ['siteOpsList', site], enabled: !!site,
    queryFn: async () => new Set((((await supabase.from('site_assignments').select('user_id').eq('site_id', site as string)).data ?? []) as { user_id: string }[]).map((r) => r.user_id)),
  });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const siteName = site ? sites.find((s) => s.id === site)?.name : null;
  const shown = ops.filter((o) => (!site || onSite?.has(o.id)) && (!q.trim() || (o.name || '').toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: siteName ? `Operatives · ${siteName}` : 'Operatives' }} />
      <TextInput value={q} onChangeText={setQ} placeholder="Search operatives…" style={{ borderWidth: 1.5, borderColor: base.line, borderRadius: radius.input, padding: 12, color: base.ink, backgroundColor: base.card, marginBottom: 14 }} />
      {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((o) => (
        <Pressable key={o.id} onPress={() => router.push(`/pm/operatives/${o.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
          <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: base.blueBg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontWeight: '800', color: base.blue }}>{(o.name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{o.name}</Text>
            <Muted>{o.sites} site{o.sites === 1 ? '' : 's'} · {o.certs} certificate{o.certs === 1 ? '' : 's'}{o.phone ? ` · 📞 ${o.phone}` : ''}</Muted>
          </View>
          <Text style={{ color: base.slate, fontSize: 18 }}>›</Text>
        </Pressable>
      )) : <Empty>{site ? 'No operatives assigned to this job yet.' : 'No operatives found.'}</Empty>}
      <Card style={{ marginTop: space.m }}>
        <Muted>The Training Matrix exports (Excel / PDF) and OneDrive certificate sync are still in the current app for now.</Muted>
      </Card>
    </ScrollView>
  );
}
