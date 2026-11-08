// Materials › Subcontract Orders (Andy, 8 Nov 2026): who's doing what on the job, raised and finished in Projects.
// Finance adds the value, CIS and retention, and pays their applications.
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { SubOrdersList } from '@/components/SiteOrders';
import { Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { page, space } from '@/theme/theme';

export default function SubcontractOrders() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Subcontract Orders' }} />
      {isManager(me) ? <SubOrdersList siteId={id} /> : <Muted style={{ padding: space.l }}>Managers only.</Muted>}
    </ScrollView>
  );
}
