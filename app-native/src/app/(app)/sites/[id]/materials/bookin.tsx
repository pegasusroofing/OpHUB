// Book Into Yard from a job's Materials (Andy, 3 Nov 2026): the same form as the drivers' one, with the Materials tabs
// kept on show so the way back is there.
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { MatTabs } from '@/components/MatTabs';
import { YardBookIn } from '@/components/YardBookIn';
import { yardCanEdit } from '@/data/materials';
import { useAuth } from '@/lib/auth';
import { isFinanceUser } from '@/lib/roles';
import { page } from '@/theme/theme';

export default function SiteBookIn() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const can = yardCanEdit(me, isFinanceUser(me, org));
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Book Into Yard' }} />
      <MatTabs siteId={id} on="bookin" yard={can} />
      <YardBookIn canAddItems={can} stockId={null} />
    </ScrollView>
  );
}
