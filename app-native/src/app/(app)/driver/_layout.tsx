import { Stack } from 'expo-router';

import { stackHeader } from '@/components/AppBar';

export default function DriverLayout() {
  return (
    <Stack screenOptions={stackHeader}>
      <Stack.Screen name="checkin" options={{ title: 'Check In / Out' }} />
      <Stack.Screen name="schedule" options={{ title: 'Delivery Schedule' }} />
      <Stack.Screen name="vehicle" options={{ title: 'Vehicle Checklist' }} />
      <Stack.Screen name="timeoff" options={{ title: 'Book Time Off' }} />
      <Stack.Screen name="yard" options={{ title: 'Book Stock Into The Yard' }} />
    </Stack>
  );
}
