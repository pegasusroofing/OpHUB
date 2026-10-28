// Material requests (720/725/760/9219zr): operatives raise, edit and cancel their
// requests and tick off what they've collected; managers close, reopen, delete,
// group them and move them to Collections. Sending orders to suppliers is separate.
import { useQuery } from '@tanstack/react-query';

import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { localISODate } from '@/lib/rules/driver';
import { comingToSite, onSentPo, poLockText, subAddrLabel, type Mat, type Pickup } from '@/lib/rules/materials';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type SubAddr = { id: string; name: string; address: string | null; postcode: string | null; closed?: boolean | null };
export type Supplier = { id: string; name: string; email: string | null; favourite?: boolean | null; branches?: unknown };

function log(me: Profile, siteId: string, action: string, description: string) {
  if (me.org_id) void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action, description } as never);
}
function tellManagers(me: Profile, siteId: string, kind: string, body: string) {
  if (me.org_id) void db.from('messages').insert({ org_id: me.org_id, site_id: siteId, sender_id: me.id, audience: 'managers', kind, body } as never);
}

export function useSubAddresses(siteId: string | undefined, multi: boolean) {
  return useQuery({
    queryKey: ['subAddrs', siteId],
    enabled: !!siteId && multi,
    queryFn: () => cachedQuery(`subAddrs:${siteId}`, async () =>
      (orThrow(await db.from('site_sub_addresses').select('id,name,address,postcode,closed').eq('site_id', siteId as string).order('name')) as SubAddr[]).filter((a) => !a.closed)),
  });
}

/** Operative Materials screen: what to collect, what's coming, their waiting requests. */
export function useOpMaterials(siteId: string | undefined, meId: string | undefined) {
  return useQuery({
    queryKey: ['materials', siteId, 'op', meId],
    enabled: !!siteId && !!meId,
    queryFn: () => cachedQuery(`opMaterials:${siteId}:${meId}`, async () => {
      const [pick, coming, mine, sups] = await Promise.all([
        db.from('material_required_items').select('*').eq('site_id', siteId as string).eq('assigned_to', meId as string).in('status', ['assigned', 'collected']).order('created_at'),
        db.from('materials').select('*').eq('site_id', siteId as string).in('status', ['sent', 'closed']).order('required_for_delivery'),
        db.from('materials').select('*').eq('site_id', siteId as string).eq('requested_by', meId as string).eq('status', 'pending').order('created_at', { ascending: false }),
        db.from('suppliers').select('id,name,branches'),
      ]);
      const today = localISODate(new Date());
      return {
        pickups: orThrow(pick) as Pickup[],
        coming: comingToSite(orThrow(coming) as Mat[], today, localISODate(new Date(Date.now() - 14 * 864e5)), localISODate),
        mine: orThrow(mine) as Mat[],
        suppliers: ((sups.data as Supplier[] | null) ?? []),
      };
    }),
  });
}

export async function collectPickups(me: Profile, siteId: string, items: Pickup[]): Promise<number> {
  const now = new Date().toISOString();
  const res = await Promise.all(items.map((r) => db.from('material_required_items').update({ status: 'collected', qty_collected: r.qty || null, collected_by: me.id, collected_at: now } as never).eq('id', r.id)));
  const ok = res.filter((r) => !r.error).length;
  items.forEach((r) => log(me, siteId, 'material_required_item_collected', `Collected "${r.item || ''}"`));
  return ok;
}

/** The request list: operatives see Live (pending/sent) or Closed; managers To action (pending) or Completed. */
export type MatTab = 'live' | 'closed' | 'pending' | 'done';
export function useMaterialRequests(siteId: string | undefined, tab: MatTab) {
  return useQuery({
    queryKey: ['materials', siteId, 'list', tab],
    enabled: !!siteId,
    queryFn: () => cachedQuery(`materials:${siteId}:${tab}`, async () => {
      const statuses = tab === 'done' ? ['sent', 'closed', 'cancelled'] : tab === 'closed' ? ['closed', 'cancelled'] : tab === 'live' ? ['pending', 'sent'] : ['pending'];
      return orThrow(await db.from('materials').select('*').eq('site_id', siteId as string).in('status', statuses).order('created_at', { ascending: false })) as Mat[];
    }),
  });
}

export function useCollectionsOpenCount(siteId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['materials', siteId, 'collectN'],
    enabled: !!siteId && enabled,
    queryFn: async () => ((await db.from('material_required_items').select('id').eq('site_id', siteId as string).in('status', ['open', 'assigned'])).data ?? []).length,
  });
}

export async function addMaterial(me: Profile, siteId: string, f: { item: string; qty: string; requiredBy: string | null; sub: SubAddr | null }): Promise<boolean> {
  const r = await db.from('materials').insert({
    site_id: siteId, item: f.item, qty: f.qty || '1', required_by_date: f.requiredBy, requested_by: me.id, status: 'pending',
    sub_site_id: f.sub?.id ?? null, sub_site_label: f.sub ? subAddrLabel(f.sub) : null,
  } as never);
  if (r.error) return false;
  tellManagers(me, siteId, 'material_request', `${me.name} requested material: ${f.item} (qty ${f.qty || '1'})${f.requiredBy ? ` — required by ${f.requiredBy}` : ''}`);
  return true;
}

/** The PO lock (9219zr): null = go ahead, else the message to show. */
export async function poLock(ids: string[], isManager: boolean): Promise<string | null> {
  if (!ids.length) return null;
  const rows = ((await db.from('materials').select('*').in('id', ids)).data as Mat[] | null) ?? [];
  const hit = rows.find(onSentPo);
  return hit ? poLockText(hit, ids.length > 1, isManager) : null;
}

const dbMsg = (e: { message?: string } | null, isManager: boolean) => {
  const s = String(e?.message || ''); const i = s.indexOf('This item is on PO');
  return i >= 0 ? (isManager ? s.slice(i) : 'This has already been ordered by the office, so it can’t be changed here.') : 'Could not save — try again.';
};

export async function editMaterial(me: Profile, siteId: string, id: string, f: { item: string; qty: string; requiredBy: string | null }, isManager: boolean): Promise<string | null> {
  const r = await db.from('materials').update({ item: f.item, qty: f.qty || '1', required_by_date: f.requiredBy } as never).eq('id', id).select('id');
  if (r.error) return dbMsg(r.error, isManager);
  if (!(r.data as unknown[] | null)?.length) return 'Could not save — you may not have permission to change this request.';
  log(me, siteId, 'material_request_edited', `Edited material request "${f.item}"`);
  return null;
}

export async function cancelMaterial(me: Profile, id: string, reason: string, isManager: boolean): Promise<string | null> {
  const r = await db.from('materials').update({ status: 'cancelled', cancel_reason: reason, cancelled_by: me.id } as never).eq('id', id);
  return r.error ? dbMsg(r.error, isManager) : null;
}

export async function setMaterialsStatus(me: Profile, siteId: string, items: Mat[], status: 'closed'): Promise<boolean> {
  const res = await Promise.all(items.map((m) => db.from('materials').update({ status } as never).eq('id', m.id)));
  items.forEach((m) => log(me, siteId, 'material_request_closed', `Closed material request "${m.item || ''}"`));
  return res.every((r) => !r.error);
}

/** Back to 'sent' when it had been ordered (keeps the history), else 'pending'. */
export async function reopenMaterials(items: Mat[]): Promise<boolean> {
  const res = await Promise.all(items.map((m) => db.from('materials').update({ status: m.merchant || m.sent_at || m.email_sent_at || m.supplier_id ? 'sent' : 'pending' } as never).eq('id', m.id)));
  return res.every((r) => !r.error);
}

export async function deleteMaterials(me: Profile, siteId: string, items: Mat[], isManager: boolean): Promise<string | null> {
  for (const m of items) {
    const r = await db.from('materials').delete().eq('id', m.id);
    if (r.error) return dbMsg(r.error, isManager);
    log(me, siteId, 'material_request_deleted', `Deleted material request "${m.item || ''}"`);
  }
  return null;
}

export async function groupMaterials(items: Mat[]): Promise<boolean> {
  const gid = items.find((x) => x.group_id)?.group_id || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`);
  const res = await Promise.all(items.map((m) => db.from('materials').update({ group_id: gid } as never).eq('id', m.id)));
  return res.every((r) => !r.error);
}
export async function ungroupMaterials(items: Mat[]): Promise<boolean> {
  const res = await Promise.all(items.map((m) => db.from('materials').update({ group_id: null } as never).eq('id', m.id)));
  return res.every((r) => !r.error);
}

/** Requests → open Collection List rows (choose a collector there); the requests close, noted as moved. */
export async function toCollections(me: Profile, siteId: string, items: Mat[]): Promise<boolean> {
  const ins = await db.from('material_required_items').insert(items.map((m) => ({ site_id: siteId, org_id: me.org_id, item: m.item, qty: m.qty || null, supplier_id: null, status: 'open', created_by: me.id })) as never);
  if (ins.error) return false;
  await Promise.all(items.map((m) => db.from('materials').update({ status: 'closed', order_note: m.order_note ? `${m.order_note} · Moved to Collection List` : 'Moved to Collection List' } as never).eq('id', m.id)));
  log(me, siteId, 'material_moved_to_collection', items.length > 1 ? `Moved ${items.length} grouped items from Material Requests to Collections` : `Moved "${items[0].item}" from Material Requests to the Collection List`);
  return true;
}
