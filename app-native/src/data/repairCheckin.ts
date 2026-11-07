// Checking in and out of one repair job (Andy, 7 Nov 2026): as the normal check-in (GPS for operatives, the phone's
// device id, a fresh look at the server first), against the job's own address (from its postcode), and the row
// remembers which job it was. The contract stays the site, so timesheets and On Site Now work as they do.
import { useQuery } from '@tanstack/react-query';

import { getPosition, type CheckResult } from '@/data/checkinAction';
import { geocodeRepairJob } from '@/data/repairs';
import { checkinDeviceField } from '@/lib/deviceLock';
import { geofenceError, needsGps, timeHM, type CheckType } from '@/lib/rules/checkin';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

type Row = Record<string, any>;
const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const NO_SIGNAL = 'Could not reach the server — check your signal and try again.';

/** The newest check-in row per repair job (null key: checked in on the contract itself). Rows newest first. */
export function latestByJob(rows: { repair_job_id: string | null; type: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  rows.forEach((r) => { const k = r.repair_job_id || ''; if (!(k in out)) out[k] = r.type; });
  return out;
}

export function useRepairCheck(siteId: string | undefined, jobId: string | undefined, meId: string | undefined) {
  return useQuery({
    queryKey: ['repairCheck', jobId, meId], enabled: !!siteId && !!jobId && !!meId,
    queryFn: async () => {
      const r = await db.from('checkins').select('repair_job_id,type,ts').eq('site_id', siteId as string).eq('user_id', meId as string).eq('repair_job_id', jobId as string).order('ts', { ascending: false }).limit(1);
      const row = ((r.data as Row[] | null) ?? [])[0];
      return { in: row?.type === 'in', ts: (row?.ts as string | undefined) ?? null };
    },
  });
}

export async function repairCheck(me: Profile, siteId: string, job: Row, type: CheckType, jobs: Row[]): Promise<CheckResult> {
  const rows = await db.from('checkins').select('repair_job_id,type,ts').eq('site_id', siteId).eq('user_id', me.id).order('ts', { ascending: false }).limit(200);
  if (rows.error) return { ok: false, error: NO_SIGNAL };
  const latest = latestByJob((rows.data as Row[]) as never);
  const amIn = latest[job.id] === 'in';
  if (type === 'in') {
    if (amIn) return { ok: false, toast: "You're already checked in here." };
    const elsewhere = Object.keys(latest).filter((k) => k && k !== job.id && latest[k] === 'in');
    if (elsewhere.length) {
      const names = elsewhere.map((k) => { const o = jobs.find((x) => x.id === k); return o ? o.job_number || o.address || 'another job' : 'another job'; }).join(', ');
      return { ok: false, alert: `You're still checked in at ${names}. Check out there first, then check in here.` };
    }
  } else if (!amIn) return { ok: false, toast: "You're not checked in here." };

  let gps: { lat: number; lon: number; accuracy?: number | null } | null = null;
  if (needsGps(isManager(me))) {
    const g = await getPosition();
    if ('error' in g) return { ok: false, error: g.error };
    let fence = { geofence_lat: job.geofence_lat ?? null, geofence_lon: job.geofence_lon ?? null, geofence_radius_m: job.geofence_radius_m ?? 300 };
    if (fence.geofence_lat == null) { const p = await geocodeRepairJob(job.id, job.address); if (p) fence = { geofence_lat: p.lat, geofence_lon: p.lon, geofence_radius_m: 300 }; }
    const err = geofenceError(type, g, fence, 'this address');
    if (err) return { ok: false, error: err };
    gps = g;
  }
  const ins = await db.from('checkins').insert({
    site_id: siteId, user_id: me.id, type, repair_job_id: job.id,
    ...(gps ? { lat: gps.lat, lon: gps.lon, accuracy_m: Math.round(gps.accuracy || 0) } : {}),
    ...(await checkinDeviceField(me)),
  } as never);
  if (ins.error) return { ok: false, error: ins.error.code === 'P0001' ? ins.error.message : NO_SIGNAL };
  return { ok: true, toast: `${type === 'in' ? 'Checked in' : 'Checked out'} · ${timeHM(Date.now())}` };
}
