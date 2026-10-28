// Push notifications. Ported from 080-push-notifications.js.
// The server sends pushes through Firebase (FCM v1) straight to the device token saved
// in push_tokens, so we register the phone's own device token (not an Expo token)
// using the same claim_push_token database function as the current app.
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { isEstimator } from './roles';
import { supabase } from './supabase';
import type { Profile } from './types';

let tokenValue: string | null = null;

export async function registerPush(me: Profile | null): Promise<void> {
  try {
    if (!me || Platform.OS === 'web' || !Device.isDevice) return;
    if (isEstimator(me)) return; // estimators get no notifications
    let perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') perm = await Notifications.requestPermissionsAsync();
    if (perm.status !== 'granted') return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'OpHUB', importance: Notifications.AndroidImportance.HIGH });
    }
    const t = await Notifications.getDevicePushTokenAsync();
    tokenValue = typeof t.data === 'string' ? t.data : null;
    if (!tokenValue) return;
    const { error } = await supabase.rpc('claim_push_token', { p_token: tokenValue, p_platform: Platform.OS });
    if (error) {
      await supabase.from('push_tokens').upsert(
        { user_id: me.id, token: tokenValue, platform: Platform.OS, updated_at: new Date().toISOString() },
        { onConflict: 'token' },
      );
    }
  } catch (e) {
    console.warn('Push set-up failed', e);
  }
}

// Signing out stops this phone getting the outgoing person's notifications.
export async function unregisterPush(): Promise<void> {
  if (!tokenValue) return;
  try { await supabase.from('push_tokens').delete().eq('token', tokenValue); } catch { /* best effort */ }
}

// Where a tapped notification should take you. Screens are added in later phases;
// for now this returns the route the old app used, for the router to map.
export type PushData = { kind?: string; site_id?: string; task_id?: string };
export function pushRoute(data: PushData, me: Profile | null): string | null {
  if (data.task_id && me?.role === 'driver') return '/driver';
  if (!data.site_id) return null;
  const routes: Record<string, string> = {
    material_request: 'materials', variation: 'variations', snag_closed: 'snagging/list', todo_assigned: 'todos',
    price_overbooked: 'price', additional_works_requested: 'price', message: 'messages', rams_reminder: 'hs/rams',
    coshh_reminder: 'hs/coshh', material_pickup: 'materialrequired',
  };
  return `/site/${data.site_id}/${routes[data.kind || ''] || 'messages'}`;
}
