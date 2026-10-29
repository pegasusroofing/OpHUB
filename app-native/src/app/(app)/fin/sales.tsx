// Finance › Sales (money in): applications & certificates, invoices, retention.
import { router, useLocalSearchParams } from 'expo-router';

import { FinPage } from '@/components/FinNav';
import { SalesLists, SalesStats } from '@/components/FinSales';

export default function FinSales() {
  const { tab = 'apps', f } = useLocalSearchParams<{ tab?: 'apps' | 'invoices' | 'retention'; f?: string }>();
  return (
    <FinPage title="Sales" section="sales" sub={tab} onSub={(k) => router.setParams({ tab: k })} top={<SalesStats />}>
      <SalesLists key={`${tab}${f || ''}`} tab={tab} f={f} />
    </FinPage>
  );
}
