// Finance › Purchases (money out): orders, purchase invoices, plant hire, suppliers, price book.
import { router, useLocalSearchParams } from 'expo-router';

import { FinPage } from '@/components/FinNav';
import { PurchasesLists, PurchasesStats } from '@/components/FinPurchases';
import { PriceBook } from '@/components/FinPriceBook';

export default function FinPurchases() {
  const { tab = 'orders', f } = useLocalSearchParams<{ tab?: 'orders' | 'invoices' | 'plant' | 'suppliers' | 'pricebook'; f?: string }>();
  return (
    <FinPage title="Purchases" section="purchases" sub={tab} onSub={(k) => router.setParams({ tab: k })}>
      <PurchasesStats />
      {tab === 'pricebook' ? <PriceBook /> : <PurchasesLists key={`${tab}${f || ''}`} tab={tab} f={f} />}
    </FinPage>
  );
}
