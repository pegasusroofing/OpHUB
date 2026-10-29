// Check-in rules, ported from 030-generic-helpers.js (distMeters), 180-sites-list.js
// (siteStatusKey, fullSiteAddress), 440-check-in-out.js and 450-multi-site-check-in.
// Pure functions only: no Supabase, no React, so they can be unit-tested.

export type CheckType = 'in' | 'out';
export type CheckinRow = { id?: string; site_id?: string | null; sub_site_id?: string | null; user_id: string | null; type: string; ts: string | null };
export type Fence = { geofence_lat: number | null; geofence_lon: number | null; geofence_radius_m: number | null };
export type Pos = { lat: number; lon: number; accuracy?: number | null };

/** Straight-line distance in metres (haversine), same formula as the current app. */
export function distMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Geofence check. No fence set = no distance check (as today).
 * Returns the message to show, or null if close enough.
 * `place` is "site" for a normal job, "this address" for a multi-site address.
 */
export function geofenceError(type: CheckType, pos: Pos, fence: Fence, place: 'site' | 'this address'): string | null {
  if (fence.geofence_lat == null || fence.geofence_lon == null) return null;
  const dist = Math.round(distMeters(pos.lat, pos.lon, fence.geofence_lat, fence.geofence_lon));
  const allowed = fence.geofence_radius_m || 100;
  if (dist <= allowed) return null;
  return `${dist}m from ${place} — must be within ${allowed}m to ${type === 'in' ? 'check in' : 'check out'}. Move closer and try again.`;
}

/** "in" if the newest row is a check-in, otherwise "out". Rows newest first. */
export function statusFromLatest(rowsNewestFirst: Pick<CheckinRow, 'type'>[]): CheckType {
  return rowsNewestFirst[0]?.type === 'in' ? 'in' : 'out';
}

/** The server-side re-check before writing: stops a double check-in or a check-out with no check-in. */
export function alreadyMessage(type: CheckType, amIn: boolean, here = false): string | null {
  if (type === 'in' && amIn) return here ? "You're already checked in here." : "You're already checked in.";
  if (type === 'out' && !amIn) return here ? "You're not checked in here." : "You're not checked in.";
  return null;
}

/** Newest row per address ('' = the job itself, no address). Rows newest first. */
export function latestByAddress(rowsNewestFirst: CheckinRow[]): Record<string, CheckinRow> {
  const latest: Record<string, CheckinRow> = {};
  for (const r of rowsNewestFirst) {
    const k = r.sub_site_id || '';
    if (!(k in latest)) latest[k] = r;
  }
  return latest;
}

/** Addresses (other than this one) where the person is still checked in. */
export function checkedInElsewhere(latest: Record<string, CheckinRow>, subId: string): string[] {
  return Object.keys(latest).filter((k) => k !== subId && latest[k].type === 'in');
}

/** Managers, and companies without GPS, check in with no location and no distance check. */
export function needsGps(isManager: boolean, orgAllowsGps = true): boolean {
  return orgAllowsGps && !isManager;
}

/**
 * Pairs each person's raw in/out log (oldest first) into sessions.
 * out:null = still on site. A stray "out" with nothing open is kept as its own
 * row (in:null) so nothing silently disappears.
 */
export function buildCheckinSessions<T extends CheckinRow>(rowsAsc: T[]): { user_id: string; in: T | null; out: T | null }[] {
  const byUser: Record<string, T[]> = {};
  rowsAsc.forEach((c) => { (byUser[c.user_id || ''] ||= []).push(c); });
  const sessions: { user_id: string; in: T | null; out: T | null }[] = [];
  Object.keys(byUser).forEach((uid) => {
    let open: T | null = null;
    byUser[uid].forEach((c) => {
      if (c.type === 'in') {
        if (open) sessions.push({ user_id: uid, in: open, out: null });
        open = c;
      } else if (open) {
        sessions.push({ user_id: uid, in: open, out: c });
        open = null;
      } else {
        sessions.push({ user_id: uid, in: null, out: c });
      }
    });
    if (open) sessions.push({ user_id: uid, in: open, out: null });
  });
  return sessions;
}

/** "Today", "Yesterday", or e.g. "Mon, 27 Oct 2026". */
export function checkinDayLabel(ts: string | number | Date, now: Date = new Date()): string {
  const d = new Date(ts); d.setHours(0, 0, 0, 0);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === yest.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

export function timeHM(ts: string | number | Date): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/* ---------- sites ---------- */
export type SiteStatusKey = 'live' | 'upcoming' | 'closed';

/** Some sites say 'live' instead of 'active': both mean live. Anything unknown counts as upcoming. */
export function siteStatusKey(s: { status: string | null }): SiteStatusKey {
  if (s.status === 'active' || s.status === 'live') return 'live';
  return s.status === 'closed' || s.status === 'upcoming' ? s.status : 'upcoming';
}

export function fullSiteAddress(s: { address: string | null; postcode: string | null } | null): string | null {
  if (!s) return null;
  return [s.address, s.postcode].map((v) => (v || '').trim()).filter(Boolean).join(', ') || null;
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Saved clients (180 clientPortfolio): every client name used on a job, with the latest contact, phone and email given for it. */
export function clientPortfolio(sites: { client_name?: string | null; client_contact_name?: string | null; client_phone?: string | null; client_email?: string | null; created_at?: string | null }[]) {
  const by: Record<string, { name: string; contact: string; phone: string; email: string; count: number }> = {};
  [...sites].sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()).forEach((s) => {
    const n = String(s.client_name || '').trim(); if (!n) return;
    const c = (by[n.toLowerCase()] ||= { name: n, contact: '', phone: '', email: '', count: 0 });
    c.name = n; c.count++;
    if (s.client_contact_name) c.contact = s.client_contact_name;
    if (s.client_phone) c.phone = s.client_phone;
    if (s.client_email) c.email = s.client_email;
  });
  return Object.values(by).sort((a, b) => a.name.localeCompare(b.name));
}
