// A general survey (a report not linked to a project, 430 GENERAL_REPORTS): fill it
// in (?mode=fill) or view it, and rename its job name / address.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text } from 'react-native';

import { ReportAnswers } from '@/components/ReportAnswers';
import { ReportFill } from '@/components/ReportFill';
import { ReportPdfActions } from '@/components/ReportPdfActions';
import { promptText, useToast } from '@/components/toast';
import { Button, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { renameGeneral, useSubmission } from '@/data/reports';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, space } from '@/theme/theme';

export default function GeneralSurvey() {
  const { sub: subId, mode } = useLocalSearchParams<{ sub: string; mode?: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useSubmission(subId);
  const { data: people } = usePeople();
  if (!me) return null;
  const sub = data?.sub as (NonNullable<typeof data>['sub'] & { general_label?: string | null }) | undefined;
  if (isLoading || !sub) return <Muted style={{ padding: space.l }}>{isLoading ? 'Loading…' : 'Survey not found.'}</Muted>;
  const mgr = isManager(me);
  const fill = mode === 'fill' && mgr;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: sub.template_name || 'Survey' }} />
      <Pressable disabled={!mgr} onPress={async () => {
        const v = await promptText('Job name / address for this survey:', sub.general_label || '');
        if (v === null) return;
        if (await renameGeneral(sub.id, v.trim() || null)) { toast('Saved'); void qc.invalidateQueries({ queryKey: ['reportSub', sub.id] }); void qc.invalidateQueries({ queryKey: ['pmReports'] }); }
      }}>
        <Text style={{ fontWeight: '700', color: base.ink, marginBottom: 6 }}>{sub.general_label || 'No job name'}{mgr ? <Text style={{ color: base.blue, fontWeight: '400' }}>  · rename</Text> : null}</Text>
      </Pressable>
      {fill ? (
        <ReportFill sub={sub} siteId={`general/${me.org_id}`} editingCompleted={sub.status === 'completed'} isBriefing={false}
          onDone={(sid, completed) => (completed ? router.replace(`/pm/survey/${sid}` as never) : router.back())} />
      ) : (
        <>
          <SectionTitle>{sub.template_name}</SectionTitle>
          <Muted>Submitted {sub.submitted_at ? new Date(sub.submitted_at).toLocaleString('en-GB') : 'in progress'} by {nameOf(people, sub.submitted_by)}</Muted>
          <ReportAnswers sections={sub.sections || []} answers={sub.answers || {}} nameOf={(u) => nameOf(people, u)} />
          {mgr && <Button kind="ghost" title={sub.status === 'in_progress' ? 'Carry on filling in' : 'Edit Report'} onPress={() => router.push(`/pm/survey/${sub.id}?mode=fill` as never)} />}
          <ReportPdfActions sub={sub as never} />
        </>
      )}
    </ScrollView>
  );
}
