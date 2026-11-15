// Long lists draw their first 50 rows, then a Show More button for the next 50 (speed review, 15 Nov 2026: drawing
// 1,500 purchase invoices held the screen up for seconds). Only the drawing is cut short: filters, searches, totals,
// counts and exports still use every row.
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui';

export const SHOW_STEP = 50;

/** The rows to draw, and the Show More button (null when they're all drawn). */
export function useShowMore<T>(list: T[], step = SHOW_STEP): { rows: T[]; more: ReactNode } {
  const [n, setN] = useState(step);
  const rows = list.length > n ? list.slice(0, n) : list;
  const left = list.length - rows.length;
  const more = left > 0 ? (
    <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}>
      <Button kind="ghost" small title={`Show More (${left.toLocaleString('en-GB')} Left)`} onPress={() => setN(n + step)} />
    </View>
  ) : null;
  return { rows, more };
}

/** The same for a list drawn inside a function: children draws the rows it's given. */
export function ShowMore<T>({ items, step = SHOW_STEP, children }: { items: T[]; step?: number; children: (rows: T[]) => ReactNode }) {
  const { rows, more } = useShowMore(items, step);
  return <>{children(rows)}{more}</>;
}
