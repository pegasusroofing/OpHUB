// The table rows used across the app on a phone (Andy, 11 Nov 2026: "table row style as the rest of the app"): a grey
// header row, then one row per item, every row the same height. Columns have a width, or one stretches; a column can
// show a second smaller line.
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { base } from '@/theme/theme';

export type PCol<T> = { l: string; w?: number; right?: boolean; main: (r: T) => ReactNode; sub?: (r: T) => ReactNode; tone?: (r: T) => string | undefined; bold?: boolean };

export function PhoneTable<T>({ cols, rows, keyOf, onRow, foot, label = 'Table' }: { cols: PCol<T>[]; rows: T[]; keyOf: (r: T) => string; onRow?: (r: T) => void; foot?: ReactNode; label?: string }) {
  const box = (c: PCol<T>) => (c.w ? { width: c.w } : { flex: 1, minWidth: 0 });
  return (
    <View accessibilityLabel={label} style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: '#F6F7F9' }}>
        {cols.map((c) => <Text key={c.l} numberOfLines={1} style={{ ...box(c), fontSize: 10.5, fontWeight: '700', color: base.slate, letterSpacing: 0.3, textAlign: c.right ? 'right' : 'left' }}>{c.l.toUpperCase()}</Text>)}
      </View>
      {rows.map((r) => (
        <Pressable key={keyOf(r)} disabled={!onRow} accessibilityRole={onRow ? 'button' : undefined} onPress={() => onRow?.(r)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 50, paddingVertical: 7, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
          {cols.map((c, i) => (
            <View key={c.l} style={{ ...box(c), alignItems: c.right ? 'flex-end' : 'flex-start' }}>
              <Text numberOfLines={1} style={{ fontSize: i === 0 ? 13 : 12, fontWeight: i === 0 || c.bold ? '600' : '500', color: c.tone?.(r) || base.ink }}>{c.main(r)}</Text>
              {c.sub ? <Text numberOfLines={1} style={{ fontSize: 10.5, color: base.slate, marginTop: 1 }}>{c.sub(r)}</Text> : null}
            </View>
          ))}
        </Pressable>
      ))}
      {foot}
    </View>
  );
}
