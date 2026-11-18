// Grouped white cards of rows (260 .admgroup / .admrow): a tinted line-icon
// square, a title and a description, and a chevron. Used by the Admin Centre
// and HR.
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { OphIcon } from '@/components/OphIcon';
import { TINTS } from '@/components/ui';
import { heading } from '@/lib/fonts';
import { base } from '@/theme/theme';

export function ListRow({ icon, tint, label, sub, onPress, last, badge }: { icon: string; tint: keyof typeof TINTS; label: string; sub?: string; onPress: () => void; last?: boolean; badge?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: '#F0F1F4' }, pressed && { backgroundColor: '#F8F9FB' }]}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: TINTS[tint][0], alignItems: 'center', justifyContent: 'center' }}><OphIcon name={icon} size={19} color={TINTS[tint][1]} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontWeight: '600', fontSize: 14, color: base.ink }}>{label}</Text>
        {!!sub && <Text numberOfLines={1} style={{ fontSize: 11.5, color: base.slate }}>{sub}</Text>}
      </View>
      {!!badge && <Text style={{ backgroundColor: base.red, color: '#fff', fontSize: 11, fontWeight: '600', borderRadius: 9, minWidth: 18, textAlign: 'center', paddingHorizontal: 5, overflow: 'hidden' }}>{badge}</Text>}
      <OphIcon name="chevron" size={18} color={base.slateLight} stroke={2.2} />
    </Pressable>
  );
}

/** A plain row, as Finance's lists (Andy, 18 Nov 2026: the Admin Centre "feels a bit heavy"; Settings "is a big
 *  section"): the words, what it's set to on the right, and a chevron; no icon square. */
/** Less tall (Andy, 18 Nov 2026: "the rows throughout the settings are really deep ... make them less tall"): 7px top and
 *  bottom, and the line under the name kept to one line. */
export function PlainRow({ label, sub, value, onPress, last, badge, a11y }: { label: string; sub?: string; value?: string; onPress: () => void; last?: boolean; badge?: number; a11y?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: '#F0F1F4' }, pressed && { backgroundColor: '#F8F9FB' }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontWeight: '500', fontSize: 14, color: base.ink }}>{label}</Text>
        {!!sub && <Text numberOfLines={1} style={{ fontSize: 11.5, color: base.slate }}>{sub}</Text>}
      </View>
      {!!value && <Text numberOfLines={1} style={{ fontSize: 13.5, color: base.slate, maxWidth: '45%' }}>{value}</Text>}
      {!!badge && <Text style={{ backgroundColor: base.red, color: '#fff', fontSize: 11, fontWeight: '600', borderRadius: 9, minWidth: 18, textAlign: 'center', paddingHorizontal: 5, overflow: 'hidden' }}>{badge}</Text>}
      <OphIcon name="chevron" size={16} color={base.slateLight} stroke={2.2} />
    </Pressable>
  );
}

export function ListGroup({ title, children, first }: { title?: string; children: ReactNode; first?: boolean }) {
  return (
    <View style={{ marginTop: first ? 0 : 14 }}>
      {!!title && <Text style={[heading(700), { fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', color: base.slate, marginBottom: 8 }]}>{title}</Text>}
      <View style={{ backgroundColor: base.card, borderRadius: 16, borderWidth: 1, borderColor: '#ECEEF2', overflow: 'hidden' }}>{children}</View>
    </View>
  );
}
