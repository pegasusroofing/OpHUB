// Manager pages reached from the PM / admin home (185 …): all-projects reports,
// to-dos, calendar, the HUB, deliveries, operatives, HR and the Admin Centre.
import { Stack } from 'expo-router';

import { stackHeader } from '@/components/AppBar';

export default function PmLayout() {
  return (
    <Stack screenOptions={stackHeader} />
  );
}
