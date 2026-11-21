// A subcontractor's orders and variations on a job (Andy, 21 Nov 2026: "can we create a subcontractor order through the main
// contractor tab ... will it auto track the job. Can we have multiple orders within there selected to track. Can we add
// variations in there which add to the existing po raised, providing it's approved? Can subcontractors raise variation
// requests"). Orders are Finance's subcontract orders; one tracked on a subcontractor's page counts in its money tiles. A
// variation is asked for by us or by the subcontractor's own Project Manager; a Project Manager or admin approves it and
// its value is added to the order. Database: fin_sub_variations, sub_orders_for_company, sub_order_track, sub_variation_decide.
import { useQuery } from '@tanstack/react-query';

import { saveSubOrder } from '@/data/siteOrders';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const rpc = (n: string, a: object) => (supabase as unknown as { rpc: (n: string, a: object) => Promise<{ data: unknown; error: { message?: string } | null }> }).rpc(n, a);
const why = (e: { message?: string } | null, fallback: string) => String(e?.message || fallback).replace(/^.*?: /, '');

export type CoOrder = { id: string; number: string | null; name: string | null; status: string | null; order_value: number | null; tracked: boolean };
/** The job's subcontract orders that aren't another subcontractor's, and which are tracked on this one's page. */
export function useCoOrders(siteId: string | undefined, coId: string | undefined, on = true) {
  return useQuery({
    queryKey: ['coOrders', siteId, coId], enabled: !!siteId && !!coId && on,
    queryFn: async () => (((await rpc('sub_orders_for_company', { p_site: siteId, p_company: coId })).data as CoOrder[] | null) ?? []),
  });
}
export const trackOrder = async (orderId: string, coId: string, on: boolean) => (await rpc('sub_order_track', { p_subcontract: orderId, p_company: coId, p_on: on })).data === true;
/** Raises a subcontract order for this subcontractor (as Materials › Subcontract Orders does) and tracks it on their page. */
export async function raiseOrderFor(siteId: string, coId: string, co: { name: string; email?: string | null }, work: string): Promise<{ id: string } | string> {
  const before = new Set(((((await rpc('sub_orders_for_company', { p_site: siteId, p_company: coId })).data as CoOrder[] | null) ?? []).map((o) => o.id)));
  const err = await saveSubOrder(siteId, null, { name: co.name, email: co.email || '', description: work, notes: '' });
  if (err) return err;
  const after = (((await rpc('sub_orders_for_company', { p_site: siteId, p_company: coId })).data as CoOrder[] | null) ?? []);
  const made = after.find((o) => !before.has(o.id));
  if (!made) return 'The order is raised, but couldn’t be found to track here: tick it in the list.';
  await trackOrder(made.id, coId, true);
  return { id: made.id };
}

export type SubVariation = { id: string; site_id: string; subcontractor_company_id: string; subcontract_id: string | null; title: string; description: string | null; value: number; status: 'requested' | 'approved' | 'declined'; requested_by: string | null; requested_at: string; decided_at: string | null; decline_reason: string | null; added_to_order: number | null };
export function useSubVariations(coId: string | undefined, on = true) {
  return useQuery({
    queryKey: ['subVariations', coId], enabled: !!coId && on,
    queryFn: async () => ((await db.from('fin_sub_variations').select('*').eq('subcontractor_company_id', coId as string).order('requested_at', { ascending: false })).data as SubVariation[] | null) ?? [],
  });
}
export async function requestVariation(me: Profile, siteId: string, coId: string, v: { title: string; description: string; value: number; subcontractId?: string | null }): Promise<string | null> {
  const r = await db.from('fin_sub_variations').insert({ org_id: me.org_id, site_id: siteId, subcontractor_company_id: coId, subcontract_id: v.subcontractId || null, title: v.title.trim(), description: v.description.trim() || null, value: v.value, status: 'requested' } as never);
  return r.error ? 'Could not send it — try again.' : null;
}
/** Approve (its value goes onto the order) or decline. Null when done, else why not. */
export async function decideVariation(id: string, approve: boolean, subcontractId: string | null, reason = ''): Promise<string | null> {
  const r = await rpc('sub_variation_decide', { p_id: id, p_approve: approve, p_subcontract: subcontractId, p_reason: reason });
  return r.error ? why(r.error, 'Could not save — try again.') : null;
}
