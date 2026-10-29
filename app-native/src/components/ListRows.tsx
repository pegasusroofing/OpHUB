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
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: '#F0F1F4' }, pressed && { backgroundColor: '#F8F9FB' }]}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: TINTS[tint][0], alignItems: 'center', justifyContent: 'center' }}><OphIcon name={icon} size={19} color={TINTS[tint][1]} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontWeight: '700', fontSize: 14, color: base.ink }}>{label}</Text>
        {!!sub && <Text style={{ fontSize: 12, color: base.slate, marginTop: 1 }}>{sub}</Text>}
      </View>
      {!!badge && <Text style={{ backgroundColor: base.red, color: '#fff', fontSize: 11, fontWeight: '800', borderRadius: 9, minWidth: 18, textAlign: 'center', paddingHorizontal: 5, overflow: 'hidden' }}>{badge}</Text>}
      <OphIcon name="chevron" size={18} color={base.slateLight} stroke={2.2} />
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
