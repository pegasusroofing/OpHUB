// A tidy pop-up card that opens next to where you tapped (never below the screen), with an ✕ to close
// in the top right. Used by the menus, Yes / No questions, prompts and the pop-up forms.
import { useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { base } from '@/theme/theme';

// Where the last tap / click was, so a pop-up can open beside it.
let lastTap: { x: number; y: number } | null = null;
export function noteTap(x: number, y: number) { lastTap = { x, y }; }
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => noteTap(e.clientX, e.clientY), true);
}

const GAP = 12;

export function Popup({ title, onClose, children, width = 380, center, footer }: {
  title?: string; onClose: () => void; children: ReactNode; width?: number; center?: boolean; footer?: ReactNode;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const [anchor] = useState(() => (center ? null : lastTap));
  const [h, setH] = useState(0);
  const w = Math.min(width, W - GAP * 2);
  let top = (H - h) / 2, left = (W - w) / 2;
  if (anchor && h) {
    top = anchor.y + GAP;
    if (top + h > H - GAP) top = anchor.y - GAP - h;
    if (top < GAP) top = Math.max(GAP, H - h - GAP);
    left = Math.min(Math.max(GAP, anchor.x - w / 2), W - w - GAP);
  }
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.30)' }} onPress={onClose} accessibilityLabel="Close" />
      <View onLayout={(e) => setH(e.nativeEvent.layout.height)}
        style={{ position: 'absolute', top: Math.max(GAP, top), left, width: w, maxHeight: H - GAP * 2, opacity: h ? 1 : 0, backgroundColor: base.card, borderRadius: 16, borderWidth: 1, borderColor: base.line, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 8, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 14, paddingRight: 4, paddingTop: 10 }}>
          <Text style={{ flex: 1, fontWeight: '800', fontSize: 15, color: base.ink, paddingTop: 4, paddingBottom: 6 }}>{title || ''}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 18, color: base.slate, fontWeight: '700' }}>✕</Text>
          </Pressable>
        </View>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: footer ? 6 : 14 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer ? <View style={{ paddingHorizontal: 14, paddingBottom: 14, paddingTop: 6 }}>{footer}</View> : null}
      </View>
    </Modal>
  );
}

// Two buttons side by side for the foot of a pop-up: the main one on the right.
export function PopupButtons({ yes, no, onYes, onNo, danger }: { yes: string; no?: string; onYes: () => void; onNo?: () => void; danger?: boolean }) {
  const btn = { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' as const, borderWidth: 1.5 };
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {!!no && <Pressable accessibilityRole="button" onPress={onNo} style={[btn, { borderColor: base.line }]}><Text style={{ fontWeight: '700', color: base.ink }}>{no}</Text></Pressable>}
      <Pressable accessibilityRole="button" onPress={onYes} style={[btn, { borderColor: danger ? '#C8102E' : base.blue, backgroundColor: danger ? '#C8102E' : base.blue }]}><Text style={{ fontWeight: '800', color: '#fff' }}>{yes}</Text></Pressable>
    </View>
  );
}
