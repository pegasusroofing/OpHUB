// Filling in a LOLER inspection (750) on the report engine. Managers only.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView } from 'react-native';

import { ReportFill } from '@/components/ReportFill';
import { Muted } from '@/components/ui';
import { useSubmission } from '@/data/reports';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { space } from '@/theme/theme';

export default function LolerFill() {
  const { id, sub: subId } = useLocalSearchParams<{ id: string; sub: string }>();
  const { me } = useAuth();
  const { data, isLoading } = useSubmission(subId);
  const sub = data?.sub;
  // Only this job's submissions open here.
  const locked = !!sub && (!me || !isManager(me) || sub.site_id !== id);
  useEffect(() => { if (locked && sub) router.replace(`/sites/${id}/hs/loler/view/${sub.id}` as never); }, [locked, sub, id]);
  if (!me) return null;
  if (isLoading || !sub) return <Muted style={{ padding: space.l }}>{isLoading ? 'Loading…' : 'Inspection not found.'}</Muted>;
  if (locked) return null;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'LOLER Inspection' }} />
      <ReportFill sub={sub} siteId={id} editingCompleted={sub.status === 'completed'} isBriefing={false}
        onDone={(sid, completed) => (completed ? router.replace(`/sites/${id}/hs/loler/view/${sid}` as never) : router.back())} />
    </ScrollView>
  );
}
