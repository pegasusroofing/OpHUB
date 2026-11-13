// The tabs across Requests and Collections, the same on both so they stay put when you move between them. The underlined
// tab style used across the app, not buttons (Andy, 13 Nov 2026).
import { router } from 'expo-router';

import { FinTabs } from '@/components/FinNav';

export type MatTabKey = 'pending' | 'collect' | 'done' | 'yard' | 'bookin';

export function MatTabs({ siteId, on, collectN, yard, onPick }: { siteId: string; on: MatTabKey; collectN?: number; yard?: boolean; onPick?: (k: 'pending' | 'done') => void }) {
  const options: [MatTabKey, string, number?][] = [['pending', 'Requests'], ['collect', 'Collections', collectN || undefined], ['done', 'Completed'], ...(yard ? [['yard', 'Yard Stock'], ['bookin', 'Book Into Yard']] as [MatTabKey, string][] : [])];
  return (
    <FinTabs value={on} items={options} onChange={(k) => {
      if (k === on) return;
      // Each tab replaces the last, so Back always goes up to Materials; Book Into Yard stays in the job (Andy, 3 Nov 2026).
      if (k === 'yard') { router.replace(`/sites/${siteId}/materials/yard` as never); return; }
      if (k === 'bookin') { router.replace(`/sites/${siteId}/materials/bookin` as never); return; }
      if (k === 'collect') { router.replace(`/sites/${siteId}/materials/collections` as never); return; }
      if (onPick) onPick(k as 'pending' | 'done'); else router.replace(`/sites/${siteId}/materials/requests?tab=${k}` as never);
    }} />
  );
}
