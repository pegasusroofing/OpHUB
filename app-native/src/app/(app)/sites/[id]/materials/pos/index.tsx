// Material PO's — the job's main order-files folder (770).
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { MaterialOrdersBrowser } from '@/components/MaterialOrdersBrowser';
import { page, space } from '@/theme/theme';

export default function MaterialPOs() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <MaterialOrdersBrowser siteId={id} folderId={null} />
    </ScrollView>
  );
}
