// Plant register (740): one company-wide pool of plant and PAT-tested items, each
// at one job (or the yard). Operatives request a check-out (with the pre-use
// checklist) or a check-in (photo required); nothing changes hands until a manager
// signs it off with their adopted signature. Managers add items, mark out of
// service, remove, and bring items here from another job. RLS limits item changes
// to managers.
import { useQuery } from '@tanstack/react-query';
import { mustHit } from '@/lib/mustHit';

import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { compressOne, type Picked } from '@/lib/photos';
import { latestByItem, PLANT_CHECKLIST, type Checkout, type PlantItem } from '@/lib/rules/plant';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Me = Profile & { signature_path?: string | null };

export function usePlant(siteId: string | undefined, orgId: string | null | undefined, others: boolean) {
  return useQuery({
    queryKey: ['plant', siteId, others],
    enabled: !!siteId && !!orgId,
    queryFn: () => cachedQuery(`plant:${siteId}:${others}`, async () => {
      const [here, away] = await Promise.all([
        db.from('plant_items').select('*').eq('org_id', orgId as string).eq('current_site_id', siteId as string).order('name'),
        others ? db.from('plant_items').select('*').eq('org_id', orgId as string).or(`current_site_id.neq.${siteId},current_site_id.is.null`).order('name') : Promise.resolve({ data: [], error: null }),
      ]);
      const items = orThrow(here) as PlantItem[];
      const co = items.length ? orThrow(await db.from('plant_checkouts').select('*').in('plant_item_id', items.map((i) => i.id)).order('requested_at', { ascending: false })) as Checkout[] : [];
      return { items, latest: latestByItem(co), others: orThrow(away) as PlantItem[] };
    }),
  });
}

async function upPhoto(me: Profile, p: Picked): Promise<string | null> {
  try {
    const uri = await compressOne(p);
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
    const up = await supabase.storage.from('operative-tools').upload(`${me.org_id}/plant/${rid}.jpg`, await (await fetch(uri)).arrayBuffer(), { contentType: 'image/jpeg' });
    return up.error ? null : up.data.path;
  } catch { return null; }
}

export async function addPlantItem(me: Profile, siteId: string, f: { name: string; category: string; serial: string; description: string; interval: number; nextDue: string; photo: Picked }): Promise<string | null> {
  const path = await upPhoto(me, f.photo);
  if (!path) return 'Photo failed to upload — check your connection and try again.';
  const r = await db.from('plant_items').insert({
    org_id: me.org_id, name: f.name, category: f.category, description: f.description || null, serial_number: f.serial || null, photo_path: path,
    inspection_interval_months: f.interval, next_inspection_due: f.nextDue, current_site_id: siteId, current_status: 'available', created_by: me.id,
  } as never);
  return r.error ? 'Could not save — try again.' : null;
}

export async function requestCheckout(me: Profile, siteId: string, itemId: string, answers: Record<string, boolean>) {
  const checklist_answers = PLANT_CHECKLIST.map((q) => ({ key: q.key, label: q.label, answer: !!answers[q.key] }));
  return !(await db.from('plant_checkouts').insert({ org_id: me.org_id, plant_item_id: itemId, site_id: siteId, operative_id: me.id, checklist_answers, checkout_status: 'pending_signoff' } as never)).error;
}
export async function requestCheckin(me: Profile, checkoutId: string, photo: Picked, notes: string): Promise<string | null> {
  const path = await upPhoto(me, photo);
  if (!path) return 'Photo failed to upload — check your connection and try again.';
  const r = mustHit(await db.from('plant_checkouts').update({ checkin_requested_at: new Date().toISOString(), checkin_photo_path: path, checkin_notes: notes || null, checkin_status: 'pending_signoff' } as never).eq('id', checkoutId).select('id'));
  return r.error ? 'Could not save — try again.' : null;
}

const NEED_SIG = "Adopt your signature first — one tap and it's used everywhere.";
export async function signOffCheckout(me: Me, c: Checkout): Promise<string> {
  if (!me.signature_path) return NEED_SIG;
  const r = mustHit(await db.from('plant_checkouts').update({ checkout_status: 'checked_out', checkout_signed_by: me.id, checkout_signed_at: new Date().toISOString(), checkout_signature_path: me.signature_path } as never).eq('id', c.id).select('id'));
  if (r.error) return 'Could not save — try again.';
  await db.from('plant_items').update({ current_status: 'checked_out' } as never).eq('id', c.plant_item_id);
  return 'Check-out signed off';
}
export async function signOffCheckin(me: Me, c: Checkout): Promise<string> {
  if (!me.signature_path) return NEED_SIG;
  const r = mustHit(await db.from('plant_checkouts').update({ checkin_status: 'returned', checkin_signed_by: me.id, checkin_signed_at: new Date().toISOString(), checkin_signature_path: me.signature_path } as never).eq('id', c.id).select('id'));
  if (r.error) return 'Could not save — try again.';
  await db.from('plant_items').update({ current_status: 'available' } as never).eq('id', c.plant_item_id);
  return 'Check-in signed off';
}
export const declineCheckout = async (id: string) => !!(await db.from('plant_checkouts').update({ checkout_status: 'declined' } as never).eq('id', id).select('id')).data?.length;
export const declineCheckin = async (id: string) => !!(await db.from('plant_checkouts').update({ checkin_status: 'declined' } as never).eq('id', id).select('id')).data?.length;
export const setOutOfService = async (id: string, out: boolean) => !!(await db.from('plant_items').update({ current_status: out ? 'out_of_service' : 'available' } as never).eq('id', id).select('id')).data?.length;
export const removePlant = async (id: string) => !!(await db.from('plant_items').delete().eq('id', id).select('id')).data?.length;

export async function bringHere(me: Profile, siteId: string, item: PlantItem): Promise<string> {
  const cur = ((await db.from('plant_items').select('current_status,current_site_id').eq('id', item.id).limit(1)).data as { current_status: string; current_site_id: string | null }[] | null)?.[0];
  if (!cur) return 'Item not found';
  if (cur.current_status !== 'available') return "This item is currently checked out or out of service — it can't be transferred right now.";
  await db.from('plant_transfers').insert({ org_id: me.org_id, plant_item_id: item.id, from_site_id: cur.current_site_id, to_site_id: siteId, transferred_by: me.id } as never);
  return !(await db.from('plant_items').update({ current_site_id: siteId } as never).eq('id', item.id).select('id')).data?.length ? 'Could not save — try again.' : 'Item transferred here';
}
