// Manager side of Check In / Out. Ported from renderCheckin (440), the multi-site
// address flow (450, 370) and the geofence set-up (350): set the job's (or an
// address's) GPS point and check-in distance, the team's live status, the
// day-by-day history, the PM's own log for admins, and adding/closing addresses.
import { useQuery } from '@tanstack/react-query';

import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { supabase } from '@/lib/supabase';
import type { Checkin, Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

/** The job's (or address's) last 500 check-ins, oldest first, for pairing into sessions. */
export function useTeamCheckins(siteId: string | undefined, subId?: string, enabled = true) {
  return useQuery({
    queryKey: ['teamCheckins', siteId, subId ?? null],
    enabled: !!siteId && enabled,
    queryFn: () => cachedQuery(`teamCheckins:${siteId}:${subId ?? ''}`, async () => {
      let q = db.from('checkins').select('*').eq('site_id', siteId as string);
      if (subId) q = q.eq('sub_site_id', subId);
      // Newest 500, then reversed: a long job's recent activity always survives the cap.
      return (orThrow(await q.order('ts', { ascending: false }).limit(500)) as Checkin[]).reverse();
    }),
  });
}

/** Admins: the job's PM's own last few sign-ins. */
export function usePmLogins(siteId: string | undefined, pmId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['pmLogins', siteId, pmId],
    enabled: !!siteId && !!pmId && enabled,
    queryFn: async () => orThrow(await db.from('checkins').select('*').eq('site_id', siteId as string).eq('user_id', pmId as string).order('ts', { ascending: false }).limit(5)) as Checkin[],
  });
}

type Target = { table: 'sites' | 'site_sub_addresses'; id: string };
export async function setFencePoint(t: Target, lat: number, lon: number): Promise<boolean> {
  return !(await db.from(t.table).update({ geofence_lat: lat, geofence_lon: lon } as never).eq('id', t.id)).error;
}
export async function setFenceRadius(t: Target, radius: number): Promise<boolean> {
  return !(await db.from(t.table).update({ geofence_radius_m: radius } as never).eq('id', t.id)).error;
}

export async function addAddress(me: Profile, siteId: string, name: string, address: string, postcode: string): Promise<boolean> {
  return !(await db.from('site_sub_addresses').insert({ site_id: siteId, org_id: me.org_id, name, address: address || null, postcode: postcode || null, created_by: me.id } as never)).error;
}

export async function setAddressClosed(me: Profile, siteId: string, subId: string, name: string, closed: boolean): Promise<boolean> {
  const patch = closed ? { closed: true, closed_by: me.id, closed_at: new Date().toISOString() } : { closed: false, closed_by: null, closed_at: null };
  const r = await db.from('site_sub_addresses').update(patch as never).eq('id', subId);
  if (r.error) return false;
  if (closed && me.org_id) void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action: 'sub_address_closed', description: `Closed address "${name}"` } as never);
  return true;
}
