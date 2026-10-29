// Finance › New project (9219n openFinNewJob). During the Finance trial new
// jobs are set up in Projects, not from Finance (the sandbox company and
// Finance-only companies excepted — that full form is still in the current app).
import { router, Stack } from 'expo-router';
import { ScrollView } from 'react-native';

import { Button, Card, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { FIN_SANDBOX_ORGS, FIN_TRIAL, FIN_TRIAL_MSG } from '@/lib/rules/finance';
import { space } from '@/theme/theme';

export default function FinNewJob() {
  const { me } = useAuth();
  const blocked = FIN_TRIAL && !(me?.org_id && FIN_SANDBOX_ORGS.includes(me.org_id));
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 700, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'New project' }} />
      <Card><Muted>{blocked ? `${FIN_TRIAL_MSG} — set new jobs up in Projects. Once a job exists there, its Finance page is ready here.` : 'Setting up a new project from Finance (number, client, contract value, billing) is still done in the current app for now.'}</Muted></Card>
      <Button title="Go to Projects" onPress={() => router.push('/sites' as never)} />
    </ScrollView>
  );
}
