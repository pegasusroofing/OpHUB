// Projects › a repair contract › Works Orders: the shared Works Orders screen (components/WorksOrders.tsx).
import { useLocalSearchParams } from 'expo-router';

import { WorksOrders } from '@/components/WorksOrders';

export default function WorksOrdersPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <WorksOrders siteId={id} />;
}
