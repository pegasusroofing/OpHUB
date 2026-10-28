// A LOLER inspection, read-only (750 / 430), with Edit Report for managers.
// Only LOLER inspections on this job open here.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { ReportAnswers } from '@/components/ReportAnswers';
import { Button, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { useSubmission } from '@/data/reports';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { space } from '@/theme/theme';

export default function LolerView() {
  const { id, sub: subId } = useLocalSearchParams<{ id: string; sub: string }>();
  const { me } = useAuth();
  const { data, isLoading } = useSubmission(subId);
  const { data: people } = usePeople();
  if (!me) return null;
  const sub = data?.sub;
  if (isLoading || !sub || sub.site_id !== id) return <Muted style={{ padding: space.l }}>{isLoading ? 'Loading…' : 'Inspection not found.'}</Muted>;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'LOLER Inspection' }} />
      <SectionTitle>{String(sub.answers?.loler_make_model || sub.template_name)}</SectionTitle>
      <Muted>Submitted {sub.submitted_at ? new Date(sub.submitted_at).toLocaleString('en-GB') : 'in progress'} by {nameOf(people, sub.submitted_by)}</Muted>
      <ReportAnswers sections={sub.sections || []} answers={sub.answers || {}} nameOf={(u) => nameOf(people, u)} />
      {isManager(me) && <Button kind="ghost" title="Edit Report" onPress={() => router.push(`/sites/${id}/hs/loler/fill/${sub.id}` as never)} />}
      <Muted style={{ marginTop: space.m }}>Export PDF and Email Report are still in the current app for now.</Muted>
    </ScrollView>
  );
}
