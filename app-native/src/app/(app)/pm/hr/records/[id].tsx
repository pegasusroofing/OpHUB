// One person's HR folder, from HR › Employee Records (Andy, 14 Nov 2026).
import { Stack, useLocalSearchParams } from 'expo-router';

import { EmployeeRecord } from '@/components/EmployeeRecord';
import { useStaff } from '@/data/hrRecords';

export default function EmployeeRecordPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: staff = [] } = useStaff();
  return (
    <>
      <Stack.Screen options={{ title: staff.find((p) => p.id === id)?.name || 'Employee Record' }} />
      <EmployeeRecord userId={id} />
    </>
  );
}
