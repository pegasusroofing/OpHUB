// The sidebar on a phone (Andy, 13 Nov 2026: "a sidebar on the iPhone that is click to expand"): ☰ in the top bar slides
// in the laptop's left-hand menu over the page. Tap outside it, or go to a page, and it closes.
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeskNav } from '@/components/DeskNav';
import { base } from '@/theme/theme';

const listeners = new Set<(open: boolean) => void>();
export const openSideMenu = () => listeners.forEach((l) => l(true));

export function SideMenuHost() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  useEffect(() => { listeners.add(setOpen); return () => { listeners.delete(setOpen); }; }, []);
  // Going to a page closes it.
  useEffect(() => { setOpen(false); }, [path]);
  if (!open) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View accessibilityLabel="Menu" style={{ width: Math.min(300, Math.round(width * 0.82)), backgroundColor: base.card, paddingTop: insets.top, paddingBottom: insets.bottom, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 }}>
          <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close the menu" hitSlop={10} style={{ position: 'absolute', top: insets.top + 10, right: 10, zIndex: 2, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18, color: base.slate, fontWeight: '600' }}>✕</Text>
          </Pressable>
          <DeskNav drawer />
        </View>
        <Pressable accessibilityLabel="Close the menu" onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} />
      </View>
    </Modal>
  );
}
