// My Tools page. Ported from renderMyTools (670).
import { Stack } from 'expo-router';
import { ScrollView } from 'react-native';

import { MyToolsList } from '@/components/MyToolsList';
import { page, space } from '@/theme/theme';

export default function MyTools() {
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'My Tools' }} />
      <MyToolsList />
    </ScrollView>
  );
}
