// Finance › Subcontractors & Labour.
import { router, useLocalSearchParams } from 'expo-router';

import { FinPage } from '@/components/FinNav';
import { SubsLists, SubsStats, useSubsBadges } from '@/components/FinSubs';

export default function FinSubsPage() {
  const { tab = 'opinv', f } = useLocalSearchParams<{ tab?: 'opinv' | 'wages' | 'payrun' | 'orders' | 'apps' | 'cis' | 'rates'; f?: string }>();
  const badges = useSubsBadges();
  return (
    <FinPage title="Subcontractors & Labour" section="subs" badges={badges} sub={tab} onSub={(k) => (k === 'rates' ? router.replace('/fin/directory?kind=labour&from=subs' as never) : router.setParams({ tab: k }))} top={<SubsStats />}>
      <SubsLists key={`${tab}${f || ''}`} tab={tab === 'rates' ? 'opinv' : tab} f={f} />
    </FinPage>
  );
}
