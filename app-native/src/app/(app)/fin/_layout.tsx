// OpHUB Finance pages (900–922 in the current app).
import { Stack } from 'expo-router';

import { base } from '@/theme/theme';

export default function FinLayout() {
  return (
    <Stack screenOptions={{
      headerTintColor: base.ink, headerStyle: { backgroundColor: base.card }, headerTitleStyle: { fontWeight: '800' },
      headerBackButtonDisplayMode: 'minimal', contentStyle: { backgroundColor: base.paper },
    }} />
  );
}
