// Finance › Subcontractors & Labour.
import { router, useLocalSearchParams } from 'expo-router';

import { FinPage } from '@/components/FinNav';
import { SubsLists, SubsStats } from '@/components/FinSubs';

export default function FinSubsPage() {
  const { tab = 'opinv' } = useLocalSearchParams<{ tab?: 'opinv' | 'payrun' | 'orders' | 'apps' | 'cis' | 'rates' }>();
  return (
    <FinPage title="Subcontractors & Labour" section="subs" sub={tab} onSub={(k) => (k === 'rates' ? router.push('/fin/directory?kind=labour' as never) : router.setParams({ tab: k }))} top={<SubsStats />}>
      <SubsLists key={tab} tab={tab === 'rates' ? 'opinv' : tab} />
    </FinPage>
  );
}
