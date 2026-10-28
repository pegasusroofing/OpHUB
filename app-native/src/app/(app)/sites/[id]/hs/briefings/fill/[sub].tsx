// Filling in a Daily Briefing (managers) — the report engine with fromBriefing (430/700).
// A completed briefing stays editable until its first signature.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView } from 'react-native';

import { ReportFill } from '@/components/ReportFill';
import { Muted } from '@/components/ui';
import { useSubmission } from '@/data/reports';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { space } from '@/theme/theme';

export default function BriefingFill() {
  const { id, sub: subId } = useLocalSearchParams<{ id: string; sub: string }>();
  const { me } = useAuth();
  const { data, isLoading } = useSubmission(subId);
  const sub = data?.sub;
  const done = sub?.status === 'completed';
  const locked = !!sub && (!me || !isManager(me) || (done && data?.signed));
  useEffect(() => { if (locked && sub) router.replace(`/sites/${id}/hs/briefings/${sub.id}`); }, [locked, sub, id]);
  if (!me) return null;
  if (isLoading || !sub) return <Muted style={{ padding: space.l }}>{isLoading ? 'Loading…' : 'Briefing not found.'}</Muted>;
  if (locked) return null;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: sub.template_name || 'Daily Briefing' }} />
      <ReportFill sub={sub} siteId={id} editingCompleted={!!done} isBriefing
        onDone={(sid, completed) => (completed ? router.replace(`/sites/${id}/hs/briefings/${sid}`) : router.back())} />
    </ScrollView>
  );
}
