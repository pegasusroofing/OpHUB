// The company's Site Rules template (Admin › H&S, Andy 20 Nov 2026): the numbered rules, introduction and standard site
// information every job's Site Rules sheet starts from.
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { ScrollView } from 'react-native';

import { SiteRulesEditor } from '@/components/SiteRulesEditor';
import { Muted } from '@/components/ui';
import { loadSiteRulesTemplate } from '@/data/siteRules';
import { useAuth } from '@/lib/auth';
import { isFullManager } from '@/lib/roles';
import { page, space } from '@/theme/theme';

export default function SiteRulesTemplateScreen() {
  const { me } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['siteRulesTemplate', me?.org_id], enabled: !!me?.org_id, gcTime: 0, queryFn: () => loadSiteRulesTemplate(me?.org_id) });
  if (!me) return null;
  if (!isFullManager(me)) return <Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted>;
  if (isLoading || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  return (
    <ScrollView contentContainerStyle={page(820)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Site Rules Template' }} />
      <SiteRulesEditor mode="template" initial={data} orgId={me.org_id as string} />
    </ScrollView>
  );
}
