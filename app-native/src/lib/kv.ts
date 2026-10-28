// Small key/value store used everywhere in the app.
// - secure*: phones use the OS keychain/keystore (expo-secure-store); web uses localStorage.
// - plain*: AsyncStorage (localStorage on web) for bigger, non-secret things like the offline cache.
// SecureStore warns above ~2 KB per value, so long values are split into chunks.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHUNK = 1800;
const isWeb = Platform.OS === 'web';

function webGet(key: string): string | null {
  try { return globalThis.localStorage ? globalThis.localStorage.getItem(key) : null; } catch { return null; }
}
function webSet(key: string, value: string): void {
  try { globalThis.localStorage?.setItem(key, value); } catch { /* storage blocked: non-fatal */ }
}
function webDel(key: string): void {
  try { globalThis.localStorage?.removeItem(key); } catch { /* non-fatal */ }
}

// SecureStore keys may only hold letters, numbers, ".", "-" and "_".
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

export async function secureGet(key: string): Promise<string | null> {
  if (isWeb) return webGet(key);
  try {
    const k = safeKey(key);
    const head = await SecureStore.getItemAsync(k);
    if (head == null) return null;
    const m = /^__chunks:(\d+)$/.exec(head);
    if (!m) return head;
    let out = '';
    for (let i = 0; i < Number(m[1]); i++) {
      const part = await SecureStore.getItemAsync(`${k}.${i}`);
      if (part == null) return null;
      out += part;
    }
    return out;
  } catch { return null; }
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (isWeb) { webSet(key, value); return; }
  const k = safeKey(key);
  await secureDelete(key);
  if (value.length <= CHUNK) { await SecureStore.setItemAsync(k, value); return; }
  const n = Math.ceil(value.length / CHUNK);
  for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
  await SecureStore.setItemAsync(k, `__chunks:${n}`);
}

export async function secureDelete(key: string): Promise<void> {
  if (isWeb) { webDel(key); return; }
  try {
    const k = safeKey(key);
    const head = await SecureStore.getItemAsync(k);
    const m = head ? /^__chunks:(\d+)$/.exec(head) : null;
    if (m) for (let i = 0; i < Number(m[1]); i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
    await SecureStore.deleteItemAsync(k);
  } catch { /* non-fatal */ }
}

export async function plainGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await AsyncStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch { return fallback; }
}
export async function plainSet(key: string, value: unknown): Promise<void> {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch { /* full or blocked: non-fatal */ }
}
export async function plainDelete(key: string): Promise<void> {
  try { await AsyncStorage.removeItem(key); } catch { /* non-fatal */ }
}
export async function plainKeys(prefix: string): Promise<string[]> {
  try { return (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix)); } catch { return []; }
}
