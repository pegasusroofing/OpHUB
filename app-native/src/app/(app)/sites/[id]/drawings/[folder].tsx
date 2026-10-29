// One folder inside Drawings, Spec's & Programme (810).
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { DrawingsBrowser } from '@/components/DrawingsBrowser';
import { page, space } from '@/theme/theme';

export default function DrawingFolder() {
  const { id, folder } = useLocalSearchParams<{ id: string; folder: string }>();
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <DrawingsBrowser siteId={id} folderId={folder} />
    </ScrollView>
  );
}
