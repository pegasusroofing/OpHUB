// One folder inside Drawings, Spec's & Programme (810).
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { DrawingsBrowser } from '@/components/DrawingsBrowser';
import { space } from '@/theme/theme';

export default function DrawingFolder() {
  const { id, folder } = useLocalSearchParams<{ id: string; folder: string }>();
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <DrawingsBrowser siteId={id} folderId={folder} />
    </ScrollView>
  );
}
