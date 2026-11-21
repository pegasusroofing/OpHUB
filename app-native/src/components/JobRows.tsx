// The job page's plain rows (Andy, 9 Nov 2026): a line icon, the name, its count or note, ›. On a laptop the note sits
// on the right; on a phone it goes under the name. cols 2 = two columns of rows. Used by the job page, Main Contractor
// and a subcontractor's page (app review, 21 Nov 2026: "one tile look ... no emoji, no coloured squares").
// A row's ⋮ (menu) is for managers' extra choices, such as showing a part to operatives.
import { Pressable, Text, View } from 'react-native';

import { OphIcon } from '@/components/OphIcon';
import { heading } from '@/lib/fonts';
import { base } from '@/theme/theme';

export type JobRow = { key: string; ic: string; title: string; sub: string; badge?: number | string; onPress: () => void; menu?: () => void; done?: boolean };

// Flat, as Finance (Andy, 3 Nov 2026).
const cardBox = { backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, shadowOpacity: 0, elevation: 0 } as const;
const rule = '#EEF0F2';

export function JobRows({ rows, cols = 1, desk }: { rows: JobRow[]; cols?: number; desk: boolean }) {
  // A phone's rows are 1.1 × bigger (Andy, 13 Nov 2026).
  const k = desk ? 1 : 1.1;
  return (
    <View style={[cardBox, { borderRadius: 10, flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: cols > 1 ? 4 : 0 }]}>
      {rows.map((x, i) => (
        // The row's ⋮ sits beside the row's button, not inside it (a button can't hold another).
        <View key={x.key} style={{ width: `${100 / cols}%`, flexDirection: 'row', alignItems: 'center', borderTopWidth: i >= cols ? 1 : 0, borderTopColor: rule }}>
          <Pressable onPress={x.onPress} accessibilityRole="button" accessibilityLabel={`${x.title}, ${x.sub}`}
            style={({ pressed }) => [{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 * k, paddingVertical: 11 * k, paddingLeft: 14, paddingRight: x.menu ? 4 : 14 }, pressed && { backgroundColor: '#F7F8FA' }]}>
            <View style={{ width: 32 * k, height: 32 * k, borderRadius: 8 * k, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: base.cardLine }}>
              <OphIcon name={x.done ? 'check' : x.ic} size={17 * k} color={base.ink} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[heading(600), { fontSize: 13.5 * k, color: base.ink }]}>{x.title}</Text>
              {!desk && !!x.sub && <Text numberOfLines={1} style={{ fontSize: 11.5 * k, color: base.slateLight, marginTop: 1 }}>{x.sub}</Text>}
            </View>
            {desk && !!x.sub && <Text numberOfLines={1} style={{ flexShrink: 1, maxWidth: '45%', fontSize: 12, color: base.slateLight }}>{x.sub}</Text>}
            {x.badge != null && x.badge !== 0 && (
              <Text style={{ backgroundColor: base.red, color: '#fff', fontSize: 11, fontWeight: '600', borderRadius: 9, minWidth: 18, textAlign: 'center', paddingHorizontal: 5, overflow: 'hidden' }}>{x.badge}</Text>
            )}
            {!x.menu && <OphIcon name="chevron" size={14} color={base.slateLight} />}
          </Pressable>
          {x.menu && (
            <>
              <Pressable onPress={x.menu} hitSlop={8} accessibilityRole="button" accessibilityLabel={`More for ${x.title}`} style={{ paddingHorizontal: 6, paddingVertical: 8 }}>
                <Text style={{ fontSize: 18, color: base.slate }}>⋮</Text>
              </Pressable>
              <Pressable onPress={x.onPress} focusable={false} importantForAccessibility="no" style={{ paddingLeft: 4, paddingRight: 14, paddingVertical: 12 }}>
                <OphIcon name="chevron" size={14} color={base.slateLight} />
              </Pressable>
            </>
          )}
        </View>
      ))}
    </View>
  );
}
