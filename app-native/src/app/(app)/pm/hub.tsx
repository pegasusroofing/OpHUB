// The HUB (200 renderHub): everything needing your attention in one list —
// filter by type, site, whose jobs (me / all PMs / a colleague) and due date.
// Tap a row to go straight to it.
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { chooseAction } from '@/components/toast';
import { Empty, Muted } from '@/components/ui';
import { HowTo } from '@/components/HowTo';
import { useHub } from '@/data/hub';
import { useSites } from '@/data/sites';
import { usePmList } from '@/data/todos';
import { useAuth } from '@/lib/auth';
import { base, radius, space } from '@/theme/theme';

const TYPES = [['all', 'All'], ['tbt', 'TBT'], ['snag', 'Snags'], ['rams', 'RAMS'], ['coshh', 'COSHH'], ['message', 'Messages'], ['task', 'Tasks'], ['sowphoto', 'Photos']] as const;
const DUE = [['all', 'Any time'], ['overdue', 'Overdue'], ['week', 'Due within 7 days'], ['nodate', 'No due date']] as const;

export default function Hub() {
  const { me } = useAuth();
  const { data: sites } = useSites();
  const { data: pms } = usePmList();
  const [pm, setPm] = useState('');
  const [type, setType] = useState<string>('all');
  const [site, setSite] = useState('');
  const [due, setDue] = useState<string>('all');
  const { data, isLoading, refetch, isRefetching } = useHub(me, sites, pm);
  if (!me) return null;
  const now = new Date(); const week = new Date(Date.now() + 7 * 864e5);
  const shown = (data?.items ?? []).filter((it) => (type === 'all' || it.type === type) && (!site || it.siteId === site)
    && (due === 'all' || (due === 'overdue' ? !!it.due && it.due < now : due === 'week' ? !!it.due && it.due >= now && it.due <= week : !it.due)));
  const others = (pms ?? []).filter((p) => p.id !== me.id);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const pick = (label: string, value: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={{ flex: 1, padding: 10, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, backgroundColor: base.card }}>
      <Muted style={{ fontSize: 10.5, fontWeight: '700' }}>{label}</Muted>
      <Text style={{ color: base.ink }} numberOfLines={1}>▼ {value}</Text>
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />}>
      <Stack.Screen options={{ title: 'HUB' }} />
      <HowTo k="hub" />
      <Muted style={{ marginBottom: 10 }}>Everything needing your attention — Toolbox Talks, RAMS/COSHH, snags, tasks and messages — in one place. Tap a row to jump straight to it.</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {TYPES.map(([k, l]) => (
          <Pressable key={k} onPress={() => setType(k)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: type === k ? base.ink : base.line, backgroundColor: type === k ? base.ink : base.card }}>
            <Text style={{ fontWeight: '700', color: type === k ? '#fff' : base.ink }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        {pick('SITE', site ? data?.sites.find((s) => s.id === site)?.name ?? 'Site' : 'All sites', async () => { const k = await chooseAction('Site', [{ key: '', label: 'All sites' }, ...(data?.sites ?? []).map((s) => ({ key: s.id, label: s.name }))]); if (k !== null) setSite(k); })}
        {pick('DUE DATE', DUE.find(([k]) => k === due)?.[1] ?? 'Any time', async () => { const k = await chooseAction('Due date', DUE.map(([key, label]) => ({ key, label }))); if (k) setDue(k); })}
      </View>
      {others.length > 0 && <View style={{ marginBottom: 10 }}>{pick('VIEWING', pm === '' ? `Me (${me.name})` : pm === 'all' ? 'All PMs' : others.find((p) => p.id === pm)?.name ?? '', async () => {
        const k = await chooseAction('Viewing', [{ key: '', label: `Me (${me.name})` }, { key: 'all', label: 'All PMs' }, ...others.map((p) => ({ key: p.id, label: p.name }))]);
        if (k !== null) { setPm(k); setSite(''); }
      })}</View>}
      {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((it) => (
        <Pressable key={it.key} onPress={() => router.push(it.route as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
          <Text style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: base.warnBg, color: base.warn, textAlign: 'center', lineHeight: 28, fontWeight: '800', overflow: 'hidden' }}>!</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{it.label}</Text>
            <Muted>{it.typeLbl} · {it.siteName}{it.due ? ` · Due ${fmt(it.due)}` : it.at ? ` · ${fmt(it.at)}` : ''}</Muted>
          </View>
        </Pressable>
      )) : <Empty>Nothing matches these filters right now.</Empty>}
    </ScrollView>
  );
}
