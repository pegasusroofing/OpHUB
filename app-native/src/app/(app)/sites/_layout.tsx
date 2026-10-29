import { Stack } from 'expo-router';

import { stackHeader } from '@/components/AppBar';

export default function SitesLayout() {
  return (
    <Stack screenOptions={stackHeader}>
      <Stack.Screen name="index" options={{ title: 'Projects' }} />
    </Stack>
  );
}
