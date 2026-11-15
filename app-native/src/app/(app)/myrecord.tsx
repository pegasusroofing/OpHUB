// My Employee Record (Andy, 14 Nov 2026): everyone's own HR folder, whatever their role (operatives and drivers too,
// from My Account): keep their details up to date, read policies, download payslips, see goals, feedback and appraisals.
import { Stack } from 'expo-router';

import { EmployeeRecord } from '@/components/EmployeeRecord';
import { useAuth } from '@/lib/auth';

export default function MyRecord() {
  const { me } = useAuth();
  if (!me) return null;
  return (
    <>
      <Stack.Screen options={{ title: 'My Employee Record' }} />
      <EmployeeRecord userId={me.id} />
    </>
  );
}
