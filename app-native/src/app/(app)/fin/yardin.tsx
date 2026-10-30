// Finance › Yard stock › Book stock in — the same form drivers and managers use (9219zq).
import { Stack } from 'expo-router';

import DriverYard from '../driver/yard';

export default function FinYardIn() {
  return (
    <>
      <Stack.Screen options={{ title: 'Book Stock Into The Yard' }} />
      <DriverYard />
    </>
  );
}
