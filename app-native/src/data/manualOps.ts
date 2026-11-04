// Operatives added by hand (9219zzg-manual-operatives, 4 Nov 2026): a manager adds someone by
// name, number, email and trade before they sign up. Stored in manual_operatives; their
// certificates are operative_certifications rows with manual_operative_id. In the app their id
// is written 'm-<uuid>' so the operative page, OneDrive picker and Training Matrix can tell them
// apart from a signed-up operative. When they sign up with the same email the database moves
// everything onto their login by itself (zz_manual_operative_autolink); or a manager presses Link.
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from>; rpc: (f: string, a: object) => Promise<{ data: unknown; error: { message?: string } | null }> };

export type ManualOp = {
  id: string; org_id: string; name: string; phone: string | null; email: string | null; trade: string | null;
  linked_profile_id: string | null; onedrive_folder_id: string | null; onedrive_folder_name: string | null; onedrive_last_synced_at: string | null;
};
export const isManualOpId = (id: unknown): id is string => typeof id === 'string' && id.indexOf('m-') === 0;
export const manualOpUuid = (id: string) => String(id).slice(2);
export const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The company's hand-added operatives not yet linked to a login, with how many certificates each has. */
export function useManualOperatives(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['manualOps', orgId], enabled: !!orgId,
    queryFn: async () => {
      const [r, c] = await Promise.all([
        db.from('manual_operatives').select('*').eq('org_id', orgId as string).is('linked_profile_id', null).order('name'),
        db.from('operative_certifications').select('manual_operative_id').eq('org_id', orgId as string).not('manual_operative_id', 'is', null),
      ]);
      const n: Record<string, number> = {};
      ((c.data as { manual_operative_id: string }[] | null) ?? []).forEach((x) => { n[x.manual_operative_id] = (n[x.manual_operative_id] || 0) + 1; });
      return ((r.data as ManualOp[] | null) ?? []).map((m) => ({ ...m, certs: n[m.id] || 0 }));
    },
  });
}
export function useManualOperative(uuid: string | undefined) {
  return useQuery({
    queryKey: ['manualOp', uuid], enabled: !!uuid,
    queryFn: async () => ((await db.from('manual_operatives').select('*').eq('id', uuid as string).maybeSingle()).data as ManualOp | null) ?? null,
  });
}

/** Adds them; hands back the new row's id, or an error message. */
export async function addManualOperative(me: Profile, f: { name: string; phone: string; email: string; trade: string }): Promise<{ id?: string; error?: string }> {
  const r = await db.from('manual_operatives').insert({ org_id: me.org_id, name: f.name, phone: f.phone || null, email: f.email || null, trade: f.trade || null, created_by: me.id } as never).select('id');
  const id = ((r.data as { id: string }[] | null) ?? [])[0]?.id;
  return id ? { id } : { error: 'Could not save — try again.' };
}
export async function saveManualOperative(uuid: string, f: { name: string; phone: string; email: string; trade: string }): Promise<boolean> {
  return !!(await db.from('manual_operatives').update({ name: f.name, phone: f.phone || null, email: f.email || null, trade: f.trade || null } as never).eq('id', uuid).select('id')).data?.length;
}
/** Moves their certificates (and OneDrive folder and number, if the login has none) onto a signed-up operative. */
export async function linkManualOperative(uuid: string, profileId: string): Promise<string | null> {
  try {
    const r = await db.rpc('link_manual_operative', { p_manual: uuid, p_profile: profileId });
    if (r.error) return `Could not link them — ${r.error.message || 'try again'}`;
    return r.data === true ? null : 'Could not link them — already linked, or not in your company';
  } catch { return 'Could not link them — check your connection.'; }
}
/** Removes them (asked first). Their certificates here go with them; their OneDrive folder is not touched. */
export async function removeManualOperative(uuid: string): Promise<boolean> {
  return !!(await db.from('manual_operatives').delete().eq('id', uuid).select('id')).data?.length;
}
