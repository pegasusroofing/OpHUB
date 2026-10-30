// Price tile (390): a job's Pricing Elements with their figures, colour groups,
// per-element access for operatives, add / rename / close / delete, the price
// total and booked-in override, and Variations to Price (request, approve,
// reject with a reason, remove).
import { useQuery } from '@tanstack/react-query';

import { elementFigures, groupFigures, type Figures, type PriceElement, type PriceWeek } from '@/lib/rules/price';
import { compressOne, type Picked } from '@/lib/photos';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type PriceVariation = { id: string; element_id: string; amount: number | null; note: string | null; status: string; requested_by: string | null; rejection_reason: string | null; photo_path: string | null; created_at: string };
export type PriceGroup = { id: string; name: string; color: string; sub_site_id: string | null };

export function usePriceTile(me: Profile | null, site: Site | undefined) {
  return useQuery({
    queryKey: ['priceTile', site?.id],
    enabled: !!me && !!site,
    queryFn: async () => {
      const s = site as Site, p = me as Profile, mgr = isManager(p);
      const [els, weeks, aw, groups, subs, grants, labour] = await Promise.all([
        db.from('pricing_elements').select('*').eq('site_id', s.id).order('sort_order').order('created_at'),
        db.from('price_weeks').select('element_id,week_number,amount').eq('site_id', s.id),
        db.from('additional_works_requests').select('*').eq('site_id', s.id).order('created_at'),
        db.from('pricing_element_groups').select('*').eq('site_id', s.id).order('created_at'),
        s.multi_site ? db.from('site_sub_addresses').select('id,name').eq('site_id', s.id).order('name') : Promise.resolve({ data: [] }),
        mgr ? Promise.resolve({ data: null }) : db.from('site_price_access').select('element_id').eq('site_id', s.id).eq('user_id', p.id),
        mgr ? Promise.resolve({ data: null }) : db.from('site_labour_invoice_access').select('element_id').eq('site_id', s.id).eq('user_id', p.id),
      ]);
      const elements = (els.data as PriceElement[] | null) ?? [];
      const variations = (aw.data as PriceVariation[] | null) ?? [];
      const w = (weeks.data as PriceWeek[] | null) ?? [];
      const figs: Record<string, Figures> = {};
      elements.forEach((el) => { figs[el.id] = elementFigures(el, w, variations); });
      const priceIds = grants.data ? new Set((grants.data as { element_id: string }[]).map((g) => g.element_id)) : null;
      const labourIds = labour.data ? new Set((labour.data as { element_id: string }[]).map((g) => g.element_id)) : null;
      const canPrice = (id: string) => mgr || !!priceIds?.has(id);
      const canLabour = (id: string) => mgr || !!labourIds?.has(id);
      const visible = elements.filter((el) => canPrice(el.id) || mgr || !!labourIds?.has(el.id));
      return {
        mgr, elements: visible, figs, variations, weeks: w, groups: (groups.data as PriceGroup[] | null) ?? [], groupFigs: groupFigures(visible, figs),
        subs: (subs.data as { id: string; name: string }[] | null) ?? [], canPrice, canLabour,
      };
    },
  });
}

export async function addElement(me: Profile, siteId: string, subId: string | null, name: string): Promise<boolean> {
  let q = db.from('pricing_elements').select('sort_order').eq('site_id', siteId);
  q = subId ? q.eq('sub_site_id', subId) : q.is('sub_site_id', null);
  const last = (((await q.order('sort_order', { ascending: false }).limit(1)).data as { sort_order: number | null }[] | null) ?? [])[0];
  return !(await db.from('pricing_elements').insert({ site_id: siteId, sub_site_id: subId, name, sort_order: last ? Number(last.sort_order || 0) + 1 : 0, created_by: me.id } as never)).error;
}
export async function patchElement(id: string, patch: Partial<PriceElement> & Record<string, unknown>): Promise<boolean> {
  return !!(await db.from('pricing_elements').update(patch as never).eq('id', id).select('id')).data?.length;
}
/** Deletes the element and everything under it (build-up, sheet, invoices, variations). */
export async function deleteElement(id: string): Promise<boolean> {
  return !!(await db.from('pricing_elements').delete().eq('id', id).select('id')).data?.length;
}

const notifyDecision = (siteId: string, userId: string | null, decision: string, siteName: string) => {
  if (userId) void supabase.functions.invoke('notify-variation-decision', { body: { site_id: siteId, user_id: userId, decision, site_name: siteName } }).catch(() => undefined);
};
export async function requestVariation(me: Profile, site: Site, elementId: string, amount: number, note: string, money: string): Promise<boolean> {
  const r = await db.from('additional_works_requests').insert({ site_id: site.id, element_id: elementId, amount, note, requested_by: me.id } as never);
  if (r.error) return false;
  if (me.org_id) void db.from('messages').insert({ org_id: me.org_id, site_id: site.id, sender_id: me.id, audience: 'managers', kind: 'additional_works_requested', body: `${site.name}: Variation to price requested for ${money} — needs approval.` } as never).then(undefined, () => undefined);
  return true;
}
export async function decideVariation(me: Profile, site: Site, v: PriceVariation, ok: boolean, reason?: string): Promise<boolean> {
  const r = await db.from('additional_works_requests').update({ status: ok ? 'approved' : 'rejected', approved_by: me.id, approved_at: new Date().toISOString(), rejection_reason: ok ? null : reason } as never).eq('id', v.id);
  if (r.error) return false;
  notifyDecision(site.id, v.requested_by, ok ? 'approved' : 'rejected', site.name);
  return true;
}
/** Pending → revised and approved; rejected → resubmitted; approved → just updated. */
export async function reviseVariation(me: Profile, site: Site, v: PriceVariation, amount: number, note: string): Promise<string | null> {
  const patch = v.status === 'rejected' ? { amount, note, status: 'pending', approved_by: null, approved_at: null, rejection_reason: null }
    : v.status === 'approved' ? { amount, note }
    : { amount, note, status: 'approved', approved_by: me.id, approved_at: new Date().toISOString(), rejection_reason: null };
  if (!(await db.from('additional_works_requests').update(patch as never).eq('id', v.id).select('id')).data?.length) return null;
  if (v.status !== 'approved') notifyDecision(site.id, v.requested_by, v.status === 'rejected' ? 'reopened' : 'revised_approved', site.name);
  return v.status === 'rejected' ? 'Revised — resubmitted for approval' : v.status === 'approved' ? 'Variation updated' : 'Revised and approved';
}
export async function removeVariation(me: Profile, siteId: string, v: PriceVariation): Promise<boolean> {
  if (!(await db.from('additional_works_requests').delete().eq('id', v.id).select('id')).data?.length) return false;
  if (me.org_id) void db.from('site_activity_log').insert({ org_id: me.org_id, site_id: siteId, actor_id: me.id, action: 'variation_to_price_deleted', description: `Deleted variation to price request "${v.note || ''}"` } as never).then(undefined, () => undefined);
  return true;
}

// Colour groups of tiles (390 pbCreateGroupForElement …): set up from each tile's ⋮.
export const GROUP_COLOURS = [
  { name: 'Blue', hex: '#1E88E5' }, { name: 'Green', hex: '#2E7D32' }, { name: 'Orange', hex: '#E67E22' },
  { name: 'Purple', hex: '#8E44AD' }, { name: 'Red', hex: '#C0392B' }, { name: 'Teal', hex: '#00897B' },
];
export async function newGroupFor(me: Profile, siteId: string, subId: string | null, elementId: string, name: string, existing: number): Promise<boolean> {
  const r = await db.from('pricing_element_groups').insert({ site_id: siteId, sub_site_id: subId, name, color: GROUP_COLOURS[existing % GROUP_COLOURS.length].hex, created_by: me.id } as never).select('id').single();
  if (r.error) return false;
  return !!(await db.from('pricing_elements').update({ group_id: (r.data as { id: string }).id } as never).eq('id', elementId).select('id')).data?.length;
}
export async function setElementGroup(elementId: string, groupId: string | null): Promise<boolean> {
  return !!(await db.from('pricing_elements').update({ group_id: groupId } as never).eq('id', elementId).select('id')).data?.length;
}
export async function updateGroup(groupId: string, patch: { name?: string; color?: string }): Promise<boolean> {
  return !!(await db.from('pricing_element_groups').update(patch as never).eq('id', groupId).select('id')).data?.length;
}

/** One quick photo on a variation to price (390 uploadAwPhoto). */
export async function addVariationPhoto(siteId: string, v: PriceVariation, p: Picked): Promise<boolean> {
  try {
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
    const up = await supabase.storage.from('site-photos').upload(`${siteId}/variations-to-price/${v.id}-${rid}.jpg`, await (await fetch(await compressOne(p))).arrayBuffer(), { contentType: 'image/jpeg' });
    if (up.error) return false;
    return !!(await db.from('additional_works_requests').update({ photo_path: up.data.path } as never).eq('id', v.id).select('id')).data?.length;
  } catch { return false; }
}
