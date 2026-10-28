// My Tools page. Ported from renderMyTools (670).
import { Stack } from 'expo-router';
import { ScrollView } from 'react-native';

import { MyToolsList } from '@/components/MyToolsList';
import { space } from '@/theme/theme';

export default function MyTools() {
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'My Tools' }} />
      <MyToolsList />
    </ScrollView>
  );
}
