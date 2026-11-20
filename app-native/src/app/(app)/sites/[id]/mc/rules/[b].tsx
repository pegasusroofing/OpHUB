// A job's Site Rules & Layout sheet (Andy, 20 Nov 2026): built like the RAMS / CPP builders. The editor is
// components/SiteRulesEditor.tsx. Managers only (everyone signs the issued PDF in Site Rules & Layout).
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { SiteRulesEditor } from '@/components/SiteRulesEditor';
import { Muted } from '@/components/ui';
import { loadSiteRules } from '@/data/siteRules';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { page, space } from '@/theme/theme';

export default function SiteRulesScreen() {
  const { id, b } = useLocalSearchParams<{ id: string; b: string }>();
  const { me } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['siteRulesBuild', b], enabled: !!b, gcTime: 0, queryFn: () => loadSiteRules(b) });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted>;
  if (isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!data) return <Muted style={{ padding: space.l }}>Sheet not found.</Muted>;
  return (
    <ScrollView contentContainerStyle={page(820)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Site Rules' }} />
      <SiteRulesEditor key={data.row.id} mode="job" row0={data.row} initial={data.doc} siteId={id} />
    </ScrollView>
  );
}
