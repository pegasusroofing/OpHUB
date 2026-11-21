// Finance › Yard stock › Book stock in — the same form drivers and managers use (9219zq).
import { Stack } from 'expo-router';

import { Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { canEditFinance } from '@/lib/roles';
import { space } from '@/theme/theme';

import DriverYard from '../driver/yard';

export default function FinYardIn() {
  const { me } = useAuth();
  return (
    <>
      <Stack.Screen options={{ title: 'Book Stock Into The Yard' }} />
      {/* Booking stock in is a change: Finance – Edit only (Admin › People › Invites & Roles). */}
      {canEditFinance(me) ? <DriverYard /> : <Muted style={{ padding: space.l }}>Your role can view Finance but not change it. Ask your admin (Admin › People › Invites & Roles).</Muted>}
    </>
  );
}
