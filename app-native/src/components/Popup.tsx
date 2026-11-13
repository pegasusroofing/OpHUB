// A tidy pop-up card that opens next to where you tapped (never below the screen), with an ✕ to close
// in the top right. Used by the menus, Yes / No questions, prompts and the pop-up forms.
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { base } from '@/theme/theme';

// Where the last tap / click was, so a pop-up can open beside it. When a pop-up closes from a tap inside it and the next
// one follows straight on (OK on the client's email, then their name), the next one opens in the middle of the screen
// instead of beside that OK (Andy, 14 Nov 2026). A pick list opened inside a pop-up that stays open still opens by the tap.
let lastTap: { x: number; y: number; inPopup: boolean } | null = null;
let openPopups = 0;
export function noteTap(x: number, y: number) { lastTap = { x, y, inPopup: openPopups > 0 }; }
export function popupClosed() { if (lastTap?.inPopup) lastTap = null; }
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => noteTap(e.clientX, e.clientY), true);
}

const GAP = 12;

// Web: where the page and every scrolled area were when a pop-up opened, so they go back exactly when it closes
// (Andy, 11 Nov 2026: choosing a saved email made the screen jump to the bottom). On an iPhone a tapped button doesn't
// take focus, so when a pick list closed, the web pop-up's focus handling could land on the last thing in the email
// pop-up behind it and scroll there; it could also select a text box and bring the keyboard up.
type Spot = { win: number; els: [Element, number][]; active: Element | null };
function snapshot(): Spot | null {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  const els: [Element, number][] = [];
  // Every area that can scroll, even one at the top (that's the one that jumped).
  document.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 2) els.push([e, e.scrollTop]); });
  return { win: window.scrollY, els, active: document.activeElement };
}
function putBack(s: Spot) {
  const go = () => {
    s.els.forEach(([e, top]) => { if (e.isConnected && Math.abs(e.scrollTop - top) > 1) e.scrollTop = top; });
    if (Math.abs(window.scrollY - s.win) > 1) window.scrollTo(0, s.win);
    const a = document.activeElement as HTMLElement | null;
    if (a && a !== s.active && /^(INPUT|TEXTAREA)$/.test(a.tagName)) a.blur();
  };
  requestAnimationFrame(go); setTimeout(go, 60); setTimeout(go, 250);
}

export function Popup({ title, onClose, children, width = 380, center, footer }: {
  title?: string; onClose: () => void; children: ReactNode; width?: number; center?: boolean; footer?: ReactNode;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const [anchor] = useState(() => (center ? null : lastTap));
  useEffect(() => { openPopups += 1; return () => { openPopups -= 1; popupClosed(); }; }, []);
  const [h, setH] = useState(0);
  // Put the page's scrolling back as it was when this closes (web).
  const [spot] = useState(snapshot);
  useEffect(() => () => { if (spot) putBack(spot); }, [spot]);
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
          <Text style={{ flex: 1, fontWeight: '600', fontSize: 15, color: base.ink, paddingTop: 4, paddingBottom: 6 }}>{title || ''}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 18, color: base.slate, fontWeight: '600' }}>✕</Text>
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
      {!!no && <Pressable accessibilityRole="button" onPress={onNo} style={[btn, { borderColor: base.line }]}><Text style={{ fontWeight: '600', color: base.ink }}>{no}</Text></Pressable>}
      <Pressable accessibilityRole="button" onPress={onYes} style={[btn, { borderColor: danger ? '#C8102E' : base.blue, backgroundColor: danger ? '#C8102E' : base.blue }]}><Text style={{ fontWeight: '600', color: '#fff' }}>{yes}</Text></Pressable>
    </View>
  );
}
