// Finance › Purchases (money out): orders, purchase invoices, plant hire and Price Lists. Opens on Purchase Invoices, the first tab
// (Andy, 14 Nov 2026), as a project's Purchases does. Price Lists is one tab: a table of suppliers, each opening their
// prices (the Price Book's learned prices are in there too; Andy, 14 Nov 2026).
import { router, useLocalSearchParams } from 'expo-router';


import { FinPage } from '@/components/FinNav';
import { NewPoButton, PurchasesLists, PurchasesStats, usePurchaseBadges } from '@/components/FinPurchases';
import { PriceLists } from '@/components/FinPriceLists';
import { useDesk } from '@/theme/theme';


export default function FinPurchases() {
  const { tab = 'invoices', f, sup } = useLocalSearchParams<{ tab?: 'orders' | 'invoices' | 'plant' | 'suppliers' | 'prices' | 'pricebook' | 'pricelists'; f?: string; sup?: string }>();
  const badges = usePurchaseBadges();
  const desk = useDesk();
  const prices = tab === 'prices' || tab === 'pricebook' || tab === 'pricelists';
  return (
    <FinPage title="Purchases" section="purchases" badges={badges} subRight={tab === 'orders' && desk ? <NewPoButton /> : undefined} sub={prices ? 'prices' : tab} onSub={(k) => (k === 'statements' ? router.replace('/fin/statements' as never) : k === 'yard' ? router.replace('/fin/yard' as never) : router.replace(`/fin/purchases?tab=${k}` as never))} top={<PurchasesStats />}>
      {prices ? <PriceLists key={sup || ''} sup={typeof sup === 'string' ? sup : undefined} /> : <PurchasesLists key={`${tab}${f || ''}`} tab={tab as 'orders'} f={f} />}
    </FinPage>
  );
}
