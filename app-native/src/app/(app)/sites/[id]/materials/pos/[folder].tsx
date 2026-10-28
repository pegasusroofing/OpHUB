// One folder inside Material PO's (770).
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { MaterialOrdersBrowser } from '@/components/MaterialOrdersBrowser';
import { space } from '@/theme/theme';

export default function MaterialPOFolder() {
  const { id, folder } = useLocalSearchParams<{ id: string; folder: string }>();
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <MaterialOrdersBrowser siteId={id} folderId={folder} />
    </ScrollView>
  );
}
