// Driver data and actions. Ported from 840-delivery-driver.js and 9219zz-driver-time-off.js.
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { checkinDeviceField } from '@/lib/deviceLock';
import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { compressOne, type Picked } from '@/lib/photos';
import { hasFails, localISODate, nextWorkingDay, pushSlot, resequence, slotLabel, slotProblem, weekStart, type DTask, type VItem } from '@/lib/rules/driver';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type Delivery = DTask & {
  org_id: string; created_by: string | null; description: string; site_contact_id: string | null; site_contact_manual: string | null;
  photo_path: string | null; photo_paths: string[] | null; scheduled_date: string; driver_id: string | null;
  completed_at: string | null; completion_photo_path: string | null; completion_photo_paths: string[] | null;
  calendar_event_id: string | null;
};
export type Brk = { id: string; started_at: string; ended_at: string | null };
export type Check = { id: string; type: string; ts: string };
export type TimeOff = { id: string; start_date: string; end_date: string; note: string | null };

export const deliveryPhotos = (t: Delivery) => (t.photo_paths?.filter(Boolean).length ? t.photo_paths.filter(Boolean) : t.photo_path ? [t.photo_path] : []);
export const completionPhotos = (t: Pick<Delivery, 'completion_photo_paths' | 'completion_photo_path'>) =>
  (t.completion_photo_paths?.filter(Boolean).length ? t.completion_photo_paths.filter(Boolean) : t.completion_photo_path ? [t.completion_photo_path] : []);

/** Name for a delivery's place in messages ("Smith House (Plot 3)" / manual name). */
export function siteLabel(t: Delivery, sites: Site[]): string {
  if (!t.site_id) return (t.manual_site_name || '').trim() || (t.manual_site_address || '').trim() || 'a site';
  const s = sites.find((x) => x.id === t.site_id);
  return s ? s.name + (t.sub_site_label ? ` (${t.sub_site_label.split(' — ')[0]})` : '') : 'a site';
}
/** Two-line heading: name, then address (or the address alone when it starts with the name). */
export function siteHeading(t: Delivery, sites: Site[]): string[] {
  if (!t.site_id) {
    const n = (t.manual_site_name || '').trim(), a = (t.manual_site_address || '').trim();
    if (!n && !a) return ['Unknown site'];
    if (!a || (n && a.toLowerCase().startsWith(n.toLowerCase()))) return [a || n];
    return n ? [n, a] : [a];
  }
  const s = sites.find((x) => x.id === t.site_id);
  if (!s) return ['Unknown site'];
  if (t.sub_site_label) return [(s.name || '').trim(), t.sub_site_label];
  const name = (s.name || '').trim(), addr = fullSiteAddress(s);
  if (!addr) return [name || 'Unknown site'];
  if (!name || addr.toLowerCase().startsWith(name.toLowerCase())) return [addr];
  return [name, addr];
}

export async function messageTo(me: Profile, userId: string, siteId: string | null, kind: string, body: string, relatedId?: string) {
  if (!me.org_id) return;
  try {
    await db.from('messages').insert({ org_id: me.org_id, site_id: siteId || null, sender_id: me.id, audience: 'single', recipient_id: userId, kind, body, related_id: relatedId || null } as never);
  } catch { /* best effort, as today */ }
}

/* ---------- on duty / breaks ---------- */
export function useDriverStatus() {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['driverStatus', me?.id],
    enabled: !!me,
    queryFn: () => cachedQuery(`driverStatus:${me?.id}`, async () => {
      const uid = (me as Profile).id;
      const since = new Date(); since.setDate(since.getDate() - 7); since.setHours(0, 0, 0, 0);
      const [h, b] = await Promise.all([
        db.from('driver_checkins').select('id,type,ts').eq('user_id', uid).order('ts', { ascending: false }).limit(40),
        db.from('driver_breaks').select('id,started_at,ended_at').eq('user_id', uid).gte('started_at', since.toISOString()).order('started_at', { ascending: false }).limit(60),
      ]);
      const history = orThrow(h) as Check[], breaks = orThrow(b) as Brk[];
      const onDuty = history[0]?.type === 'in';
      return { history, breaks, onDuty, openBreak: onDuty ? breaks.find((x) => !x.ended_at) ?? null : null };
    }),
  });
}

export async function driverCheck(me: Profile, type: 'in' | 'out'): Promise<boolean> {
  if (type === 'out') {
    try { await db.from('driver_breaks').update({ ended_at: new Date().toISOString() } as never).eq('user_id', me.id).is('ended_at', null); } catch { /* summary closes it too */ }
  }
  const r = await db.from('driver_checkins').insert({ org_id: me.org_id, user_id: me.id, type, ...(await checkinDeviceField(me)) } as never);
  if (r.error) return false;
  void supabase.functions.invoke('notify-driver-checkin', { body: { type } }).catch(() => undefined);
  return true;
}

export async function driverBreak(me: Profile, action: 'start' | 'end'): Promise<boolean> {
  const open = await db.from('driver_breaks').select('id').eq('user_id', me.id).is('ended_at', null);
  if (open.error) return false;
  if (action === 'start') {
    if ((open.data ?? []).length) return true; // already on a break
    return !(await db.from('driver_breaks').insert({ org_id: me.org_id, user_id: me.id, started_at: new Date().toISOString() } as never)).error;
  }
  return !(await db.from('driver_breaks').update({ ended_at: new Date().toISOString() } as never).eq('user_id', me.id).is('ended_at', null)).error;
}

/* ---------- schedule ---------- */
/** One day for a driver. viewAs: a manager's "Driver view" of another driver (or '' for none set up). */
export function useDriverDay(dateISO: string, viewAs?: string) {
  const { me } = useAuth();
  const who = viewAs ?? me?.id;
  return useQuery({
    queryKey: ['driverDay', who, dateISO],
    enabled: !!me,
    queryFn: () => cachedQuery(`driverDay:${who}:${dateISO}`, async () => {
      const p = me as Profile;
      const [t, s] = await Promise.all([
        db.from('delivery_tasks').select('*').eq('org_id', p.org_id as string).eq('scheduled_date', dateISO).order('sub_priority', { ascending: true }),
        db.from('suppliers').select('id,name').eq('org_id', p.org_id as string),
      ]);
      // A driver sees their own deliveries plus any not yet given to a driver.
      const tasks = (orThrow(t) as Delivery[]).filter((x) => !x.driver_id || x.driver_id === (who ?? p.id));
      const suppliers = Object.fromEntries((orThrow(s) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
      return { tasks, suppliers };
    }),
  });
}

export async function dayList(orgId: string, dateISO: string): Promise<DTask[]> {
  const r = await db.from('delivery_tasks').select('id,time_slot,double_slot,status,site_id,manual_site_name,manual_site_address,high_priority,sub_priority,created_at').eq('org_id', orgId).eq('scheduled_date', dateISO);
  return orThrow(r) as DTask[];
}
export async function resequenceSlot(orgId: string, dateISO: string, slot: string) {
  const rows = (await dayList(orgId, dateISO)).filter((r) => r.time_slot === slot);
  const want = resequence(rows);
  await Promise.all(rows.map((r) => (r.sub_priority !== want[r.id] ? db.from('delivery_tasks').update({ sub_priority: want[r.id] } as never).eq('id', r.id) : null)));
}
export const placeOf = (sites: Site[]) => (t: DTask) => (t.site_id ? sites.find((s) => s.id === t.site_id)?.name || 'Site' : t.manual_site_name || t.manual_site_address || 'Site');

/** Works out where a push would go; returns null + message if the day is full. */
export async function planPush(me: Profile, t: Delivery, sites: Site[]): Promise<{ date: string; slot: string; keepHigh: boolean; label: string } | { error: string }> {
  const nextISO = nextWorkingDay(t.scheduled_date, localISODate(new Date()));
  const label = new Date(`${nextISO}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' });
  const list = await dayList(me.org_id as string, nextISO);
  let keepHigh = !!t.high_priority;
  if (keepHigh && list.some((x) => x.high_priority && x.status === 'pending' && x.id !== t.id)) keepHigh = false;
  const slot = pushSlot(list, t, keepHigh, placeOf(sites));
  if (!slot) return { error: `No free drop on ${label} — ${slotProblem(list, t, '2pm', placeOf(sites))}` };
  return { date: nextISO, slot, keepHigh, label };
}

export async function pushDelivery(me: Profile, t: Delivery, plan: { date: string; slot: string; keepHigh: boolean; label: string }, sites: Site[]): Promise<string> {
  const newHigh = plan.keepHigh && plan.slot === '7am';
  const lostHigh = !!t.high_priority && !newHigh;
  const off = await dayOffBlock(me.org_id as string, plan.date, t.driver_id ?? null); if (off) return off;
  const r = await db.from('delivery_tasks').update({ scheduled_date: plan.date, time_slot: plan.slot, sub_priority: 999, high_priority: newHigh, updated_at: new Date().toISOString() } as never).eq('id', t.id).eq('status', 'pending');
  if (r.error) return 'Could not move it — try again.';
  try {
    await resequenceSlot(me.org_id as string, t.scheduled_date, t.time_slot);
    await resequenceSlot(me.org_id as string, plan.date, plan.slot);
    if (t.calendar_event_id) await db.from('site_calendar_events').update({ event_date: plan.date, reminder_sent: false } as never).eq('id', t.calendar_event_id);
  } catch { /* the move itself is saved */ }
  if (t.created_by && t.created_by !== me.id) {
    await messageTo(me, t.created_by, t.site_id, 'message',
      `Delivery pushed to ${plan.label}, ${slotLabel(plan.slot)} by ${me.name} — ${siteLabel(t, sites)}: ${t.description || ''}`
      + (lostHigh ? (plan.keepHigh ? ' (1st drop removed — the first drop that day is taken)' : ' (1st drop removed — that day already has one)') : ''), t.id);
  }
  void supabase.functions.invoke('notify-delivery-pushed', { body: { task_id: t.id } }).catch(() => undefined);
  return `Moved to ${plan.label}, ${slotLabel(plan.slot)}${lostHigh ? ' — no longer 1st drop' : ''}`;
}

export async function reopenDelivery(me: Profile, t: Delivery, choice: { date: string; slot: string }, sites: Site[]): Promise<{ ok: boolean; msg: string }> {
  const same = choice.date === t.scheduled_date && choice.slot === t.time_slot;
  if (!same) {
    const off = await dayOffBlock(me.org_id as string, choice.date, t.driver_id ?? null); if (off) return { ok: false, msg: off };
    const why = slotProblem(await dayList(me.org_id as string, choice.date), t, choice.slot, placeOf(sites));
    if (why) return { ok: false, msg: why };
  }
  let keepHigh = !!t.high_priority;
  if (keepHigh) {
    const c = await db.from('delivery_tasks').select('id').eq('org_id', me.org_id as string).eq('scheduled_date', choice.date).eq('high_priority', true).eq('status', 'pending').neq('id', t.id);
    if ((c.data ?? []).length) keepHigh = false;
  }
  const patch: Record<string, unknown> = { status: 'pending', completed_at: null, completed_by: null, completion_photo_path: null, completion_photo_paths: [], high_priority: keepHigh };
  if (!same) Object.assign(patch, { scheduled_date: choice.date, time_slot: choice.slot, sub_priority: 999 });
  const r = await db.from('delivery_tasks').update(patch as never).eq('id', t.id);
  if (r.error) return { ok: false, msg: 'Could not re-open it — try again.' };
  if (!same) {
    try {
      await resequenceSlot(me.org_id as string, t.scheduled_date, t.time_slot);
      await resequenceSlot(me.org_id as string, choice.date, choice.slot);
      if (t.calendar_event_id) await db.from('site_calendar_events').update({ event_date: choice.date, reminder_sent: false } as never).eq('id', t.calendar_event_id);
    } catch { /* best effort */ }
  }
  const when = `${new Date(`${choice.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' })}, ${slotLabel(choice.slot)}`;
  const body = `Delivery re-opened by ${me.name} for ${when} — ${siteLabel(t, sites)}: ${t.description || ''}` + (t.high_priority && !keepHigh ? ' (1st drop removed — that day already has one)' : '');
  for (const id of new Set([t.driver_id, t.created_by].filter((x): x is string => !!x && x !== me.id))) await messageTo(me, id, t.site_id, 'message', body, t.id);
  return { ok: true, msg: `Re-opened for ${when}` };
}

export async function uploadPhoto(path: string, p: Picked): Promise<string | null> {
  const uri = await compressOne(p);
  const bytes = await (await fetch(uri)).arrayBuffer();
  const up = await supabase.storage.from('site-photos').upload(path, bytes, { contentType: 'image/jpeg' });
  return up.error ? null : up.data.path;
}
export const rid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${Math.random().toString(16).slice(2)}`);

export async function addCompletionPhotos(me: Profile, t: Delivery, picked: Picked[]): Promise<{ added: number; failed: number }> {
  const added: string[] = []; let failed = 0;
  for (const p of picked) {
    try { const path = await uploadPhoto(`${me.org_id}/delivery/${t.id}/${rid()}.jpg`, p); if (path) added.push(path); else failed++; } catch { failed++; }
  }
  if (added.length) {
    const cur = await db.from('delivery_tasks').select('completion_photo_paths,completion_photo_path').eq('id', t.id);
    const all = completionPhotos(((cur.data as Delivery[] | null) ?? [])[0] ?? t).concat(added);
    const r = await db.from('delivery_tasks').update({ completion_photo_paths: all, completion_photo_path: all[0] } as never).eq('id', t.id);
    if (r.error) { failed += added.length; return { added: 0, failed }; }
  }
  return { added: added.length, failed };
}

export async function removeCompletionPhoto(t: Delivery, index: number): Promise<void> {
  const all = completionPhotos(t); all.splice(index, 1);
  await db.from('delivery_tasks').update({ completion_photo_paths: all, completion_photo_path: all[0] || null } as never).eq('id', t.id).neq('status', 'completed');
}

export async function completeDelivery(me: Profile, t: Delivery, sites: Site[]): Promise<string> {
  const photos = completionPhotos(t);
  if (!photos.length) return 'Add at least one photo before marking this complete.';
  const now = new Date().toISOString();
  const r = await db.from('delivery_tasks').update({ status: 'completed', completed_at: now, completed_by: me.id, completion_photo_paths: photos, completion_photo_path: photos[0] } as never).eq('id', t.id);
  if (r.error) return 'Could not save — try again.';
  // Tell the people the database says should know (site contact, PM…).
  try {
    const site = sites.find((s) => s.id === t.site_id);
    const when = new Date(now).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const body = `Delivery to ${site ? site.name : t.site_id ? 'your site' : siteLabel(t, sites)} completed by ${me.name} at ${when}.${photos.length > 1 ? ` ${photos.length} photos attached.` : ' Photo attached.'}`;
    const rr = await supabase.rpc('delivery_notify_recipients' as never, { p_task_id: t.id } as never);
    let ids: string[] = Array.isArray(rr.data) ? (rr.data as unknown[]).map((x) => (x && typeof x === 'object' ? ((x as Record<string, string>).delivery_notify_recipients || (x as Record<string, string>).id) : String(x))) : [];
    if (!ids.length) ids = [t.site_contact_id, site?.responsible_pm_id].filter((x): x is string => !!x);
    for (const id of new Set(ids.filter((x) => x && x !== me.id))) await messageTo(me, id, t.site_id, 'delivery_complete', body, t.id);
  } catch { /* best effort */ }
  return 'Delivery marked complete';
}

/* ---------- time off ---------- */
export function useTimeOff() {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['timeOff', me?.id],
    enabled: !!me,
    queryFn: async () => orThrow(await db.from('driver_time_off').select('*').eq('user_id', (me as Profile).id).gte('end_date', localISODate(new Date())).order('start_date', { ascending: true })) as TimeOff[],
  });
}

export async function bookTimeOff(me: Profile, from: string, to: string, note: string): Promise<string> {
  const r = await db.from('driver_time_off').insert({ org_id: me.org_id, user_id: me.id, start_date: from, end_date: to, note: note || null, created_by: me.id } as never);
  if (r.error) return 'Could not save — check your signal and try again.';
  const c = await db.from('delivery_tasks').select('id,site_id,description,scheduled_date,created_by').eq('org_id', me.org_id as string).eq('driver_id', me.id).neq('status', 'completed').gte('scheduled_date', from).lte('scheduled_date', to);
  const clash = (c.data as Delivery[] | null) ?? [];
  for (const t of clash) {
    if (t.created_by && t.created_by !== me.id) {
      await messageTo(me, t.created_by, t.site_id, 'message', `${me.name} has booked a day off on ${new Date(`${t.scheduled_date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}. Your delivery${t.description ? ` (${t.description})` : ''} that day needs moving to another day or driver.`, t.id);
    }
  }
  return clash.length ? `Booked. You had ${clash.length} deliver${clash.length === 1 ? 'y' : 'ies'} on those days — the office has been told.` : 'Time off booked';
}
export async function removeTimeOff(id: string): Promise<boolean> {
  return !!(await db.from('driver_time_off').delete().eq('id', id).select('id')).data?.length;
}

/* ---------- vehicle checklist ---------- */
export type Checklist = { id: string | null; vehicle_reg: string; mileage: string; week_start: string; items: Record<string, VItem>; status: string };

export async function loadChecklist(me: Profile): Promise<{ draft: Checklist; history: { id: string; week_start: string; has_fails: boolean }[] }> {
  const ws = weekStart();
  const [cur, hist] = await Promise.all([
    db.from('vehicle_checklists').select('*').eq('driver_id', me.id).eq('week_start', ws).order('created_at', { ascending: true }).limit(1),
    db.from('vehicle_checklists').select('id,week_start,has_fails').eq('driver_id', me.id).eq('status', 'submitted').order('week_start', { ascending: false }).limit(8),
  ]);
  const row = ((orThrow(cur) as { id: string; vehicle_reg: string | null; mileage: number | null; items: VItem[] | null; status: string }[]) ?? [])[0];
  const items: Record<string, VItem> = {};
  (row?.items ?? []).forEach((it) => { items[it.key] = it; });
  return {
    draft: { id: row?.id ?? null, vehicle_reg: row?.vehicle_reg || '', mileage: row?.mileage ? String(row.mileage) : '', week_start: ws, items, status: row?.status || 'in_progress' },
    history: orThrow(hist) as { id: string; week_start: string; has_fails: boolean }[],
  };
}

export async function saveChecklist(me: Profile, d: Checklist, submit = false): Promise<string | null> {
  const fails = hasFails(d.items);
  const fields: Record<string, unknown> = {
    vehicle_reg: d.vehicle_reg || null, mileage: parseInt(String(d.mileage).replace(/[^0-9]/g, ''), 10) || null,
    items: Object.values(d.items), has_fails: fails,
    ...(submit ? { status: 'submitted', submitted_at: new Date().toISOString() } : {}),
  };
  let id = d.id;
  if (!id) {
    const ex = await db.from('vehicle_checklists').select('id').eq('driver_id', me.id).eq('week_start', d.week_start).limit(1);
    id = ((ex.data as { id: string }[] | null) ?? [])[0]?.id ?? null;
  }
  if (id) {
    const r = await db.from('vehicle_checklists').update(fields as never).eq('id', id);
    return r.error ? null : id;
  }
  const r = await db.from('vehicle_checklists').insert({ org_id: me.org_id, driver_id: me.id, week_start: d.week_start, status: submit ? 'submitted' : 'in_progress', ...fields } as never).select('id');
  return r.error ? null : (((r.data as { id: string }[] | null) ?? [])[0]?.id ?? null);
}

export async function uploadChecklistPhoto(me: Profile, p: Picked): Promise<string | null> {
  return uploadPhoto(`${me.org_id}/vehicle-checklist/${me.id}/${rid()}.jpg`, p);
}

/** After submitting: mileage check, and failed items go to the managers. */
export async function afterChecklistSubmit(me: Profile, d: Checklist, failedLabels: string[]): Promise<void> {
  void supabase.functions.invoke('vehicle-mileage-check', { body: {} }).catch(() => undefined);
  if (failedLabels.length && me.org_id) {
    try {
      await db.from('messages').insert({
        org_id: me.org_id, site_id: null, sender_id: me.id, audience: 'managers', kind: 'vehicle_checklist_fail',
        body: `${me.name}'s weekly vehicle checklist (${d.vehicle_reg || 'no reg given'}) has ${failedLabels.length} failed item${failedLabels.length === 1 ? '' : 's'}: ${failedLabels.join('; ')}.`,
      } as never);
    } catch { /* best effort */ }
  }
}

/** A marked-up copy of a completion photo takes the old one's place (840 markupDeliveryCompletionPhoto). */
export async function replaceCompletionPhoto(t: Delivery, oldPath: string, newPath: string): Promise<boolean> {
  const cur = await db.from('delivery_tasks').select('completion_photo_paths,completion_photo_path').eq('id', t.id);
  const all = completionPhotos(((cur.data as Delivery[] | null) ?? [])[0] ?? t); const i = all.indexOf(oldPath);
  if (i >= 0) all[i] = newPath; else all.push(newPath);
  return !!(await db.from('delivery_tasks').update({ completion_photo_paths: all, completion_photo_path: all[0] } as never).eq('id', t.id).select('id')).data?.length;
}

/** Why a delivery can't go on this day (9219zz dtoBlockFor): the chosen driver is off, or (no driver
 *  chosen) every driver is off. The database refuses it too (delivery_driver_off_check); this says why. */
export async function dayOffBlock(orgId: string, date: string | null | undefined, driverId: string | null): Promise<string | null> {
  if (!date) return null;
  const off = ((await db.from('driver_time_off').select('user_id').eq('org_id', orgId).lte('start_date', date).gte('end_date', date)).data as { user_id: string }[] | null) ?? [];
  if (!off.length) return null;
  const offIds = new Set(off.map((o) => o.user_id));
  const day = new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const tail = (one: boolean) => ` Pick another day${one ? '' : ', or another driver'}. This delivery hasn’t been saved.`;
  const people = ((await db.from('profiles').select('id,name,role').eq('org_id', orgId).eq('role', 'driver')).data as { id: string; name: string }[] | null) ?? [];
  const who = (id: string) => people.find((p) => p.id === id)?.name || 'The driver';
  if (driverId) return offIds.has(driverId) ? `🌴 Driver has a scheduled day off — ${who(driverId)} is off on ${day}.${tail(false)}` : null;
  if (people.length && people.every((p) => offIds.has(p.id))) return `🌴 Driver has a scheduled day off — ${people.length === 1 ? `${people[0].name} (the driver) is` : 'every driver is'} off on ${day}.${tail(true)}`;
  return null;
}
