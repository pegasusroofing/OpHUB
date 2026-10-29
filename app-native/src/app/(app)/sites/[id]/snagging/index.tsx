// Snagging folder: Snagging, Variations and (managers) Reports. Ported from renderSnaggingFolder (490).
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { JobGrid, Tile } from '@/components/ui';
import { useTemplates } from '@/data/reports';
import { useSnagFolderCounts } from '@/data/snags';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { page } from '@/theme/theme';

export default function SnagFolder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { data } = useSnagFolderCounts(id);
  const mgr = !!me && isManager(me);
  const { data: tpls } = useTemplates(mgr ? me?.org_id : null);
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: mgr ? 'Inspections & Reports' : 'Snagging' }} />
      <JobGrid>
      <Tile icon="🏷" tint="#FBEEDE" title="Snagging" sub={data ? `${data.openSnags} open` : '…'} onPress={() => router.push(`/sites/${id}/snagging/list`)} />
      <Tile icon="✎" tint="#F0E4F5" title="Variations" sub={data ? `${data.liveVariations} live` : '…'} onPress={() => router.push(`/sites/${id}/snagging/variations`)} />
      {mgr && <Tile icon="📊" tint="#EDE7F6" title="Reports" sub={tpls ? `${tpls.length} template${tpls.length === 1 ? '' : 's'}` : '…'} onPress={() => router.push(`/sites/${id}/snagging/reports` as never)} />}
      </JobGrid>
    </ScrollView>
  );
}
