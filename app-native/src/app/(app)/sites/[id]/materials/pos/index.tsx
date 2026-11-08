// Material PO's — the job's purchase orders without prices (change or cancel them; Andy, 8 Nov 2026), then the job's
// main order-files folder (770).
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { MaterialOrdersBrowser } from '@/components/MaterialOrdersBrowser';
import { SitePosCard } from '@/components/SiteOrders';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { page } from '@/theme/theme';

export default function MaterialPOs() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      {isManager(me) && <SitePosCard siteId={id} />}
      <MaterialOrdersBrowser siteId={id} folderId={null} />
    </ScrollView>
  );
}
