// The company's Construction Phase Plan template (Andy, 19 Nov 2026: "make sure there is a CPP template under the H&S
// settings also"): the wording of sections 2-18, safety advisor, waste licence, site hours, HSE details, emergency
// numbers and the contact sheet that every new plan starts from. Beta link only for now, like the builder.
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { ScrollView } from 'react-native';

import { CppEditor } from '@/components/CppEditor';
import { Muted } from '@/components/ui';
import { loadCppTemplate } from '@/data/cpp';
import { useAuth } from '@/lib/auth';
import { isBetaSite } from '@/lib/betaOnly';
import { isFullManager } from '@/lib/roles';
import { page, space } from '@/theme/theme';

export default function CppTemplateScreen() {
  const { me } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['cppTemplate', me?.org_id], enabled: !!me?.org_id, gcTime: 0, queryFn: () => loadCppTemplate(me?.org_id) });
  if (!me) return null;
  if (!isBetaSite()) return <Muted style={{ padding: space.l }}>The Construction Phase Plan template is on the website version of the app for now (app.operativehub.co.uk).</Muted>;
  if (!isFullManager(me)) return <Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted>;
  if (isLoading || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  return (
    <ScrollView contentContainerStyle={page(820)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'CPP Template' }} />
      <CppEditor mode="template" initial={data} orgId={me.org_id as string} />
    </ScrollView>
  );
}
