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

/* ---------- two-way signing (Andy, 4 Nov 2026) ----------
   A PM allocates an item to an operative and a job, or approves an operative's request; the operative then signs for it.
   Handing back: the operative signs with a photo and a PM / yard manager confirms; a PM returning it just signs.
   Every step is a database function, so nothing can skip a signature. */
export type PlantRow = PlantItem & { lost_at?: string | null; lost_note?: string | null };
/** Every item in the company with its latest hand-over (the Yard › Plant register). */
export function useOrgPlant(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['plant', 'org', orgId], enabled: !!orgId,
    queryFn: async () => {
      const items = orThrow(await db.from('plant_items').select('*').eq('org_id', orgId as string).order('name').limit(2000)) as PlantRow[];
      const co = items.length ? orThrow(await db.from('plant_checkouts').select('*').eq('org_id', orgId as string).order('requested_at', { ascending: false }).limit(3000)) as Checkout[] : [];
      return { items, latest: latestByItem(co) };
    },
  });
}
const SIG = "Adopt your signature first — one tap and it's used everywhere.";
const rpcErr = (e: { message?: string } | null) => (!e ? null : /NEED_SIGNATURE/.test(e.message || '') ? SIG : (e.message || 'Could not save — try again.').replace(/^.*?ERROR:\s*/, ''));
const call = async (fn: string, args: object) => rpcErr((await supabase.rpc(fn as never, args as never)).error as { message?: string } | null);
export const allocatePlant = (itemId: string, operativeId: string, siteId: string | null, note = '') => call('plant_allocate', { p_item: itemId, p_operative: operativeId, p_site: siteId, p_note: note || null });
export const approvePlant = (checkoutId: string) => call('plant_approve', { p_checkout: checkoutId });
export const acceptPlant = (checkoutId: string) => call('plant_accept', { p_checkout: checkoutId });
export const confirmReturn = (checkoutId: string) => call('plant_confirm_return', { p_checkout: checkoutId, p_site: null, p_direct: false });
/** A PM returns it themselves (to the yard if siteId is null): they just sign. */
export const pmReturn = (checkoutId: string, siteId: string | null) => call('plant_confirm_return', { p_checkout: checkoutId, p_site: siteId, p_direct: true });
export const markLost = (itemId: string, lost: boolean, note = '') => call('plant_mark_lost', { p_item: itemId, p_lost: lost, p_note: note || null });
/** The operative signs it back with a photo, saying where it's been left (null = the yard). */
export async function opReturn(me: Profile, checkoutId: string, photo: Picked, notes: string, siteId: string | null): Promise<string | null> {
  const path = await upPhoto(me, photo);
  if (!path) return 'Photo failed to upload — check your connection and try again.';
  return call('plant_return', { p_checkout: checkoutId, p_photo: path, p_notes: notes || null, p_site: siteId });
}
/** Several identical items in one go, numbered (#01, #02 …), sharing one photo. siteId null = the yard. */
export async function addPlantBatch(me: Profile, siteId: string | null, f: { names: string[]; category: string; serial: string; description: string; interval: number | null; nextDue: string | null; photo: Picked }): Promise<string | null> {
  const path = await upPhoto(me, f.photo);
  if (!path) return 'Photo failed to upload — check your connection and try again.';
  const r = await db.from('plant_items').insert(f.names.map((name) => ({
    org_id: me.org_id, name, category: f.category, description: f.description || null, serial_number: f.names.length === 1 ? f.serial || null : null, photo_path: path,
    inspection_interval_months: f.interval, next_inspection_due: f.nextDue, current_site_id: siteId, current_status: 'available', created_by: me.id,
  })) as never);
  return r.error ? 'Could not save — try again.' : null;
}

export async function bringHere(me: Profile, siteId: string, item: PlantItem): Promise<string> {
  const cur = ((await db.from('plant_items').select('current_status,current_site_id').eq('id', item.id).limit(1)).data as { current_status: string; current_site_id: string | null }[] | null)?.[0];
  if (!cur) return 'Item not found';
  if (cur.current_status !== 'available') return "This item is currently checked out or out of service — it can't be transferred right now.";
  await db.from('plant_transfers').insert({ org_id: me.org_id, plant_item_id: item.id, from_site_id: cur.current_site_id, to_site_id: siteId, transferred_by: me.id } as never);
  return !(await db.from('plant_items').update({ current_site_id: siteId } as never).eq('id', item.id).select('id')).data?.length ? 'Could not save — try again.' : 'Item transferred here';
}
