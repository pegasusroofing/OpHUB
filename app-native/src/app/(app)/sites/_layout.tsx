import { Stack } from 'expo-router';

import { base } from '@/theme/theme';

export default function SitesLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: base.ink,
        headerStyle: { backgroundColor: base.card },
        headerTitleStyle: { fontWeight: '800' },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: base.paper },
      }}>
      <Stack.Screen name="index" options={{ title: 'Projects' }} />
    </Stack>
  );
}
