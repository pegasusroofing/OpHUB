// Admin Centre › People (100, 250, 260, 320): the team list, role changes,
// phone numbers, sub form on/off, removing someone (remove-team-member, so their
// email can sign up again), invite links, and device locks.
import { useQuery } from '@tanstack/react-query';

import { rolePatch } from '@/lib/rules/users';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a: object) => Promise<{ data: unknown; error: unknown }>;

export const OPHUB_WEB_URL = 'https://operativehub.co.uk/app.html';
export const joinLink = (inviteId: string) => `${OPHUB_WEB_URL}#/join/${inviteId}`;

export type TeamMember = { id: string; name: string; email: string | null; role: string; is_estimator: boolean | null; phone: string | null; subform_required: boolean | null; finance_enabled?: boolean | null; finance_prev_role?: string | null };
export function useTeam(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['team', orgId],
    enabled: !!orgId,
    queryFn: async () => (((await db.from('profiles').select('id,name,email,role,is_estimator,phone,subform_required,finance_enabled,finance_prev_role').eq('org_id', orgId as string)).data as TeamMember[] | null) ?? []).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
  });
}
export async function setRole(id: string, role: string): Promise<boolean> {
  return !!(await db.from('profiles').update(rolePatch(role) as never).eq('id', id).select('id')).data?.length;
}
export async function setPhone(id: string, phone: string | null): Promise<boolean> {
  return !!(await db.from('profiles').update({ phone } as never).eq('id', id).select('id')).data?.length;
}
export async function setSubform(id: string, on: boolean): Promise<boolean> {
  return !!(await db.from('profiles').update({ subform_required: on } as never).eq('id', id).select('id')).data?.length;
}
/** Through the server, so the login itself goes too and the email is free again. */
export async function removeMember(id: string): Promise<{ ok: boolean; msg: string }> {
  const r = await supabase.functions.invoke('remove-team-member', { body: { user_id: id } });
  const d = r.data as { deleted?: string; error?: string } | null;
  return r.error || d?.error ? { ok: false, msg: `Could not remove — ${d?.error || 'try again'}` } : { ok: true, msg: `${d?.deleted || 'Team member'} removed` };
}

/* ---------- invites ---------- */
export type Invite = { id: string; email: string | null; role: string; created_at: string; expires_at: string; use_count?: number | null; is_reusable?: boolean | null };
export function useInvites(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['invites', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [p, perm] = await Promise.all([
        db.from('invites').select('*').eq('org_id', orgId as string).is('used_at', null).eq('is_reusable', false).order('created_at', { ascending: false }),
        db.from('invites').select('*').eq('org_id', orgId as string).eq('is_reusable', true).order('created_at', { ascending: false }).limit(1),
      ]);
      return { pending: (p.data as Invite[] | null) ?? [], permanent: ((perm.data as Invite[] | null) ?? [])[0] ?? null };
    },
  });
}
export async function createInvite(me: Profile, role: string): Promise<string | null> {
  const r = await db.from('invites').insert({ org_id: me.org_id, role, created_by: me.id } as never).select('id').single();
  return r.error || !r.data ? null : (r.data as { id: string }).id;
}
/** Never really expires (10 years) and can be used by any number of people. */
export async function createPermanentInvite(me: Profile): Promise<boolean> {
  return !(await db.from('invites').insert({ org_id: me.org_id, role: 'operative', created_by: me.id, is_reusable: true, expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10).toISOString() } as never)).error;
}
export async function revokeInvite(id: string): Promise<boolean> {
  return !!(await db.from('invites').delete().eq('id', id).select('id')).data?.length;
}
export async function emailInvite(inviteId: string, email: string): Promise<string> {
  const r = await supabase.functions.invoke('send-invite-email', { body: { invite_id: inviteId, email } });
  const d = r.data as { error?: string } | null;
  return r.error || d?.error ? d?.error || 'Could not send the invite email.' : `Invite email sent to ${email}`;
}

/* ---------- device locks ---------- */
export type DeviceLock = { device_id: string; user_name: string | null; status: string | null; last_seen_at: string; requested_at: string | null; locked_at: string | null };
export function useDeviceLocks(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['deviceLocks', orgId],
    enabled: !!orgId,
    queryFn: async () => ((await db.from('device_locks').select('*').eq('org_id', orgId as string).order('last_seen_at', { ascending: false })).data as DeviceLock[] | null) ?? [],
  });
}
/** Unlock (or deny): whoever next signs in on that phone locks it to themselves. */
export async function unlockDevice(deviceId: string): Promise<boolean> {
  return !(await db.from('device_locks').delete().eq('device_id', deviceId)).error;
}
export async function approveDevice(deviceId: string): Promise<string | null> {
  const r = await rpc('approve_pending_device', { p_device_id: deviceId });
  const d = r.data as { ok?: boolean; error?: string } | null;
  return !r.error && d?.ok ? null : `Could not approve — ${d?.error || 'try again'}`;
}

/** Switch OpHUB Finance on / off for someone (900 toggleFinanceAccess). Off: if they were only made a manager for Finance, their old role goes back. */
export async function toggleFinance(p: TeamMember): Promise<string> {
  const next = !p.finance_enabled;
  const r = await db.from('profiles').update({ finance_enabled: next } as never).eq('id', p.id).select('finance_enabled,role,finance_prev_role').maybeSingle();
  const row = r.data as { finance_enabled: boolean; role: string; finance_prev_role: string | null } | null;
  if (r.error || !row) return 'Could not save — try again.';
  if (row.finance_enabled !== next) return 'Only an admin with Finance switched on can change this.';
  const prev = !next && ['operative', 'driver', 'subcontractor', 'site_manager', 'client'].includes(row.finance_prev_role || '') ? row.finance_prev_role : null;
  if (prev && row.role === 'pm') {
    const b = await db.from('profiles').update({ role: prev, finance_prev_role: null } as never).eq('id', p.id).select('role').maybeSingle();
    return (b.data as { role: string } | null)?.role === prev ? `OpHUB Finance switched off for ${p.name} — their old role is back` : `OpHUB Finance switched off for ${p.name}, but they’re still a manager — change their role here.`;
  }
  if (!next && row.finance_prev_role) await db.from('profiles').update({ finance_prev_role: null } as never).eq('id', p.id);
  return next ? `OpHUB Finance switched on for ${p.name}` : `OpHUB Finance switched off for ${p.name}`;
}
