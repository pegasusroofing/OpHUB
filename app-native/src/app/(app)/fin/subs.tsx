// Finance › Subcontractors & Labour.
import { router, useLocalSearchParams } from 'expo-router';

import { FinPage } from '@/components/FinNav';
import { SubsLists, SubsStats } from '@/components/FinSubs';

export default function FinSubsPage() {
  const { tab = 'opinv', f } = useLocalSearchParams<{ tab?: 'opinv' | 'payrun' | 'orders' | 'apps' | 'cis' | 'rates'; f?: string }>();
  return (
    <FinPage title="Subcontractors & Labour" section="subs" sub={tab} onSub={(k) => (k === 'rates' ? router.push('/fin/directory?kind=labour' as never) : router.setParams({ tab: k }))} top={<SubsStats />}>
      <SubsLists key={`${tab}${f || ''}`} tab={tab === 'rates' ? 'opinv' : tab} f={f} />
    </FinPage>
  );
}
