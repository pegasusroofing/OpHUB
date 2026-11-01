// The tabs across Material Requests and Collections, the same on both so they stay put when you move between them.
import { router } from 'expo-router';

import { FilterRow } from '@/components/ui';

export type MatTabKey = 'pending' | 'collect' | 'done' | 'yard' | 'bookin';

export function MatTabs({ siteId, on, collectN, yard, onPick }: { siteId: string; on: MatTabKey; collectN?: number; yard?: boolean; onPick?: (k: 'pending' | 'done') => void }) {
  const options: [MatTabKey, string][] = [['pending', 'Material Requests'], ['collect', `Collections${collectN ? ` (${collectN})` : ''}`], ['done', 'Completed'], ...(yard ? [['yard', 'Yard Stock'], ['bookin', 'Book into yard']] as [MatTabKey, string][] : [])];
  return (
    <FilterRow value={on} options={options} onChange={(k) => {
      if (k === on) return;
      if (k === 'yard') { router.push(`/sites/${siteId}/materials/yard` as never); return; }
      if (k === 'bookin') { router.push('/driver/yard' as never); return; }
      if (k === 'collect') { router.push(`/sites/${siteId}/materials/collections` as never); return; }
      if (onPick) onPick(k); else router.replace(`/sites/${siteId}/materials/requests?tab=${k}` as never);
    }} />
  );
}
