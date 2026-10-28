// A stable id for this phone/browser, used by the one-phone-per-person lock
// (check_device_lock_v2) and sent with every check-in.
// - Android: the app's Android ID (stays the same across reinstalls of the same app).
// - iPhone: the vendor id.
// - Web: a random "dv_" id kept in localStorage under the SAME key the current
//   web app uses, so a browser that is already approved stays approved.
// The id is saved once and reused, so it never changes under someone.
import * as Application from 'expo-application';
import { Platform } from 'react-native';

import { secureGet, secureSet } from './kv';

const KEY = 'ophub_device_id';
let cached: string | null = null;

function randomId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  const saved = await secureGet(KEY);
  if (saved) { cached = saved; return saved; }
  let id: string | null = null;
  try {
    if (Platform.OS === 'android') {
      const a = Application.getAndroidId();
      if (a) id = `dv_and_${a}`;
    } else if (Platform.OS === 'ios') {
      const v = await Application.getIosIdForVendorAsync();
      if (v) id = `dv_ios_${v}`;
    }
  } catch { id = null; }
  if (!id) id = `dv_${randomId()}`;
  await secureSet(KEY, id);
  cached = id;
  return id;
}

// The old web app also sends a "hardware" signature so the server can spot the
// same handset used a second way (browser vs app). The native app has a real
// device id, so it sends none (the server accepts null).
export function getHardwareId(): string | null {
  return null;
}
