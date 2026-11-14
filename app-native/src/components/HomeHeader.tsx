// Home's refresh (Andy, 14 Nov 2026: "Does the refresh button top right work" / "can you make the company name a link
// to refresh, then company logo top right?"). Tapping the company name in the header fetches everything on the screen
// again; the name fades while it does (as the old app's refresh button did). On the web link it also checks whether a
// newer version of the app has gone live and, if so, reloads the page, so a phone isn't left on an old copy. The
// company logo sits top right instead of a refresh button.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Image, Platform, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import { useAuth } from '@/lib/auth';

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

/** Fetch everything on the screen again (and pick up a newer version on the web link). busy while it works. */
export function useAppRefresh() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // At least 0.8s, so the tap is seen even when everything comes back at once.
      const [, newer] = await Promise.all([qc.invalidateQueries(), newerVersionLive(), new Promise((r) => setTimeout(r, 800))]);
      if (newer && typeof window !== 'undefined') { window.location.reload(); return; }
    } finally { setBusy(false); }
  };
  return { busy, refresh };
}

/** The company's logo for the top right of Home (the OpHUB icon when the company hasn't added one). */
export function CompanyLogo({ size }: { size: number }) {
  const { org } = useAuth();
  const box = { width: size, height: size, resizeMode: 'contain' as const };
  return (
    <View accessibilityRole="image" accessibilityLabel={`${org?.name || 'OpHUB'} logo`} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {org?.logo_path
        ? <StorageImage bucket="org-logos" path={org.logo_path} style={box} />
        : <Image source={require('../../assets/images/icon.png')} style={[box, { borderRadius: size * 0.22 }]} />}
    </View>
  );
}
