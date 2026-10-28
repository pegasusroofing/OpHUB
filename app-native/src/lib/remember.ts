// "Remember my email and password on this device". Ported from 140-login.js.
// - Phones: kept in the OS keychain/keystore (encrypted by the phone itself).
// - Web: the email in localStorage, the password encrypted (AES-GCM) with a key the
//   browser makes "non-extractable" and keeps in IndexedDB, exactly as the current app does.
// Forgotten when unticked, and the password is forgotten after a password reset.
import { Platform } from 'react-native';

import { secureDelete, secureGet, secureSet } from './kv';

const KEY = 'ophub_remember';
const isWeb = Platform.OS === 'web';

export type Remembered = { email: string; password: string; remember: boolean };

type WebSaved = { email: string; pw?: { iv: string; ct: string } };
type NativeSaved = { email: string; password?: string };

/* ---------- web crypto helpers (same scheme as the current app) ---------- */
const IDB = 'ophub-sec', STORE = 'keys';
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(IDB, 1);
    rq.onupgradeneeded = () => { try { rq.result.createObjectStore(STORE); } catch { /* exists */ } };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
async function webKey(create: boolean): Promise<CryptoKey | null> {
  if (!(globalThis.crypto?.subtle && globalThis.indexedDB)) return null;
  const db = await idb();
  const get = () => new Promise<CryptoKey | null>((res) => {
    try {
      const t = db.transaction(STORE, 'readonly').objectStore(STORE).get('remember');
      t.onsuccess = () => res((t.result as CryptoKey) || null);
      t.onerror = () => res(null);
    } catch { res(null); }
  });
  let k = await get();
  if (!k && create) {
    k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await new Promise<void>((res) => {
      try {
        const t = db.transaction(STORE, 'readwrite').objectStore(STORE).put(k, 'remember');
        t.onsuccess = () => res(); t.onerror = () => res();
      } catch { res(); }
    });
  }
  return k;
}
const b64 = (buf: ArrayBuffer | Uint8Array) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); };
const unB64 = (str: string) => { const s = atob(str); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };

/* ---------- public API ---------- */
export async function loadRemembered(): Promise<Remembered> {
  const raw = await secureGet(KEY);
  if (!raw) return { email: '', password: '', remember: false };
  try {
    if (!isWeb) {
      const p = JSON.parse(raw) as NativeSaved;
      return { email: p.email || '', password: p.password || '', remember: !!p.email };
    }
    const p = JSON.parse(raw) as WebSaved;
    let password = '';
    if (p.pw) {
      try {
        const key = await webKey(false);
        if (key) password = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unB64(p.pw.iv) }, key, unB64(p.pw.ct)));
      } catch { /* key gone (browser data cleared): leave the box empty */ }
    }
    return { email: p.email || '', password, remember: !!p.email };
  } catch {
    return { email: '', password: '', remember: false };
  }
}

export async function saveRemembered(email: string, password: string): Promise<void> {
  if (!isWeb) { await secureSet(KEY, JSON.stringify({ email, password } satisfies NativeSaved)); return; }
  const saved: WebSaved = { email };
  try {
    const key = await webKey(true);
    if (key) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(password));
      saved.pw = { iv: b64(iv), ct: b64(ct) };
    }
  } catch { /* this browser can't: keep the email only */ }
  await secureSet(KEY, JSON.stringify(saved));
}

export async function forgetRemembered(): Promise<void> { await secureDelete(KEY); }

// After a password reset the old saved password is wrong: keep only the email.
export async function forgetRememberedPassword(): Promise<void> {
  const r = await loadRemembered();
  if (r.email) await secureSet(KEY, JSON.stringify({ email: r.email }));
}
