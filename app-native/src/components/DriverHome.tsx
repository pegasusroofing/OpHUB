// Driver home: Check In / Out, Today's Schedule, Vehicle Checklist, Book Time Off.
// Ported from renderDriverHome (840) and the time-off tile (9219zz).
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Text } from 'react-native';

import { Muted, Screen, Tile } from '@/components/ui';
import { useDriverDay, useDriverStatus, useTimeOff } from '@/data/driver';
import { useAuth } from '@/lib/auth';
import { dtoFmt, localISODate } from '@/lib/rules/driver';
import { base } from '@/theme/theme';

export function DriverHome() {
  const { me } = useAuth();
  const status = useDriverStatus();
  const day = useDriverDay(localISODate(new Date()));
  const off = useTimeOff();
  useFocusEffect(useCallback(() => { void status.refetch(); void day.refetch(); void off.refetch(); }, [status.refetch, day.refetch, off.refetch])); // eslint-disable-line react-hooks/exhaustive-deps
  const s = status.data;
  const pending = (day.data?.tasks ?? []).filter((t) => t.status !== 'completed').length;
  const next = off.data?.[0];
  return (
    <Screen>
      <Text style={{ fontSize: 21, fontWeight: '800', color: base.ink }}>{me?.name}</Text>
      <Muted style={{ marginBottom: 14 }}>Delivery Driver</Muted>
      <Tile icon="📍" tint={s?.onDuty ? base.okBg : '#E7E9EE'} title="Check In / Out"
        sub={s ? (s.openBreak ? 'On a break' : s.onDuty ? 'Currently checked in' : 'Not checked in') : '…'} onPress={() => router.push('/driver/checkin')} />
      <Tile icon="📅" tint={base.blueBg} title="Today's Schedule" sub={`${pending} ${pending === 1 ? 'delivery' : 'deliveries'} today`} onPress={() => router.push('/driver/schedule')} />
      <Tile icon="🚐" tint={base.warnBg} title="Vehicle Checklist" sub="Weekly inspection" onPress={() => router.push('/driver/vehicle')} />
      <Tile icon="🌴" tint="#ECFDF3" title="Book Time Off"
        sub={next ? `Next: ${next.start_date === next.end_date ? dtoFmt(next.start_date) : `${dtoFmt(next.start_date)} – ${dtoFmt(next.end_date)}`}` : 'Pick a day or a range'}
        onPress={() => router.push('/driver/timeoff')} />
      <Tile icon="📦" tint="#EEF4FF" title="Book Stock Into The Yard" sub="Deliveries and leftovers" onPress={() => router.push('/driver/yard')} />
    </Screen>
  );
}
