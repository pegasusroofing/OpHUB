// A coloured info box with an ✕ (Andy, 13 Nov 2026: "the info boxes need an x on them"). Closing it hides it for that
// person for good (kept with their dismissed tips, so Settings › Show The How-To Tips Again brings them back too).
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { dismissHowTo, howtoDismissed } from '@/lib/howto';

export function InfoBox({ k, bg, fg, icon, children }: { k: string; bg: string; fg: string; icon?: string; children: ReactNode }) {
  const { me, refresh } = useAuth();
  const [gone, setGone] = useState(false);
  const key = `info:${k}`;
  if (!me || gone || howtoDismissed(me).includes(key) || howtoDismissed(me).includes('*')) return null;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 12, paddingLeft: 14, paddingRight: 8, marginBottom: 12 }}>
      {!!icon && <Text style={{ fontSize: 16 }}>{icon}</Text>}
      <Text style={{ flex: 1, color: fg, lineHeight: 20 }}>{children}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close this note" hitSlop={10} onPress={() => { setGone(true); void dismissHowTo(me, key).then(() => refresh()); }} style={{ paddingHorizontal: 6 }}>
        <Text style={{ fontSize: 16, color: fg, opacity: 0.7 }}>✕</Text>
      </Pressable>
    </View>
  );
}
