// Extra steps for the trail under the top bar (Projects › Job › Drawings › Roof plans), so the row
// below the header takes you back up a level or two. A page sets its own trail; it is cleared when
// the page goes.
import { useEffect, useSyncExternalStore } from 'react';

export type Crumb = [label: string, href: string | null];
let trail: { path: string; crumbs: Crumb[] } | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function usePageCrumbs(path: string, crumbs: Crumb[] | null) {
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    if (!crumbs) return;
    trail = { path, crumbs: JSON.parse(key) as Crumb[] }; emit();
    return () => { if (trail?.path === path) { trail = null; emit(); } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);
}

export function useTrail(path: string): Crumb[] | null {
  const t = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => trail, () => trail);
  return t && t.path === path ? t.crumbs : null;
}
