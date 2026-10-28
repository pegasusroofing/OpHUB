// Drawings, Spec's & Programme — the top level of a job's folders (810).
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { DrawingsBrowser } from '@/components/DrawingsBrowser';
import { space } from '@/theme/theme';

export default function Drawings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <DrawingsBrowser siteId={id} folderId={null} />
    </ScrollView>
  );
}
