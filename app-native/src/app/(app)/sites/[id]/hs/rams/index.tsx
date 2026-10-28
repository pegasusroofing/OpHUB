import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { HsDocList } from '@/components/HsDocList';
import { HsDocUpload } from '@/components/HsDocUpload';
import { PolicyCard } from '@/components/PolicyCard';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { deleteBuild, useSiteBuilds } from '@/data/ramsBuilder';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { isFullManager, isManager } from '@/lib/roles';
import { base, space } from '@/theme/theme';

/** RAMS Builder card (586 ramsBuilderCardHtml): this job's drafts and a start button. PMs and admins only. */
function BuilderCard({ siteId }: { siteId: string }) {
  const { data: builds = [] } = useSiteBuilds(siteId);
  const qc = useQueryClient();
  const toast = useToast();
  return (
    <Card>
      <SectionTitle>RAMS Builder</SectionTitle>
      <Muted style={{ marginBottom: 8 }}>Write a Risk Assessment and Method Statement from your library, and issue them as two documents.</Muted>
      {builds.map((b) => (
        <Pressable key={b.id} onPress={() => router.push(`/sites/${siteId}/hs/rams/build/${b.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderTopWidth: 1, borderColor: base.line }}>
          <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{b.title}</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, overflow: 'hidden', backgroundColor: b.status === 'issued' ? '#DDF3E3' : '#EEE', color: b.status === 'issued' ? '#1E7A3C' : '#555' }}>{b.status === 'issued' ? `Issued rev ${b.revision}` : 'Draft'}</Text>
          <Pressable hitSlop={8} onPress={async () => {
            if (!(await confirmAsk(`Delete "${b.title}"?${b.status === 'issued' ? '\n\nThe issued documents stay in the RAMS list — only this editable copy is deleted.' : ''}`, 'Delete'))) return;
            toast((await deleteBuild(b.id)) ? 'Deleted' : 'Could not delete — try again.');
            void qc.invalidateQueries({ queryKey: ['ramsBuilds', siteId] });
          }}><Text>🗑</Text></Pressable>
          <Text style={{ color: base.slate }}>›</Text>
        </Pressable>
      ))}
      <View style={{ marginTop: 8 }}><Button title="+ Start new RAMS" onPress={() => router.push(`/sites/${siteId}/hs/rams/new` as never)} /></View>
    </Card>
  );
}

export default function Rams() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: site } = useSite(id);
  const { me } = useAuth();
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'RAMS' }} />
      <PolicyCard />
      {site && me && isFullManager(me) && <BuilderCard siteId={site.id} />}
      {site && me && isManager(me) && <HsDocUpload kind="rams" site={site} />}
      {site ? <HsDocList kind="rams" site={site} /> : <Muted>Loading…</Muted>}
    </ScrollView>
  );
}
