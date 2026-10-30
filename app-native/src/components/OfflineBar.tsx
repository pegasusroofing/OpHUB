// The old app's offline banner (060 / 130): shown while any screen is showing saved data because there's no
// signal; tap it to try again. When live data comes back, a short "Back online" bar, and on the laptop the
// browser's own "online" signal refreshes everything.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text } from 'react-native';

import { useShowingSaved } from '@/lib/offlineCache';
import { base } from '@/theme/theme';

export function OfflineBar() {
  const saved = useShowingSaved();
  const qc = useQueryClient();
  const was = useRef(false);
  const [back, setBack] = useState(false);
  useEffect(() => {
    if (saved) { was.current = true; return; }
    if (!was.current) return;
    was.current = false; setBack(true);
    const t = setTimeout(() => setBack(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const on = () => { void qc.invalidateQueries(); };
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [qc]);
  if (saved) return (
    <Pressable onPress={() => void qc.invalidateQueries()} style={{ backgroundColor: base.warnBg, paddingVertical: 6, paddingHorizontal: 14 }}>
      <Text style={{ color: base.warn, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>📡 Offline — showing saved data from earlier · tap to retry</Text>
    </Pressable>
  );
  if (back) return <Text style={{ backgroundColor: base.okBg, color: base.ok, fontSize: 12, fontWeight: '700', textAlign: 'center', paddingVertical: 6 }}>✓ Back online</Text>;
  return null;
}
