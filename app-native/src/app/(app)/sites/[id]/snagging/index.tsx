// Snagging folder: Snagging and Variations. Ported from renderSnaggingFolder (490).
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { Muted, Tile } from '@/components/ui';
import { useSnagFolderCounts } from '@/data/snags';
import { space } from '@/theme/theme';

export default function SnagFolder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useSnagFolderCounts(id);
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Snagging' }} />
      <Tile icon="🏷" tint="#FBEEDE" title="Snagging" sub={data ? `${data.openSnags} open` : '…'} onPress={() => router.push(`/sites/${id}/snagging/list`)} />
      <Tile icon="✎" tint="#F0E4F5" title="Variations" sub={data ? `${data.liveVariations} live` : '…'} onPress={() => router.push(`/sites/${id}/snagging/variations`)} />
      <Muted style={{ marginTop: space.m }}>Reports (managers) come with the PM screens.</Muted>
    </ScrollView>
  );
}
