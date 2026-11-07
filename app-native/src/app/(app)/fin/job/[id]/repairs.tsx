// Finance › a repair contract › Live Jobs (Andy, 7 Nov 2026): in place of the Bill of Quantities / Variations, the same
// Works Orders screen as Projects (the boxes, + New Job, the jobs), so a job can be worked from either and both stay in
// step. Opening a job shows its hub with the money and Raise Invoice; in Completed Works - To Invoice, tick jobs to put
// them on one invoice. Costs are booked to the contract, then to the job, as with plots. (The job's header and tabs
// come from the app bar, as on every Finance job page.)
import { Stack, useLocalSearchParams } from 'expo-router';

import { WorksOrders } from '@/components/WorksOrders';

export default function FinRepairs() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: 'Live Jobs' }} />
      <WorksOrders siteId={id} finance />
    </>
  );
}
