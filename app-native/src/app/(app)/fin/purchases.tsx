// Finance › Purchases (money out): orders, purchase invoices, plant hire, suppliers, and Price lists, which holds the
// Price book and the Price lists as two tabs of its own (Andy, 4 Nov 2026).
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { FinPage } from '@/components/FinNav';
import { PurchasesLists, PurchasesStats, usePurchaseBadges } from '@/components/FinPurchases';
import { PriceBook } from '@/components/FinPriceBook';
import { PurchaseQuotes } from '@/components/FinPurchaseQuotes';
import { useTheme } from '@/theme/theme';

export default function FinPurchases() {
  const { tab = 'orders', f } = useLocalSearchParams<{ tab?: 'orders' | 'invoices' | 'plant' | 'suppliers' | 'prices' | 'pricebook' | 'pricelists'; f?: string }>();
  const badges = usePurchaseBadges();
  const t = useTheme();
  const prices = tab === 'prices' || tab === 'pricebook' || tab === 'pricelists';
  const pt = tab === 'pricelists' ? 'pricelists' : 'pricebook';
  return (
    <FinPage title="Purchases" section="purchases" badges={badges} sub={prices ? 'prices' : tab} onSub={(k) => (k === 'statements' ? router.replace('/fin/statements' as never) : k === 'yard' ? router.replace('/fin/yard' as never) : router.setParams({ tab: (k === 'prices' ? 'pricebook' : k) as never }))} top={<PurchasesStats />}>
      {prices && (
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
          {([['pricebook', 'Price Book'], ['pricelists', 'Price Lists']] as const).map(([k, l]) => (
            <Pressable key={k} accessibilityRole="button" onPress={() => { if (pt !== k) router.setParams({ tab: k as never }); }} style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: pt === k ? t.brand1 : 'transparent' }}>
              <Text style={{ fontSize: 14, fontWeight: pt === k ? '700' : '600', color: pt === k ? '#111827' : '#6b7280' }}>{l}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {prices ? (pt === 'pricebook' ? <PriceBook /> : <PurchaseQuotes />) : <PurchasesLists key={`${tab}${f || ''}`} tab={tab as 'orders'} f={f} />}
    </FinPage>
  );
}
