// Manager pages reached from the PM / admin home (185 …): all-projects reports,
// to-dos, calendar, the HUB, deliveries, operatives, HR and the Admin Centre.
import { Stack } from 'expo-router';

import { base } from '@/theme/theme';

export default function PmLayout() {
  return (
    <Stack screenOptions={{
      headerTintColor: base.ink, headerStyle: { backgroundColor: base.card }, headerTitleStyle: { fontWeight: '800' },
      headerBackButtonDisplayMode: 'minimal', contentStyle: { backgroundColor: base.paper },
    }} />
  );
}
