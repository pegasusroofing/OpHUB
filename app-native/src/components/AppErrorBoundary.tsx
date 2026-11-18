// The page shown when something on a page fails (in place of the framework's black "Something went wrong").
// Andy, 18 Nov 2026 ("Error: Loading module …/schedule-….js failed — What does this mean"): a page left open while a new
// version went up asks for code that the new version replaced. That isn't a fault, so the app reloads itself once to
// pick up the new version. Anything else: a plain message, Try Again and Home.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

const UPDATED = /Loading (module|chunk)|ChunkLoadError|dynamically imported module|Importing a module script failed|error loading dynamically/i;
const KEY = 'ophub_reloaded_for_update';
/** Not already reloaded for an update in the last minute (so it can't go round and round). */
function notJustReloaded(): boolean {
  try { return Date.now() - Number(window.sessionStorage.getItem(KEY) || 0) > 60000; } catch { return true; }
}

export function AppErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const updated = UPDATED.test(String(error?.message || error));
  const web = Platform.OS === 'web' && typeof window !== 'undefined';
  // Reload once for a new version (not again within a minute, so it can't loop).
  const [reloading] = useState(() => updated && web && notJustReloaded());
  useEffect(() => {
    if (!reloading) return;
    try { window.sessionStorage.setItem(KEY, String(Date.now())); } catch { /* private mode */ }
    window.location.reload();
  }, [reloading]);
  const btn = { paddingVertical: 12, paddingHorizontal: 22, borderRadius: 10, borderWidth: 1, borderColor: '#D5D9E0', backgroundColor: '#fff' } as const;
  return (
    <View style={{ flex: 1, backgroundColor: '#F2F3F6', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: '#0B0E14', marginBottom: 8, textAlign: 'center' }}>{reloading || updated ? 'Updating OpHUB…' : 'That Page Didn’t Load'}</Text>
      <Text style={{ fontSize: 14.5, color: '#566072', textAlign: 'center', maxWidth: 420, marginBottom: 18 }}>
        {reloading ? 'A new version is ready — loading it now.' : updated ? 'A new version is ready. Close this tab and open OpHUB again to load it.' : 'Something went wrong showing this page. Try again, or go back to Home.'}
      </Text>
      {!reloading && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable accessibilityRole="button" onPress={() => { if (web && updated) window.location.reload(); else void retry(); }} style={btn}><Text style={{ fontWeight: '600', color: '#0B0E14' }}>Try Again</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { if (web) window.location.assign('/home'); else router.replace('/home' as never); }} style={btn}><Text style={{ fontWeight: '600', color: '#0B0E14' }}>Home</Text></Pressable>
        </View>
      )}
    </View>
  );
}
