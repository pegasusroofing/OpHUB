// Finance › Sales (money in): applications & certificates, invoices, retention.
import { router, useLocalSearchParams } from 'expo-router';

import { FinPage } from '@/components/FinNav';
import { NewSalesButton, SalesLists, SalesStats, useSalesBadges } from '@/components/FinSales';

export default function FinSales() {
  const { tab = 'apps', f } = useLocalSearchParams<{ tab?: 'apps' | 'invoices' | 'retention'; f?: string }>();
  const badges = useSalesBadges();
  return (
    <FinPage title="Sales" section="sales" badges={badges} sub={tab} onSub={(k) => router.setParams({ tab: k })} top={<SalesStats />}
      subRight={tab === 'apps' ? <NewSalesButton what="application" /> : tab === 'invoices' ? <NewSalesButton what="invoice" /> : undefined}>
      <SalesLists key={`${tab}${f || ''}`} tab={tab} f={f} />
    </FinPage>
  );
}
