// Check in / check out. Ported from doCheckAction and doCheckActionSub (450-multi-site-check-in).
// Order (same as today):
//   1. re-check against the server (a page left open can't double check-in);
//   2. multi-site: address closed? still in elsewhere? photos on this address's tasks before check-out;
//   3. GPS + geofence (operatives only: managers check in with no location);
//   4. write the row, with this phone's device id (the database refuses a locked phone);
//   5. an operative's check-in tells the rest of the site team.
import * as Location from 'expo-location';

import { checkinDeviceField } from '@/lib/deviceLock';
import {
  alreadyMessage, checkedInElsewhere, geofenceError, latestByAddress, needsGps, timeHM, type CheckType, type Pos,
} from '@/lib/rules/checkin';
import { isManager } from '@/lib/roles';
import { pendingUploads } from '@/lib/uploadQueue';
import { supabase } from '@/lib/supabase';
import type { Profile, Site, SubAddress } from '@/lib/types';

export type CheckResult =
  | { ok: true; toast: string }
  | { ok: false; error?: string; alert?: string; toast?: string };

const NO_SIGNAL = 'Could not reach the server — check your signal and try again.';

async function getPosition(): Promise<Pos | { error: string }> {
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return { error: "Location permission denied. Enable it for this app in your phone's Settings." };
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((r) => setTimeout(() => r(null), 12000)),
    ]);
    if (!pos) return { error: 'Could not get a GPS lock — move into the open and try again.' };
    return { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy };
  } catch (e) {
    return { error: (e instanceof Error && e.message) || 'Could not get your location.' };
  }
}

async function notifyCheckin(me: Profile, siteId: string, type: CheckType) {
  // Only an operative's own check-IN; reaches the operatives assigned to the site.
  if (type !== 'in' || me.role !== 'operative' || !me.org_id) return;
  try {
    await supabase.from('messages').insert({
      org_id: me.org_id, site_id: siteId, sender_id: me.id, audience: 'operatives',
      kind: 'operative_checked_in', body: `${me.name} checked in on site`,
    });
  } catch { /* best effort: never blocks the check-in */ }
}

export async function doCheck(me: Profile, site: Site, type: CheckType, sub?: SubAddress): Promise<CheckResult> {
  // 1 + 2: fresh from the server, never the offline copy.
  if (sub) {
    const [addrRes, rowsRes] = await Promise.all([
      supabase.from('site_sub_addresses').select('id,name,closed').eq('id', sub.id),
      supabase.from('checkins').select('sub_site_id,type,ts,user_id').eq('site_id', site.id).eq('user_id', me.id)
        .order('ts', { ascending: false }).limit(200),
    ]);
    if (addrRes.error || rowsRes.error) return { ok: false, error: NO_SIGNAL };
    const latest = latestByAddress(rowsRes.data);
    const amIn = latest[sub.id]?.type === 'in';
    if (type === 'in') {
      if (addrRes.data[0]?.closed) return { ok: false, error: 'This address is closed — new check-ins are switched off.' };
      if (amIn) return { ok: false, toast: alreadyMessage('in', true, true) ?? undefined };
      const elsewhere = checkedInElsewhere(latest, sub.id);
      if (elsewhere.length) {
        const all = await supabase.from('site_sub_addresses').select('id,name').eq('site_id', site.id);
        const names = elsewhere.map((k) => all.data?.find((a) => a.id === k)?.name ?? (k ? 'another address' : 'this job')).join(', ');
        return { ok: false, alert: `You're still checked in at ${names}. Check out there first, then check in here.` };
      }
    } else {
      if (!amIn) return { ok: false, toast: alreadyMessage('out', false, true) ?? undefined };
      // Every Schedule of Works task for this address needs at least one photo first.
      const tasks = await supabase.from('schedule_tasks').select('id,name').eq('site_id', site.id).eq('sub_site_id', sub.id);
      if (tasks.error) return { ok: false, error: NO_SIGNAL };
      if (tasks.data.length) {
        const photos = await supabase.from('schedule_photos').select('task_id').in('task_id', tasks.data.map((t) => t.id));
        if (photos.error) return { ok: false, error: NO_SIGNAL };
        const withPhoto = new Set(photos.data.map((p) => p.task_id));
        // Photos still waiting for signal count too.
        (await pendingUploads()).forEach((j) => { const t = j.onDone?.row.task_id; if (typeof t === 'string') withPhoto.add(t); });
        const missing = tasks.data.filter((t) => !withPhoto.has(t.id));
        if (missing.length) {
          return { ok: false, alert: `Add at least one photo to the Schedule of Works task${missing.length === 1 ? '' : 's'} for this address before checking out: ${missing.map((t) => t.name).join(', ')}.` };
        }
      }
    }
  } else {
    const here = await supabase.from('checkins').select('type,ts').eq('site_id', site.id).eq('user_id', me.id)
      .order('ts', { ascending: false }).limit(1);
    if (here.error) return { ok: false, error: NO_SIGNAL };
    const msg = alreadyMessage(type, here.data[0]?.type === 'in');
    if (msg) return { ok: false, toast: msg };
  }

  // 3. GPS and geofence.
  let gps: Pos | null = null;
  if (needsGps(isManager(me))) {
    const g = await getPosition();
    if ('error' in g) return { ok: false, error: g.error };
    const err = geofenceError(type, g, sub ?? site, sub ? 'this address' : 'site');
    if (err) return { ok: false, error: err };
    gps = g;
  }

  // 4. Write it.
  const row = {
    site_id: site.id, user_id: me.id, type,
    ...(sub ? { sub_site_id: sub.id } : {}),
    ...(gps ? { lat: gps.lat, lon: gps.lon, accuracy_m: Math.round(gps.accuracy || 0) } : {}),
    ...(await checkinDeviceField(me)),
  };
  const ins = await supabase.from('checkins').insert(row);
  if (ins.error) {
    // P0001 = a refusal written for people (e.g. checkin_device_guard: phone locked to someone else).
    return { ok: false, error: ins.error.code === 'P0001' ? ins.error.message : NO_SIGNAL };
  }
  void notifyCheckin(me, site.id, type);
  return { ok: true, toast: `${type === 'in' ? 'Checked in' : 'Checked out'} · ${timeHM(Date.now())}` };
}
