// A repair job in Finance (Andy, 7 Nov 2026): the same job hub as Projects, with the Money box (quoted, costs so far,
// margin, the invoice) and the bar running on to Invoiced and Paid.
import { useLocalSearchParams } from 'expo-router';

import { RepairHub } from '@/components/RepairHub';

export default function FinRepairJob() {
  const { id, rj } = useLocalSearchParams<{ id: string; rj: string }>();
  if (!id || !rj) return null;
  return <RepairHub siteId={id} jobId={rj} money />;
}
