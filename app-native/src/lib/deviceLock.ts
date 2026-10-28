// One phone per person, one person per phone. Ported from 030-generic-helpers.js and 070-auth.js.
import { getDeviceId, getHardwareId } from './deviceId';
import { deviceLockApplies } from './roles';
import { supabase } from './supabase';
import type { DeviceLockResult, Profile } from './types';

export async function checkDeviceLock(): Promise<DeviceLockResult> {
  try {
    const { data, error } = await supabase.rpc('check_device_lock_v2', {
      p_device_id: await getDeviceId(),
      p_hw_id: getHardwareId(),
    });
    if (error || !data) return { ok: false, error: 'request_failed' };
    return data;
  } catch {
    return { ok: false, error: 'request_failed' };
  }
}

// A definite "no" from the server (as opposed to no signal).
export const isLockRefusal = (r: DeviceLockResult) => r.error === 'device_locked' || r.error === 'pending_approval';

export function deviceLockMessage(lock: DeviceLockResult): string {
  if (lock.error === 'device_locked') {
    return `This phone is already signed in to OpHUB as ${lock.locked_to_name || 'another team member'}. Each phone can only be used by one person — ask your Project Manager or admin to unlock it in Admin Centre if this is wrong.`;
  }
  if (lock.error === 'pending_approval') {
    return lock.reason === 'lookalike'
      ? 'This phone needs approving before you can sign in on it. Ask your Project Manager or admin to approve it in Admin Centre › Device Locks, then sign in again.'
      : 'This is a new device for your account. Ask your Project Manager or admin to approve it in Admin Centre › Device Locks, then try signing in again.';
  }
  return 'Could not verify this device — check your connection and try again.';
}

// Every check-in carries this phone's id so the database can refuse a check-in
// from a phone locked to someone else (checkin_device_guard). Never throws.
export async function checkinDeviceField(me: Profile | null): Promise<{ device_id?: string }> {
  try {
    if (!deviceLockApplies(me)) return {};
    return { device_id: await getDeviceId() };
  } catch {
    return {};
  }
}
