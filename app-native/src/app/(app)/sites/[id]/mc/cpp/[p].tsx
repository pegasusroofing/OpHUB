// A job's Construction Phase Plan (Andy, 19 Nov 2026: "replicate it as a rams style builder, pull through as much
// info as you have from the job"). The editor is components/CppEditor.tsx. Beta link only for now.
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { CppEditor } from '@/components/CppEditor';
import { Muted } from '@/components/ui';
import { loadCpp } from '@/data/cpp';
import { useAuth } from '@/lib/auth';
import { isBetaSite } from '@/lib/betaOnly';
import { isManager } from '@/lib/roles';
import { page, space } from '@/theme/theme';

export default function CppScreen() {
  const { id, p: planId } = useLocalSearchParams<{ id: string; p: string }>();
  const { me } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['cpp', planId], enabled: !!planId, gcTime: 0, queryFn: () => loadCpp(planId) });
  if (!me) return null;
  if (!isBetaSite()) return <Muted style={{ padding: space.l }}>The Construction Phase Plan builder is on the website version of the app for now (app.operativehub.co.uk).</Muted>;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted>;
  if (isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!data) return <Muted style={{ padding: space.l }}>Plan not found.</Muted>;
  return (
    <ScrollView contentContainerStyle={page(820)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Construction Phase Plan' }} />
      <CppEditor key={data.row.id} mode="job" row0={data.row} initial={data.plan} siteId={id} />
    </ScrollView>
  );
}
