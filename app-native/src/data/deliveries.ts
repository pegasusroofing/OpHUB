// Delivery Schedule, office side (870): one day's drops, the "To schedule" list
// of waste / leftovers flagged on site, ▲▼ moves (hopping into the next free drop
// at the ends of a drop), add / edit / delete with the one-1st-drop-a-day swap,
// driver messages, the site Key Dates entry, and the weekly driver hours table.
import { useQuery } from '@tanstack/react-query';

import { dayList, messageTo, placeOf, resequenceSlot, rid, siteLabel, uploadPhoto, type Delivery } from '@/data/driver';
import type { Picked } from '@/lib/photos';
import { bySlotOrder, DELIVERY_TIME_SLOTS, localISODate, slotProblem } from '@/lib/rules/driver';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type FullDelivery = Delivery & { needs_completing?: boolean | null; sub_site_id?: string | null; completed_by?: string | null };
export type DeliveryRequest = { id: string; site_id: string; description: string; waste: boolean; leftover: boolean; flagged_by: string | null; photo_paths: string[] | null; created_at: string };
export type Staff = { id: string; name: string; role: string; phone: string | null };

export function useScheduleDay(orgId: string | null | undefined, iso: string) {
  return useQuery({
    queryKey: ['scheduleDay', orgId, iso],
    enabled: !!orgId,
    queryFn: async () => {
      const [t, s] = await Promise.all([
        db.from('delivery_tasks').select('*').eq('org_id', orgId as string).eq('scheduled_date', iso),
        db.from('suppliers').select('id,name').eq('org_id', orgId as string),
      ]);
      return { tasks: ((t.data as FullDelivery[] | null) ?? []), suppliers: Object.fromEntries(((s.data as { id: string; name: string }[] | null) ?? []).map((x) => [x.id, x.name])) as Record<string, string> };
    },
  });
}

export function useStaff() {
  return useQuery({
    queryKey: ['staff'], staleTime: 300000,
    queryFn: async () => (((await db.from('profiles').select('id,name,role,phone')).data as Staff[] | null) ?? []).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
  });
}

export function useDeliveryRequests(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['deliveryRequests', orgId],
    enabled: !!orgId,
    queryFn: async () => ((await db.from('delivery_requests').select('*').eq('org_id', orgId as string).eq('status', 'open').order('created_at')).data as DeliveryRequest[] | null) ?? [],
  });
}
export async function dismissRequest(id: string): Promise<boolean> {
  return !(await db.from('delivery_requests').update({ status: 'dismissed', updated_at: new Date().toISOString() } as never).eq('id', id)).error;
}

/** ▲/▼ on the schedule. Returns a message to show, or null when moved. */
export async function moveDelivery(me: Profile, t: FullDelivery, dir: 'up' | 'down', sites: Site[]): Promise<string | null> {
  const org = me.org_id as string;
  const list = await dayList(org, t.scheduled_date);
  const slotTasks = list.filter((x) => x.time_slot === t.time_slot).sort(bySlotOrder);
  const pos = slotTasks.findIndex((x) => x.id === t.id);
  const idx = DELIVERY_TIME_SLOTS.findIndex((s) => s.key === t.time_slot);
  const step = dir === 'up' ? -1 : 1;
  const upd = (id: string, patch: object) => db.from('delivery_tasks').update(patch as never).eq('id', id);
  const other = slotTasks[pos + step];
  if (other) {
    const mine = slotTasks[pos].sub_priority ?? null;
    await upd(t.id, { sub_priority: other.sub_priority ?? null });
    await upd(other.id, { sub_priority: mine });
    return null;
  }
  if ((dir === 'up' && idx <= 0) || (dir === 'down' && idx >= DELIVERY_TIME_SLOTS.length - 1)) return dir === 'up' ? 'Already the earliest slot of the day.' : 'Already the last slot of the day.';
  let firstWhy = '', dest = '';
  for (let j = idx + step; j >= 0 && j < DELIVERY_TIME_SLOTS.length; j += step) {
    const why = slotProblem(list, t, DELIVERY_TIME_SLOTS[j].key, placeOf(sites));
    if (!why) { dest = DELIVERY_TIME_SLOTS[j].key; break; }
    if (!firstWhy) firstWhy = why;
  }
  if (!dest) return firstWhy || (dir === 'up' ? 'No earlier drop is free.' : 'No later drop is free.');
  await upd(t.id, dir === 'up' ? { time_slot: dest, sub_priority: 999 } : { time_slot: dest, sub_priority: -999, high_priority: false });
  await resequenceSlot(org, t.scheduled_date, t.time_slot);
  await resequenceSlot(org, t.scheduled_date, dest);
  return null;
}

export type Draft = {
  id: string | null; manualSite: boolean; manual_site_name: string; manual_site_address: string; site_id: string; sub_site_id: string; sub_site_label: string | null;
  description: string; collection_type: string; supplier_id: string; supplier_branch: { id: string; name?: string; address?: string; phone?: string } | null;
  collection_address_manual: string; site_contact_id: string; site_contact_manual: string; photo_paths: string[];
  scheduled_date: string; time_slot: string; high_priority: boolean; double_slot: boolean; driver_id: string;
  requestId?: string | null;
};
export type Orig = { date: string; slot: string; driverId: string; calendarEventId: string | null } | null;

export function draftFrom(t: FullDelivery): { draft: Draft; orig: Orig } {
  return {
    draft: {
      id: t.id, manualSite: !t.site_id, manual_site_name: t.manual_site_name || '', manual_site_address: t.manual_site_address || '', site_id: t.site_id || '', sub_site_id: t.sub_site_id || '', sub_site_label: t.sub_site_label || null,
      description: t.description || '', collection_type: t.collection_type || 'yard', supplier_id: t.supplier_id || '', supplier_branch: (t.supplier_branch as Draft['supplier_branch']) || null,
      collection_address_manual: t.collection_address_manual || '', site_contact_id: t.site_contact_id || (t.site_contact_manual ? '__typed' : ''), site_contact_manual: t.site_contact_manual || '',
      photo_paths: t.photo_paths?.filter(Boolean).length ? t.photo_paths.filter(Boolean) : t.photo_path ? [t.photo_path] : [],
      scheduled_date: t.scheduled_date, time_slot: t.time_slot, high_priority: !!t.high_priority, double_slot: !!t.double_slot, driver_id: t.driver_id || 'none',
    },
    orig: { date: t.scheduled_date, slot: t.time_slot, driverId: t.driver_id || '', calendarEventId: t.calendar_event_id || null },
  };
}

export function blankDraft(date: string, slot: string | null, req: DeliveryRequest | null, people: Staff[]): Draft {
  return {
    id: null, manualSite: false, manual_site_name: '', manual_site_address: '', site_id: req?.site_id || '', sub_site_id: '', sub_site_label: null,
    description: req ? `${req.waste ? '🗑 ' : ''}${req.leftover ? '📦 ' : ''}${req.description}${req.flagged_by ? ` (flagged by ${people.find((p) => p.id === req.flagged_by)?.name || ''})` : ''}` : '',
    collection_type: req ? 'manual' : 'yard', supplier_id: '', supplier_branch: null, collection_address_manual: req ? 'Clear site' : '',
    site_contact_id: '', site_contact_manual: '', photo_paths: (req?.photo_paths ?? []).slice(),
    scheduled_date: date, time_slot: slot || '7am', high_priority: false, double_slot: false, driver_id: '', requestId: req?.id ?? null,
  };
}

export async function uploadDraftPhotos(me: Profile, picked: Picked[]): Promise<{ paths: string[]; failed: number }> {
  const paths: string[] = []; let failed = 0;
  for (const p of picked) {
    try { const path = await uploadPhoto(`${me.org_id}/delivery/drafts/${rid()}.jpg`, p); if (path) paths.push(path); else failed++; } catch { failed++; }
  }
  return { paths, failed };
}

/** The other 1st drop on that day, if this one would take it. */
export async function existingFirstDrop(me: Profile, d: Draft) {
  const r = await db.from('delivery_tasks').select('id,site_id,manual_site_name,manual_site_address,description,created_by,time_slot,status,sub_site_label').eq('org_id', me.org_id as string).eq('scheduled_date', d.scheduled_date).eq('high_priority', true).eq('status', 'pending');
  return ((r.data as FullDelivery[] | null) ?? []).filter((o) => o.id !== d.id);
}

export async function saveDelivery(me: Profile, d: Draft, orig: Orig, sites: Site[], clearHigh: FullDelivery[]): Promise<{ ok: boolean; msg: string }> {
  const org = me.org_id as string;
  const why = slotProblem(await dayList(org, d.scheduled_date), { id: d.id || 'new', double_slot: d.double_slot }, d.time_slot, placeOf(sites));
  if (why) return { ok: false, msg: why };
  const high = d.high_priority && d.time_slot === DELIVERY_TIME_SLOTS[0].key;
  const payload = {
    org_id: org, site_id: d.manualSite ? null : d.site_id, manual_site_name: d.manualSite ? d.manual_site_name.trim() || null : null, manual_site_address: d.manualSite ? d.manual_site_address.trim() || null : null,
    sub_site_id: !d.manualSite && d.sub_site_id ? d.sub_site_id : null, sub_site_label: !d.manualSite && d.sub_site_id ? d.sub_site_label : null,
    description: d.description.trim(), collection_type: d.collection_type,
    supplier_id: d.collection_type === 'supplier' ? d.supplier_id : null, supplier_branch: d.collection_type === 'supplier' ? d.supplier_branch : null,
    collection_address_manual: d.collection_type === 'manual' ? d.collection_address_manual.trim() : null,
    site_contact_id: d.site_contact_id && d.site_contact_id !== '__typed' ? d.site_contact_id : null,
    site_contact_manual: d.site_contact_id === '__typed' ? d.site_contact_manual.trim() || null : null,
    photo_path: d.photo_paths[0] || null, photo_paths: d.photo_paths, scheduled_date: d.scheduled_date, time_slot: d.time_slot,
    high_priority: high, double_slot: d.double_slot, driver_id: d.driver_id && d.driver_id !== 'none' ? d.driver_id : null, needs_completing: false,
  };
  let savedId = d.id;
  if (d.id) {
    if ((await db.from('delivery_tasks').update(payload as never).eq('id', d.id)).error) return { ok: false, msg: 'Could not save — check your connection and try again.' };
  } else {
    const r = await db.from('delivery_tasks').insert({ ...payload, created_by: me.id } as never).select('id').single();
    if (r.error || !r.data) return { ok: false, msg: 'Could not save — check your connection and try again.' };
    savedId = (r.data as { id: string }).id;
  }
  const id = savedId as string;
  try {
    if (orig && (orig.date !== payload.scheduled_date || orig.slot !== payload.time_slot)) await resequenceSlot(org, orig.date, orig.slot);
    await resequenceSlot(org, payload.scheduled_date, payload.time_slot);
    // Shows on the job's own Key Dates too (no reminders, so nothing is sent).
    if (payload.site_id) {
      const title = `Delivery: ${payload.description}`;
      if (orig?.calendarEventId) await db.from('site_calendar_events').update({ title, event_date: payload.scheduled_date, site_id: payload.site_id, reminder_sent: false } as never).eq('id', orig.calendarEventId);
      else {
        const ev = await db.from('site_calendar_events').insert({ org_id: org, site_id: payload.site_id, title, event_date: payload.scheduled_date, is_private: false, reminder_recipient_ids: [], created_by: me.id } as never).select('id').single();
        if (ev.data) await db.from('delivery_tasks').update({ calendar_event_id: (ev.data as { id: string }).id } as never).eq('id', id);
      }
    }
  } catch { /* best effort — the delivery itself is saved */ }
  const asDel = { ...payload, id } as unknown as Delivery;
  for (const o of clearHigh) {
    const c = await db.from('delivery_tasks').update({ high_priority: false } as never).eq('id', o.id);
    if (!c.error && o.created_by && o.created_by !== me.id) await messageTo(me, o.created_by, o.site_id, 'message', `1st drop removed from your delivery (${siteLabel(o, sites)}: ${o.description || ''}) — ${me.name} made a different delivery the first drop for that day.`, o.id);
  }
  if (orig?.driverId && orig.driverId !== (payload.driver_id || '') && orig.driverId !== me.id) {
    await messageTo(me, orig.driverId, payload.site_id, 'message', `A delivery is no longer assigned to you (${siteLabel(asDel, sites)}: ${payload.description})${payload.driver_id ? '' : ' — it is now unassigned'}.`, id);
  }
  if (payload.driver_id && payload.driver_id !== (orig?.driverId || '')) {
    await messageTo(me, payload.driver_id, payload.site_id, 'delivery_assigned', `You've been assigned a delivery/collection: ${payload.description}`, id);
  }
  if (d.requestId) await db.from('delivery_requests').update({ status: 'scheduled', delivery_task_id: id, updated_at: new Date().toISOString() } as never).eq('id', d.requestId);
  return { ok: true, msg: d.id ? 'Delivery updated' : 'Added to delivery schedule' };
}

export async function deleteDelivery(me: Profile, t: FullDelivery): Promise<boolean> {
  if ((await db.from('delivery_tasks').delete().eq('id', t.id)).error) return false;
  try {
    await resequenceSlot(me.org_id as string, t.scheduled_date, t.time_slot);
    if (t.calendar_event_id) await db.from('site_calendar_events').delete().eq('id', t.calendar_event_id);
  } catch { /* best effort */ }
  return true;
}

export async function loadDelivery(id: string): Promise<FullDelivery | null> {
  return ((await db.from('delivery_tasks').select('*').eq('id', id).maybeSingle()).data as FullDelivery | null) ?? null;
}

/** Each driver's check-in to check-out time for a Mon–Sun week (0 = this week, -1 = last). */
export function useDriverHours(orgId: string | null | undefined, week: number, enabled: boolean) {
  return useQuery({
    queryKey: ['driverHours', orgId, week],
    enabled: !!orgId && enabled,
    queryFn: async () => {
      const mon = new Date(); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) + 7 * week);
      const end = new Date(mon); end.setDate(end.getDate() + 7);
      const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(x.getDate() + i); return localISODate(x); });
      const [c, b] = await Promise.all([
        db.from('driver_checkins').select('user_id,type,ts').eq('org_id', orgId as string).gte('ts', mon.toISOString()).lt('ts', end.toISOString()).order('ts').limit(1000),
        db.from('driver_breaks').select('user_id,started_at,ended_at').eq('org_id', orgId as string).gte('started_at', mon.toISOString()).lt('started_at', end.toISOString()).order('started_at').limit(1000),
      ]);
      return { days, checks: (c.data as { user_id: string; type: string; ts: string }[] | null) ?? [], breaks: (b.data as { user_id: string; started_at: string; ended_at: string | null }[] | null) ?? [] };
    },
  });
}
