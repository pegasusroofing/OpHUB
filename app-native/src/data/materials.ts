// Material requests (720/725/760/9219zr): operatives raise, edit and cancel their
// requests and tick off what they've collected; managers close, reopen, delete,
// group them and move them to Collections. Sending orders to suppliers is separate.
import { useQuery } from '@tanstack/react-query';

import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { compressOne, type Picked } from '@/lib/photos';
import { DELIVERY_TIME_SLOTS, localISODate, slotProblem } from '@/lib/rules/driver';
import { branchLabel, comingToSite, companyOperativeLabel, onSentPo, orderCcEmails, orderRecipient, poLockText, subAddrLabel, type Branch, type Fulfil, type Mat, type OrderSupplier, type Pickup } from '@/lib/rules/materials';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

import { dayList, resequenceSlot } from './driver';

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

/* ---------- sending orders to suppliers (760 / 726 / 904 / 9219zr) ---------- */
export type FullSupplier = OrderSupplier & { favourite?: boolean | null };

export function useSuppliers(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['suppliers', orgId],
    enabled: !!orgId,
    queryFn: () => cachedQuery(`suppliers:${orgId}`, async () => orThrow(await db.from('suppliers').select('*').eq('org_id', orgId as string).order('name')) as FullSupplier[]),
  });
}

/** Up to 3 favourites pin to the top of the supplier list. */
export async function toggleFavourite(orgId: string, s: FullSupplier): Promise<string | null> {
  if (!s.favourite) {
    const n = ((await db.from('suppliers').select('id').eq('org_id', orgId).eq('favourite', true)).data ?? []).length;
    if (n >= 3) return 'You can only favourite up to 3 suppliers — unfavourite one first.';
  }
  return (await db.from('suppliers').update({ favourite: !s.favourite } as never).eq('id', s.id)).error ? 'Could not save — try again.' : null;
}

export type OrderPerson = { id: string; name: string; role: string; email: string | null };
/** Who could collect: every driver, and the operatives assigned to this job. */
export function useOrderPeople(siteId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['orderPeople', siteId],
    enabled: !!siteId && enabled,
    queryFn: async () => {
      const [p, a] = await Promise.all([
        db.from('profiles').select('id,name,role,email').in('role', ['driver', 'operative']).order('name'),
        db.from('site_assignments').select('user_id').eq('site_id', siteId as string),
      ]);
      const ppl = orThrow(p) as OrderPerson[];
      const on = new Set(((a.data as { user_id: string }[] | null) ?? []).map((x) => x.user_id));
      return { drivers: ppl.filter((x) => x.role === 'driver'), siteOps: ppl.filter((x) => x.role === 'operative' && on.has(x.id)) };
    },
  });
}

async function firstFreeSlot(orgId: string, dateISO: string, prefer: string): Promise<string> {
  const list = await dayList(orgId, dateISO);
  const keys = DELIVERY_TIME_SLOTS.map((s) => s.key);
  const start = Math.max(0, keys.indexOf(prefer));
  const order = keys.slice(start).concat(keys.slice(0, start));
  return order.find((k) => !slotProblem(list, { id: 'new', double_slot: false }, k, () => 'Site')) || prefer || keys[0];
}

/** A collection goes on the driver's Delivery Schedule (one job for the order) or the operative's Collections. */
async function bookCollection(me: Profile, siteId: string, f: Fulfil, supplier: OrderSupplier | null, toMe: boolean, mats: Mat[], poId: string | null, people: OrderPerson[], orgName: string | null, skip: boolean): Promise<string> {
  if (f.mode !== 'collection') return '';
  if (f.collectorKind === 'rtbop') return ` — to be collected by an ${companyOperativeLabel(orgName)}`;
  if (skip) return ` — not added to the ${f.collectorKind === 'driver' ? 'Delivery Schedule' : 'Collections tab'} again`;
  const whoName = people.find((p) => p.id === f.collectorId)?.name || 'them';
  const dateLabel = new Date(`${f.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
  const itemsText = mats.map((m) => m.item + (m.qty ? ` x ${m.qty}` : '')).join('; ');
  try {
    if (f.collectorKind === 'driver') {
      const oneSub = new Set(mats.map((m) => m.sub_site_id || '')).size === 1 ? mats[0] : null;
      const payload: Record<string, unknown> = {
        org_id: me.org_id, site_id: siteId, description: `Collect order: ${itemsText}${f.note ? ` — Note: ${f.note}` : ''}`,
        collection_type: toMe || f.branch ? 'manual' : 'supplier', supplier_id: toMe ? null : supplier?.id ?? null,
        collection_address_manual: f.branch ? `${supplier?.name ?? ''} ${branchLabel(f.branch)}` : toMe ? 'Supplier to be confirmed' : null,
        scheduled_date: f.date, time_slot: await firstFreeSlot(me.org_id as string, f.date, f.slot || '7am'), high_priority: false,
        driver_id: f.collectorId, needs_completing: false, created_by: me.id,
        sub_site_id: oneSub?.sub_site_id ?? null, sub_site_label: oneSub?.sub_site_label ?? null,
      };
      const r = await db.from('delivery_tasks').insert(payload as never).select('id').single();
      const saved = r.data as { id: string } | null;
      if (!saved) return ' — but it could not be added to the Delivery Schedule, add it by hand';
      // Link the collection to the requests (and PO) so the driver completing it marks them received (9219zr).
      void db.from('delivery_tasks').update({ material_ids: mats.map((m) => m.id), ...(poId ? { po_id: poId } : {}) } as never).eq('id', saved.id);
      try {
        await resequenceSlot(me.org_id as string, f.date, payload.time_slot as string);
        const ev = await db.from('site_calendar_events').insert({ org_id: me.org_id, site_id: siteId, title: `Delivery: ${payload.description as string}`, event_date: f.date, is_private: false, reminder_recipient_ids: [], created_by: me.id } as never).select('id').single();
        const evId = (ev.data as { id: string } | null)?.id;
        if (evId) await db.from('delivery_tasks').update({ calendar_event_id: evId } as never).eq('id', saved.id);
      } catch { /* best effort */ }
      if (f.collectorId !== me.id) void db.from('messages').insert({ org_id: me.org_id, site_id: siteId, sender_id: me.id, audience: 'single', recipient_id: f.collectorId, kind: 'delivery_assigned', body: `You've been assigned a collection for ${dateLabel}: ${itemsText}${f.note ? ` — Note: ${f.note}` : ''}`, related_id: saved.id } as never);
      return ` — added to the Delivery Schedule for ${whoName}, ${dateLabel}`;
    }
    const now = new Date().toISOString();
    const ins = await db.from('material_required_items').insert(mats.map((m) => ({
      site_id: siteId, org_id: me.org_id, item: `${m.item} (collect ${dateLabel}${f.note ? ` — ${f.note}` : ''})`, qty: m.qty || null,
      supplier_id: toMe ? null : supplier?.id ?? null, supplier_branch: f.branch || null, sub_site_id: m.sub_site_id || null, sub_site_label: m.sub_site_label || null,
      status: 'assigned', assigned_to: f.collectorId, assigned_at: now, created_by: me.id,
    })) as never);
    if (ins.error) return ' — but it could not be added to Collections, add it by hand';
    if (f.collectorId !== me.id) void db.from('messages').insert({ org_id: me.org_id, site_id: siteId, sender_id: me.id, audience: 'single', recipient_id: f.collectorId, kind: 'message', body: `Material to collect on ${dateLabel}${toMe ? '' : ` from ${supplier?.name ?? ''}`}: ${itemsText}${f.note ? ` — Note: ${f.note}` : ''}` } as never);
    return ` — added to Collections for ${whoName} to collect ${dateLabel}`;
  } catch { return ' — but the collection could not be booked, add it by hand'; }
}

/**
 * Sends one order (one or several requests) to a supplier, or "Email to me".
 * Closes the requests, raises a Finance PO (finance users only, as today — the
 * database also refuses it while the company's PO switch is off), books any
 * collection, then emails the order. Returns the message to show.
 */
export async function sendOrder(me: Profile, opts: {
  siteId: string; mats: Mat[]; supplier: OrderSupplier | null; toMe: boolean; f: Fulfil; financeUser: boolean;
  people: OrderPerson[]; orgName: string | null; skipBooking: boolean;
}): Promise<string> {
  const { siteId, supplier, toMe, f } = opts;
  const mats = opts.mats.filter((m) => m.site_id === siteId); // never order another job's ticks
  if (!mats.length) return 'Could not load the selected requests.';
  const myEmail = me.email || '';
  const to = orderRecipient(supplier, f, toMe, myEmail);
  if (!to) return f.sendTo === 'pm' || toMe ? 'There is no email address on your profile.' : `No order email for ${supplier?.name ?? 'that supplier'}${f.branch ? ` (${f.branch.name})` : ''} — add one in Admin › Suppliers.`;
  const name = toMe ? `Emailed to ${me.name}` : supplier?.name ?? '';
  const now = new Date().toISOString();
  const up = await Promise.all(mats.map((m) => db.from('materials').update({
    status: 'closed', merchant: name, supplier_id: toMe ? null : supplier?.id ?? null, sent_at: now, required_for_delivery: f.date,
    fulfilment: f.mode, collector_id: f.collectorId || null, order_note: f.note || null, supplier_branch: f.branch || null,
  } as never).eq('id', m.id)));
  if (up.every((r) => r.error)) return dbMsg(up[0].error, true);
  let warn = up.some((r) => r.error) ? 'Some requests could not be updated — check them manually. ' : '';
  let po: { id: string; note?: string | null } | null = null;
  if (opts.financeUser) {
    const rpc = supabase.rpc as unknown as (n: string, a: object) => Promise<{ data: unknown; error: unknown }>;
    const r = await rpc('fin_raise_po', {
      p_site: siteId, p_material_ids: mats.map((m) => m.id),
      p_supplier_id: !toMe && supplier && /^[0-9a-f-]{36}$/i.test(supplier.id) ? supplier.id : null,
      p_supplier_name: toMe ? `Emailed to ${me.name || 'me'}` : supplier?.name || null,
      p_branch: f.branch?.name || null, p_required: f.date || null, p_fulfilment: f.mode, p_note: f.note || null,
    });
    const d = r.data as { id?: string; note?: string | null } | null;
    po = !r.error && d?.id ? { id: d.id, note: d.note } : null;
    if (po && f.note.trim() && !po.note) await db.from('purchase_orders').update({ note: f.note.trim() } as never).eq('id', po.id);
  }
  const collectNote = await bookCollection(me, siteId, f, supplier, toMe, mats, po?.id ?? null, opts.people, opts.orgName, opts.skipBooking);
  const one = mats.length === 1 ? mats[0] : null;
  const body = {
    ...(one ? { material_id: one.id, item: one.item, qty: one.qty } : { items: mats.map((m) => ({ item: m.item, qty: m.qty })) }),
    supplier_email: to, supplier_name: toMe ? me.name : supplier?.name, supplier_id: toMe ? null : supplier?.id ?? null,
    site_id: siteId, po_id: po?.id ?? null, required_for_delivery: f.date, note: f.note || null,
    cc_user_ids: f.ccIds, cc_emails: orderCcEmails(supplier, f, toMe), fulfilment: f.mode,
    collector_name: f.collectorKind === 'rtbop' ? companyOperativeLabel(opts.orgName) : opts.people.find((p) => p.id === f.collectorId)?.name ?? null,
  };
  try {
    const r = await supabase.functions.invoke('send-material-order', { body });
    const err = (r.data as { error?: string } | null)?.error || (r.error ? 'check it manually.' : '');
    if (err) return `${warn}Routed to ${name}, but the order email failed to send — ${String(err).slice(0, 140)}`;
  } catch { return `${warn}Routed to ${name}, but the order email failed to send — check it manually.`; }
  const sentAt = new Date().toISOString();
  await Promise.all(mats.map((m) => db.from('materials').update({ email_sent_at: sentAt } as never).eq('id', m.id)));
  const cc = f.ccIds.length ? ` — copied to ${f.ccIds.length} operative${f.ccIds.length > 1 ? 's' : ''}` : '';
  warn += toMe ? `Order emailed to you at ${myEmail}` : f.sendTo === 'pm' ? `Order emailed to you only — ${name} was not emailed` : `Order emailed to ${name} at ${to} (you've been CC'd)`;
  return warn + cc + collectNote;
}

/** Re-email a sent order (the address can be changed for this one send). */
export async function reemailOrder(siteId: string, m: Mat, email: string, supplierName: string): Promise<string> {
  try {
    const r = await supabase.functions.invoke('send-material-order', { body: {
      material_id: m.id, supplier_email: email, supplier_name: supplierName, item: m.item, qty: m.qty, site_id: siteId,
      supplier_id: m.supplier_id || null, required_for_delivery: m.required_for_delivery, po_id: m.po_id || null,
    } });
    const err = (r.data as { error?: string } | null)?.error || (r.error ? 'check it manually.' : '');
    if (err) return `Re-email failed — ${String(err).slice(0, 140)}`;
  } catch { return 'Re-email failed — could not reach the server.'; }
  await db.from('materials').update({ email_sent_at: new Date().toISOString() } as never).eq('id', m.id);
  return `The order was re-emailed to ${email}.`;
}

/* ---------- Collections (730): items for an operative to pick up ---------- */
export type CollItem = Pickup & { site_id: string; assigned_to: string | null; qty_collected?: string | null; sub_site_id?: string | null; sub_site_label?: string | null; created_at: string };

export function useCollections(siteId: string | undefined, tab: 'live' | 'closed') {
  return useQuery({
    queryKey: ['materials', siteId, 'collections', tab],
    enabled: !!siteId,
    queryFn: () => cachedQuery(`collections:${siteId}:${tab}`, async () =>
      orThrow(await db.from('material_required_items').select('*').eq('site_id', siteId as string).in('status', tab === 'live' ? ['open', 'assigned', 'collected'] : ['closed']).order('created_at', { ascending: false })) as CollItem[]),
  });
}

export type CollDraft = { item: string; qty: string | null; supplier_id: string | null; supplier_branch: Branch | null; sub_site_id: string | null };
export async function addCollectionItems(me: Profile, siteId: string, rows: CollDraft[]): Promise<boolean> {
  return !(await db.from('material_required_items').insert(rows.map((r) => ({ site_id: siteId, org_id: me.org_id, ...r, status: 'open', created_by: me.id })) as never)).error;
}

export async function assignCollections(me: Profile, siteId: string, siteName: string, items: CollItem[], userId: string, userName: string): Promise<number> {
  const now = new Date().toISOString();
  const res = await Promise.all(items.map((m) => db.from('material_required_items').update({ assigned_to: userId, status: 'assigned', assigned_at: now } as never).eq('id', m.id)));
  const n = res.filter((r) => !r.error).length;
  if (n) {
    const label = items.length === 1 ? items[0].item : `${n} items`;
    void supabase.functions.invoke('notify-material-pickup', { body: { site_id: siteId, user_id: userId, item_label: label } }).catch(() => undefined);
    if (me.org_id) void db.from('messages').insert({ org_id: me.org_id, site_id: siteId, sender_id: me.id, audience: 'operatives', kind: 'material_pickup', body: items.length === 1 ? `${userName} was asked to collect "${label}" for ${siteName}.` : `${userName} was asked to collect ${n} item${n > 1 ? 's' : ''} for ${siteName}.` } as never);
  }
  return n;
}

export async function collectWithQty(me: Profile, id: string, qty: string): Promise<boolean> {
  return !(await db.from('material_required_items').update({ status: 'collected', qty_collected: qty || null, collected_by: me.id, collected_at: new Date().toISOString() } as never).eq('id', id)).error;
}

/** "✓ Collected" in the app; the stored value is 'closed'. */
export async function closeCollections(me: Profile, siteId: string, items: CollItem[]): Promise<number> {
  const now = new Date().toISOString();
  const res = await Promise.all(items.map((m) => db.from('material_required_items').update({ status: 'closed', closed_by: me.id, closed_at: now } as never).eq('id', m.id)));
  items.forEach((m, i) => { if (!res[i].error) log(me, siteId, 'material_required_item_closed', `Marked material item "${m.item || ''}" as collected`); });
  return res.filter((r) => !r.error).length;
}

export async function deleteCollection(me: Profile, siteId: string, m: CollItem): Promise<boolean> {
  const r = await db.from('material_required_items').delete().eq('id', m.id);
  if (!r.error) log(me, siteId, 'material_required_item_deleted', `Deleted material required item "${m.item || ''}"`);
  return !r.error;
}

export async function editCollection(id: string, patch: { item: string; qty: string | null; supplier_id: string | null; supplier_branch: Branch | null }): Promise<boolean> {
  return !(await db.from('material_required_items').update(patch as never).eq('id', id)).error;
}

/** PMs/admins with an email, for "Email Selected". */
export function useManagerEmails(enabled: boolean) {
  return useQuery({
    queryKey: ['managerEmails'],
    enabled,
    queryFn: async () => ((await db.from('profiles').select('id,name,email,role').in('role', ['pm', 'admin'])).data as { id: string; name: string; email: string | null }[] | null ?? []).filter((p) => !!p.email),
  });
}

export async function emailCollectionList(siteId: string, recipients: string[], items: { item: string; qty: string | null; supplier_name?: string | null }[], label: string): Promise<string | null> {
  try {
    const r = await supabase.functions.invoke('send-material-list-email', { body: { site_id: siteId, recipients, items, context_label: label } });
    const err = (r.data as { error?: string } | null)?.error || (r.error ? 'try again.' : '');
    return err ? `Email failed — ${String(err).slice(0, 140)}` : null;
  } catch { return 'Email failed — could not reach the server.'; }
}

/* ---------- Goods received (726 + 9219zr) ---------- */
export type Grn = { at: string; by: string; byName: string; ok: boolean; notes: string; photos: string[] };

/** Saves a GRN on a delivery; a problem tells the managers and (if it's on a PO) Finance. Returns the message, or an error. */
export async function saveGrn(me: Profile, siteId: string, m: Mat, ok: boolean, notes: string, photos: Picked[], isManager: boolean): Promise<{ ok: boolean; msg: string }> {
  if (!ok && !notes.trim()) return { ok: false, msg: "Add a note saying what's wrong" };
  const paths: string[] = [];
  for (const p of photos) {
    try {
      const uri = await compressOne(p);
      const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${paths.length}`;
      const up = await supabase.storage.from('site-photos').upload(`${siteId}/grn/${m.id}/${rid}.jpg`, await (await fetch(uri)).arrayBuffer(), { contentType: 'image/jpeg' });
      if (!up.error) paths.push(up.data.path);
    } catch { /* counted below */ }
  }
  if (paths.length < photos.length) return { ok: false, msg: 'Some photos could not upload — check signal and try again.' };
  const grn: Grn = { at: new Date().toISOString(), by: me.id, byName: me.name || '', ok, notes: notes.trim(), photos: paths };
  const r = await db.from('materials').update({ grn } as never).eq('id', m.id);
  if (r.error) return { ok: false, msg: dbMsg(r.error, isManager) };
  const item = m.item + (m.qty ? ` × ${m.qty}` : '');
  log(me, siteId, 'material_grn', `Goods received: ${item}${grn.ok ? '' : ` — PROBLEM: ${grn.notes}`}`);
  if (!grn.ok || grn.notes || paths.length) tellManagers(me, siteId, 'material_grn', `${me.name} received "${item}"${grn.ok ? '' : ' with a problem'}${grn.notes ? `: ${grn.notes}` : ''}${paths.length ? ` (${paths.length} photo${paths.length > 1 ? 's' : ''})` : ''}`);
  if (grn.ok) return { ok: true, msg: 'Goods received ✓' };
  try {
    const rpc = supabase.rpc as unknown as (n: string, a: object) => Promise<{ data: unknown; error: unknown }>;
    const f = await rpc('fin_flag_grn_problem', { p_material_id: m.id, p_note: grn.notes });
    let d = f.data as Record<string, unknown> | Record<string, unknown>[] | null;
    if (Array.isArray(d)) d = d[0];
    if (!f.error && !(d && (d.ok === false || d.po_id === null))) {
      const q = Number(d?.queried ?? d?.invoices_queried ?? d?.invoices);
      return { ok: true, msg: isManager ? `Saved — Finance has been told about the problem${q > 0 ? ` and ${q} supplier invoice${q === 1 ? ' is' : 's are'} on hold` : ''}` : 'Saved — the office has been told about the problem' };
    }
  } catch { /* the managers' message still went */ }
  return { ok: true, msg: 'Saved — managers told about the problem' };
}
