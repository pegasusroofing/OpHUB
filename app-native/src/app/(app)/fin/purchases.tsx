// Finance › Purchases (money out): orders, purchase invoices, plant hire, suppliers, and Price lists, which holds the
// Price book and the Price lists as two tabs of its own (Andy, 4 Nov 2026). Opens on Purchase Invoices, the first tab
// (Andy, 14 Nov 2026), as a project's Purchases does.
import { router, useLocalSearchParams } from 'expo-router';


import { FinPage, FinTabs } from '@/components/FinNav';
import { NewPoButton, PurchasesLists, PurchasesStats, usePurchaseBadges } from '@/components/FinPurchases';
import { PriceBook } from '@/components/FinPriceBook';
import { PurchaseQuotes } from '@/components/FinPurchaseQuotes';
import { useDesk } from '@/theme/theme';


export default function FinPurchases() {
  const { tab = 'invoices', f } = useLocalSearchParams<{ tab?: 'orders' | 'invoices' | 'plant' | 'suppliers' | 'prices' | 'pricebook' | 'pricelists'; f?: string }>();
  const badges = usePurchaseBadges();
  const desk = useDesk();
  const prices = tab === 'prices' || tab === 'pricebook' || tab === 'pricelists';
  const pt = tab === 'pricelists' ? 'pricelists' : 'pricebook';
  return (
    <FinPage title="Purchases" section="purchases" badges={badges} subRight={tab === 'orders' && desk ? <NewPoButton /> : undefined} sub={prices ? 'prices' : tab} onSub={(k) => (k === 'statements' ? router.replace('/fin/statements' as never) : k === 'yard' ? router.replace('/fin/yard' as never) : router.setParams({ tab: (k === 'prices' ? 'pricebook' : k) as never }))} top={<PurchasesStats />}>
      {prices && <FinTabs items={[['pricebook', 'Price Book'], ['pricelists', 'Price Lists']]} value={pt} onChange={(k) => { if (pt !== k) router.setParams({ tab: k as never }); }} />}
      {prices ? (pt === 'pricebook' ? <PriceBook /> : <PurchaseQuotes />) : <PurchasesLists key={`${tab}${f || ''}`} tab={tab as 'orders'} f={f} />}
    </FinPage>
  );
}
