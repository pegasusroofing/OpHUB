// The Finance list table on a computer (9219f grid / 9219x totals bar): underlined
// uppercase column headings, centred cells, a row per record, and the
// company-colour totals bar underneath. Phones keep the card list.
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { heading } from '@/lib/fonts';
import { base, useTheme } from '@/theme/theme';

export type FinCol<T> = { k: string; l: string; flex?: number; min?: number; render: (r: T) => ReactNode };

export function FinTable<T>({ cols, rows, keyOf, onRow, foot }: { cols: FinCol<T>[]; rows: T[]; keyOf: (r: T) => string; onRow?: (r: T) => void; foot?: ReactNode }) {
  const t = useTheme();
  const cell = (c: FinCol<T>) => ({ flex: c.flex ?? 1, minWidth: c.min ?? 80, paddingHorizontal: 6, alignItems: 'center' as const, justifyContent: 'center' as const });
  return (
    <View>
      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }} showsHorizontalScrollIndicator={false}>
        <View style={{ flex: 1, minWidth: '100%' }}>
          <View style={{ flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 8 }}>
            {cols.map((c) => <View key={c.k} style={cell(c)}><Text style={{ fontSize: 10.5, fontWeight: '800', letterSpacing: 0.7, color: base.ink, textDecorationLine: 'underline', textTransform: 'uppercase' }}>{c.l}</Text></View>)}
          </View>
          <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
            {rows.map((r, i) => (
              <Pressable key={keyOf(r)} onPress={onRow ? () => onRow(r) : undefined}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 8, paddingHorizontal: 8, borderTopWidth: i ? 1 : 0, borderTopColor: '#F0F1F4' }, pressed && { backgroundColor: '#F8F9FB' }]}>
                {cols.map((c) => <View key={c.k} style={cell(c)}>{c.render(r)}</View>)}
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      {!!foot && <View style={{ marginTop: 10, backgroundColor: t.brand1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>{foot}</View>}
    </View>
  );
}

/** A plain centred table cell. */
export const Cell = ({ children, bold, tone }: { children: ReactNode; bold?: boolean; tone?: string }) => (
  <Text numberOfLines={2} style={[bold ? heading(700) : {}, { fontSize: 12.5, color: tone || base.ink, textAlign: 'center', fontWeight: bold ? '700' : '400' }]}>{children}</Text>
);
/** Text in the totals bar. */
export const FootText = ({ children, bold }: { children: ReactNode; bold?: boolean }) => {
  const t = useTheme();
  return <Text style={{ color: t.brand1Text, fontSize: 12.5, fontWeight: bold ? '800' : '600' }}>{children}</Text>;
};
