// A plain pop-up with a ✕ (Andy: pop-ups have a ✕): a title, what's in it, and buttons along the bottom. Used where a
// FinForm's fields don't fit, e.g. choosing folders, or a job's money broken down.
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { base } from '@/theme/theme';

export function Pop({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: base.card, borderRadius: 14, padding: 16, maxHeight: '88%', width: '100%', maxWidth: 520, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
            <Text style={{ flex: 1, fontWeight: '600', fontSize: 16, color: base.ink }}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}><Text style={{ fontSize: 18, color: base.slate }}>✕</Text></Pressable>
          </View>
          <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer}
        </View>
      </View>
    </Modal>
  );
}
/** A line in a pop-up: what on the left, the amount on the right; bold for a total. */
export function PopLine({ l, v, bold, tone, onPress }: { l: string; v: string; bold?: boolean; tone?: string; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={onPress ? `${l}: ${v}` : undefined} onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: bold ? 1 : 0, borderTopColor: base.line }}>
      <Text style={{ flex: 1, fontSize: 13.5, fontWeight: bold ? '700' : '400', color: base.ink }}>{l}</Text>
      <Text style={{ fontSize: 13.5, fontWeight: bold ? '700' : '600', color: tone || (onPress ? base.blue : base.ink) }}>{v}{onPress ? ' ›' : ''}</Text>
    </Pressable>
  );
}
