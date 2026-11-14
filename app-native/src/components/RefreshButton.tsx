// Home's refresh button, top right (Andy, 14 Nov 2026: "Does the refresh button top right work. Also make it a better
// symbol"). It always fetched everything on the screen again, but nothing showed it had. Now it's the two-arrow refresh
// icon, which turns while it fetches; and on the web link it also checks whether a newer version of the app has gone
// live and, if so, reloads the page, so a phone isn't left on an old copy.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable } from 'react-native';

import { OphIcon } from '@/components/OphIcon';
import { base } from '@/theme/theme';

/** The build this page is running, stamped into the page by tools/beta/make-beta.js ('' on the dev server). */
function myBuild(): string {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return '';
  return document.querySelector('meta[name="ophub-build"]')?.getAttribute('content') || '';
}

/** True when the live site has a newer build than the one this page is running. */
export async function newerVersionLive(): Promise<boolean> {
  const mine = myBuild();
  if (!mine) return false;
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return false;
    const live = ((await r.json()) as { build?: string }).build || '';
    return !!live && live !== mine;
  } catch { return false; }
}

export function RefreshButton({ style }: { style: object }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!busy) { spin.stopAnimation(); spin.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }));
    loop.start();
    return () => loop.stop();
  }, [busy, spin]);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // At least one full turn, so the tap is seen even when everything comes back at once.
      const [, newer] = await Promise.all([qc.invalidateQueries(), newerVersionLive(), new Promise((r) => setTimeout(r, 800))]);
      if (newer && typeof window !== 'undefined') { window.location.reload(); return; }
    } finally { setBusy(false); }
  };
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Pressable onPress={() => void go()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Refresh" accessibilityState={{ busy }} style={style}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <OphIcon name="refresh" size={19} color={base.ink} stroke={2.1} />
      </Animated.View>
    </Pressable>
  );
}
