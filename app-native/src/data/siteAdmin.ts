// A job's Settings & Admin (380/370/385): who's assigned, site set-up switches,
// addresses, job status, client info and the activity history. Managers only.
import { useQuery, type QueryClient } from '@tanstack/react-query';

import { orThrow } from '@/lib/offlineCache';
import { localISODate } from '@/lib/rules/driver';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';
import { mustHit } from '@/lib/mustHit';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type TeamPerson = { id: string; name: string; email: string | null; role: string };

export function useTeamData(siteId: string | undefined, mc: boolean) {
  return useQuery({
    queryKey: ['siteTeam', siteId, mc],
    enabled: !!siteId,
    queryFn: async () => {
      const [p, a, c, so] = await Promise.all([
        db.from('profiles').select('id,name,email,role').in('role', ['operative', 'site_manager', 'client']).order('name'),
        db.from('site_assignments').select('user_id').eq('site_id', siteId as string),
        mc ? db.from('subcontractor_companies').select('id,name').eq('site_id', siteId as string).order('created_at') : Promise.resolve({ data: [] }),
        mc ? db.from('subcontractor_operatives').select('id,user_id,subcontractor_company_id').eq('site_id', siteId as string) : Promise.resolve({ data: [] }),
      ]);
      const people = orThrow(p) as TeamPerson[];
      return {
        operatives: people.filter((x) => x.role === 'operative'),
        siteManagers: people.filter((x) => x.role === 'site_manager'),
        clients: people.filter((x) => x.role === 'client'),
        assigned: new Set(((a.data as { user_id: string }[] | null) ?? []).map((x) => x.user_id)),
        companies: ((c.data as { id: string; name: string }[] | null) ?? []),
        subOps: ((so.data as { id: string; user_id: string; subcontractor_company_id: string }[] | null) ?? []),
      };
    },
  });
}

const notifyAssigned = (siteId: string, userId: string) => { void supabase.functions.invoke('notify-site-assignment', { body: { site_id: siteId, user_id: userId } }).catch(() => undefined); };

export async function assignToSite(me: Profile, siteId: string, userId: string): Promise<string | null> {
  const r = await db.from('site_assignments').insert({ site_id: siteId, user_id: userId, assigned_by: me.id } as never);
  if (r.error) return 'Could not assign — try again.';
  notifyAssigned(siteId, userId);
  return null;
}

/** Takes someone off a job (and any subcontractor allocation there). Checks it really went: RLS can quietly remove nothing. */
export async function removeFromSite(siteId: string, userId: string): Promise<string | null> {
  const r = await db.from('site_assignments').delete().eq('site_id', siteId).eq('user_id', userId).select('user_id');
  if (r.error) return `Could not remove — ${r.error.message}`;
  if (!(r.data as unknown[] | null)?.length) {
    const still = await db.from('site_assignments').select('user_id').eq('site_id', siteId).eq('user_id', userId).limit(1);
    if ((still.data ?? []).length) return 'Nothing was removed — you may not have permission to take people off this job.';
  }
  await db.from('subcontractor_operatives').delete().eq('site_id', siteId).eq('user_id', userId);
  return null;
}

/** Allocate an operative to a subcontractor company on this job (one company per job); that also gives them the job. */
export async function toggleSubOperative(me: Profile, siteId: string, companyId: string, userId: string, allocId: string | null): Promise<string | null> {
  if (allocId) return !(await db.from('subcontractor_operatives').delete().eq('id', allocId).select('id')).data?.length ? 'Could not save — try again.' : null;
  const ex = ((await db.from('subcontractor_operatives').select('id,subcontractor_company_id').eq('site_id', siteId).eq('user_id', userId)).data as { subcontractor_company_id: string }[] | null) ?? [];
  if (ex.length && ex[0].subcontractor_company_id !== companyId) return 'Already allocated to a different subcontractor on this site — remove them there first.';
  const r = await db.from('subcontractor_operatives').insert({ site_id: siteId, subcontractor_company_id: companyId, user_id: userId, assigned_by: me.id, is_admin: false } as never);
  if (r.error) return 'Could not save — try again.';
  const on = (await db.from('site_assignments').select('user_id').eq('site_id', siteId).eq('user_id', userId).limit(1)).data ?? [];
  if (!on.length && !(await db.from('site_assignments').insert({ site_id: siteId, user_id: userId, assigned_by: me.id } as never)).error) notifyAssigned(siteId, userId);
  return null;
}

export async function updateSite(qc: QueryClient, siteId: string, patch: Partial<Site> & Record<string, unknown>): Promise<boolean> {
  const r = await db.from('sites').update(patch as never).eq('id', siteId);
  if (!r.error) void qc.invalidateQueries({ queryKey: ['sites'] });
  return !r.error;
}

/** Closing stamps who/when (cleared on reopen) and stops repeating calendar series after today, as today. */
export async function setSiteStatus(qc: QueryClient, me: Profile, siteId: string, status: 'live' | 'upcoming' | 'closed'): Promise<boolean> {
  const patch = status === 'closed' ? { status, closed_at: new Date().toISOString(), closed_by: me.id } : { status, closed_at: null, closed_by: null };
  const ok = await updateSite(qc, siteId, patch);
  if (ok && status === 'closed') {
    try { await db.from('site_calendar_events').delete().eq('site_id', siteId).not('recurrence_group_id', 'is', null).gt('event_date', localISODate(new Date())); } catch { /* not fatal */ }
  }
  return ok;
}

export type FullSubAddr = { id: string; name: string; address: string | null; postcode: string | null; geofence_lat: number | null; geofence_radius_m: number | null; closed?: boolean | null };
export function useSiteAddresses(siteId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['subAddresses', siteId, 'admin'],
    enabled: !!siteId && enabled,
    queryFn: async () => orThrow(await db.from('site_sub_addresses').select('id,name,address,postcode,geofence_lat,geofence_radius_m,closed').eq('site_id', siteId as string).order('name')) as FullSubAddr[],
  });
}
export async function saveSubAddress(me: Profile, siteId: string, editId: string | null, f: { name: string; address: string; postcode: string }): Promise<boolean> {
  const row = { name: f.name, address: f.address || null, postcode: f.postcode || null };
  const r = editId ? await db.from('site_sub_addresses').update(row as never).eq('id', editId)
    : await db.from('site_sub_addresses').insert({ ...row, site_id: siteId, org_id: me.org_id, created_by: me.id } as never);
  return !r.error;
}
/** Close an address that's finished (no more check-ins there) or reopen it (385 toggleSubAddressClosed). */
export async function setSubAddressClosed(me: Profile, siteId: string, a: FullSubAddr, closed: boolean): Promise<boolean> {
  const r = await db.from('site_sub_addresses').update({ closed } as never).eq('id', a.id);
  if (!r.error && me.org_id) void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action: closed ? 'sub_address_closed' : 'sub_address_reopened', description: `${closed ? 'Closed' : 'Reopened'} address "${a.name || ''}"` } as never).then(undefined, () => undefined);
  return !r.error;
}
export async function deleteSubAddress(me: Profile, siteId: string, a: FullSubAddr): Promise<boolean> {
  const r = mustHit(await db.from('site_sub_addresses').delete().eq('id', a.id).select('id'));
  if (!r.error && me.org_id) void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action: 'sub_address_deleted', description: `Deleted address "${a.name || ''}"` } as never).then(undefined, () => undefined);
  return !r.error;
}

/* ---------- Activity History (385) ---------- */
export type ActivityItem = { type: 'changes' | 'notices'; at: string; by: string | null; head: string; text: string };
const KIND_LABEL: Record<string, string> = {
  material_request: 'Material requested', variation: 'Variation raised', snag_closed: 'Snag closed', snag_raised: 'Snag raised', schedule_flag: 'Site flag raised',
  delivery_complete: 'Delivery completed', permit_issued: 'Permit issued', permit_closed: 'Permit closed', material_grn: 'Goods received', material_pickup: 'Material to collect',
};
const words = (a: string | null) => String(a || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
export function useActivity(siteId: string | undefined, limit: number) {
  return useQuery({
    queryKey: ['siteActivity', siteId, limit],
    enabled: !!siteId,
    queryFn: async () => {
      const [l, m] = await Promise.all([
        db.from('site_activity_log').select('action,description,actor_id,created_at').eq('site_id', siteId as string).order('created_at', { ascending: false }).limit(limit),
        // Ordinary chat and routine check-in notices are left out — this is a record of actions.
        db.from('messages').select('kind,body,sender_id,created_at').eq('site_id', siteId as string).not('kind', 'in', '(message,operative_checked_in)').order('created_at', { ascending: false }).limit(limit),
      ]);
      const logs = (l.data as { action: string; description: string | null; actor_id: string | null; created_at: string }[] | null) ?? [];
      const msgs = (m.data as { kind: string; body: string | null; sender_id: string | null; created_at: string }[] | null) ?? [];
      const items: ActivityItem[] = [
        ...logs.map((r) => ({ type: 'changes' as const, at: r.created_at, by: r.actor_id, head: words(r.action), text: r.description || '' })),
        ...msgs.map((r) => ({ type: 'notices' as const, at: r.created_at, by: r.sender_id, head: KIND_LABEL[r.kind] || words(r.kind), text: r.body || '' })),
      ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
      return { items, more: logs.length >= limit || msgs.length >= limit };
    },
  });
}
