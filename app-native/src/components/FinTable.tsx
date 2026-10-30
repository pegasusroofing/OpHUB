// The Finance list table on a computer (9219f grid / 9219x totals bar): underlined
// uppercase column headings, centred cells, a row per record, and the
// company-colour totals bar underneath. Phones keep the card list.
import { isValidElement, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { heading } from '@/lib/fonts';
import { base, useTheme } from '@/theme/theme';

export type FinCol<T> = { k: string; l: string; flex?: number; min?: number; render: (r: T) => ReactNode };

/** The words a cell shows, for the filter boxes. */
function nodeText(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(nodeText).join(' ');
  if (isValidElement(n)) { const p = n.props as { children?: ReactNode; label?: string; title?: string }; return [nodeText(p.children), p.label || '', p.title || ''].join(' '); }
  return '';
}

export function FinTable<T>({ cols, rows, keyOf, onRow, foot }: { cols: FinCol<T>[]; rows: T[]; keyOf: (r: T) => string; onRow?: (r: T) => void; foot?: ReactNode | ((shown: T[]) => ReactNode) }) {
  const t = useTheme();
  const [q, setQ] = useState<Record<string, string>>({});
  const on = cols.filter((c) => q[c.k]?.trim()).map((c) => ({ c, q: q[c.k].trim().toLowerCase() }));
  const shown = on.length ? rows.filter((r) => on.every((f) => nodeText(f.c.render(r)).toLowerCase().replace(/\s+/g, ' ').includes(f.q))) : rows;
  const footer = typeof foot === 'function' ? foot(shown) : foot;
  const cell = (c: FinCol<T>) => ({ flex: c.flex ?? 1, minWidth: c.min ?? 80, paddingHorizontal: 6, alignItems: 'center' as const, justifyContent: 'center' as const });
  return (
    <View>
      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }} showsHorizontalScrollIndicator={false}>
        <View style={{ flex: 1, minWidth: '100%' }}>
          <View style={{ flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 8 }}>
            {cols.map((c) => <View key={c.k} style={cell(c)}><Text style={{ fontSize: 10.5, fontWeight: '800', letterSpacing: 0.7, color: base.ink, textDecorationLine: 'underline', textTransform: 'uppercase' }}>{c.l}</Text></View>)}
          </View>
          {!!foot && (
            <View style={{ flexDirection: 'row', paddingBottom: 8, paddingHorizontal: 8 }}>
              {cols.map((c) => <View key={c.k} style={cell(c)}>{!!c.l && <TextInput value={q[c.k] || ''} onChangeText={(v) => setQ({ ...q, [c.k]: v })} placeholder={c.l} accessibilityLabel={`Filter ${c.l}`} placeholderTextColor={base.slateLight} style={{ alignSelf: 'stretch', height: 28, paddingHorizontal: 6, fontSize: 11.5, textAlign: 'center', color: base.ink, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 7, minWidth: 0 }} />}</View>)}
            </View>
          )}
          <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
            {!shown.length && <Text style={{ padding: 14, textAlign: 'center', color: base.slate }}>Nothing matches those filters.</Text>}
            {shown.map((r, i) => (
              <Pressable key={keyOf(r)} onPress={onRow ? () => onRow(r) : undefined}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 8, paddingHorizontal: 8, borderTopWidth: i ? 1 : 0, borderTopColor: '#F0F1F4' }, pressed && { backgroundColor: '#F8F9FB' }]}>
                {cols.map((c) => <View key={c.k} style={cell(c)}>{c.render(r)}</View>)}
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      {!!footer && <View style={{ marginTop: 10, backgroundColor: t.brand1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>{footer}</View>}
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
