// Offline read cache: the last good answer for each query, kept on the device,
// so screens open with no signal. Same idea as 060-offline-read-cache.js.
// Use with React Query: cachedQuery('sites', () => supabase.from('sites')...).
import { useSyncExternalStore } from 'react';

import { plainDelete, plainGet, plainKeys, plainSet } from './kv';

// 060 / 130: "📡 Offline — showing saved data from earlier" while a screen is showing the saved copy.
let showingSaved = false;
const savedKeys = new Set<string>(); // lists currently shown from the saved copy
const subs = new Set<() => void>();
function setSaved(key: string, on: boolean) { if (on) savedKeys.add(key); else savedKeys.delete(key); const now = savedKeys.size > 0; if (showingSaved === now) return; showingSaved = now; subs.forEach((f) => f()); }
export const useShowingSaved = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => showingSaved, () => false);

const PREFIX = 'ophub-cache:';
type Entry<T> = { at: number; data: T };

// Runs the fetch; on success saves it, on failure falls back to the saved copy.
// A failed fetch is never saved, so "no signal" never looks like "no data".
export async function cachedQuery<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const data = await fetcher();
    plainSet(PREFIX + key, { at: Date.now(), data } satisfies Entry<T>);
    setSaved(key, false);
    return data;
  } catch (e) {
    const saved = await plainGet<Entry<T> | null>(PREFIX + key, null);
    if (saved) { setSaved(key, true); return saved.data; }
    throw e;
  }
}

export async function readCached<T>(key: string): Promise<Entry<T> | null> {
  return plainGet<Entry<T> | null>(PREFIX + key, null);
}

// Throws on a Supabase error so cachedQuery falls back to the saved copy.
export function orThrow<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

// Called on sign-out: the next person on this phone must not see the last one's data.
export async function clearOfflineCache(): Promise<void> {
  for (const k of await plainKeys(PREFIX)) await plainDelete(k);
}
