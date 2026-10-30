// A subcontractor's Schedule of Works (550 renderSubSchedule): the main schedule's items assigned to
// this company, as full rows — status, % complete and photos, the same as on the main Schedule of
// Works (they're the same tasks, so progress shows on both). Subcontractor operatives work from here.
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { SowTaskRow } from '@/components/SowTaskRow';
import { useToast } from '@/components/toast';
import { Empty, Muted } from '@/components/ui';
import { useSite } from '@/data/sites';
import { useSchedule } from '@/data/sow';
import { useSubco } from '@/data/subcontractors';
import { useAuth } from '@/lib/auth';
import { onQueueChange, onUploadsSent, pendingJobs, type UploadJob } from '@/lib/uploadQueue';
import { base, page, space } from '@/theme/theme';

export default function SubSchedule() {
  const { id, co } = useLocalSearchParams<{ id: string; co: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const { data: sub } = useSubco(co, me);
  const { data: site } = useSite(id);
  const { data, isLoading, refetch } = useSchedule(site);
  const [f, setF] = useState<'all' | 'todo' | 'progress'>('all');
  const [pending, setPending] = useState<UploadJob[]>([]);
  const [pctPrompt, setPctPrompt] = useState<string | null>(null);
  useEffect(() => {
    const split = (jobs: Awaited<ReturnType<typeof pendingJobs>>) => setPending(jobs.filter((j): j is UploadJob => j.kind === 'upload'));
    void pendingJobs().then(split);
    const a = onQueueChange(split);
    const b = onUploadsSent((n) => { toast(`✓ ${n} photo${n === 1 ? '' : 's'} uploaded`); void refetch(); });
    return () => { a(); b(); };
  }, [refetch, toast]);
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));
  if (!sub || !site || !me) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const mine = (data?.tasks ?? []).filter((t) => t.subcontractor_company_id === co);
  const shown = mine.filter((t) => f === 'all' || (f === 'todo' ? (t.status || 'todo') === 'todo' : (t.status || 'todo') !== 'todo'));
  const photos: Record<string, NonNullable<typeof data>['photos']> = {};
  (data?.photos ?? []).forEach((p) => { (photos[p.task_id] ||= []).push(p); });
  const addrById = Object.fromEntries((data?.addresses ?? []).map((a) => [a.id, a]));
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: `${sub.company.name} — Schedule of Works` }} />
      <Muted style={{ marginBottom: 10 }}>Only the work items assigned to {sub.company.name} — updates show straight away on the main Schedule of Works.</Muted>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {([['all', 'All'], ['todo', 'To Do'], ['progress', 'In Progress / Complete']] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => setF(k)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: f === k ? base.ink : base.line, backgroundColor: f === k ? base.ink : base.card }}>
            <Text style={{ fontWeight: '700', color: f === k ? '#fff' : base.ink }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((t) => (
        <SowTaskRow key={t.id} updateOnly me={me} site={site} task={t} photos={photos[t.id] ?? []} pending={pending.filter((j) => j.waitKey === t.id)}
          address={t.sub_site_id ? addrById[t.sub_site_id] : null} addresses={data?.addresses ?? []} onChanged={() => { void refetch(); }}
          percentPrompt={pctPrompt === t.id} setPercentPrompt={(on) => setPctPrompt(on ? t.id : null)} />
      )) : <Empty>No work items assigned to {sub.company.name} yet.</Empty>}
    </ScrollView>
  );
}
