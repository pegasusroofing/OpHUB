// Fill in (or, for a manager, edit a completed) report (430 renderReportFill).
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView } from 'react-native';

import { ReportFill } from '@/components/ReportFill';
import { Muted } from '@/components/ui';
import { useSubmission } from '@/data/reports';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { page, space } from '@/theme/theme';

export default function ReportFillScreen() {
  const { id, sub: subId } = useLocalSearchParams<{ id: string; sub: string }>();
  const { me } = useAuth();
  const { data, isLoading } = useSubmission(subId);
  const sub = data?.sub;
  const done = sub?.status === 'completed';
  // A completed report stays editable by a manager; a briefing only until its first signature.
  const locked = !!sub && done && (!me || !isManager(me) || (data?.isBriefing && data.signed));
  useEffect(() => { if (locked && sub) router.replace(`/sites/${id}/snagging/reports/view/${sub.id}` as never); }, [locked, sub, id]);
  if (!me) return null;
  if (isLoading || !sub) return <Muted style={{ padding: space.l }}>{isLoading ? 'Loading…' : 'Inspection not found.'}</Muted>;
  if (locked) return null;
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: sub.template_name || 'Inspection' }} />
      <ReportFill sub={sub} siteId={id} editingCompleted={done} isBriefing={!!data?.isBriefing}
        onDone={(sid, completed) => (completed ? router.replace(`/sites/${id}/snagging/reports/view/${sid}` as never) : router.back())} />
    </ScrollView>
  );
}
