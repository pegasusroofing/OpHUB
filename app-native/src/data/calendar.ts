// The job calendar (780): key dates for everyone on the job (private ones managers
// only — RLS too), repeating dates, email reminders (sent by the daily
// send-calendar-reminders cron), the job's delivery dates (9219zr), and the
// project PM's approved time off when they've linked it to project calendars (186).
import { useQuery } from '@tanstack/react-query';

import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { DELIVERY_TIME_SLOTS, slotProblem } from '@/lib/rules/driver';
import { eachDay, isWorkingDay } from '@/lib/rules/hr';
import { deliveryLines, recurrenceDates, reminderDate, type Repeat, type Timing } from '@/lib/rules/calendar';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

import { dayList, resequenceSlot } from './driver';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type CalEvent = {
  id: string; site_id: string; title: string; event_date: string; is_private: boolean; recurrence_group_id: string | null;
  reminder_recipient_ids: string[] | null; reminder_timing: Timing | null; reminder_date: string | null;
};
export type CalLine = (CalEvent & { kind: 'event' }) | { kind: 'delivery' | 'leave'; id: string; event_date: string; title: string };

export function useCalendar(siteId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ['calendar', siteId, from, to],
    enabled: !!siteId,
    queryFn: () => cachedQuery(`calendar:${siteId}:${from}:${to}`, async () => {
      const rpc = supabase.rpc as unknown as (n: string, a: object) => Promise<{ data: unknown; error: unknown }>;
      const [ev, dl, lv] = await Promise.all([
        db.from('site_calendar_events').select('*').eq('site_id', siteId as string).gte('event_date', from).lte('event_date', to).order('event_date').order('created_at'),
        rpc('site_delivery_dates', { p_site: siteId, p_from: from, p_to: to }).catch(() => ({ data: [], error: null })),
        rpc('site_pm_leave', { p_site: siteId, p_from: from, p_to: to }).catch(() => ({ data: [], error: null })),
      ]);
      const lines: CalLine[] = (orThrow(ev) as CalEvent[]).map((e) => ({ ...e, kind: 'event' as const }));
      deliveryLines(Array.isArray(dl.data) ? (dl.data as Record<string, unknown>[]) : []).forEach((d, i) => lines.push({ kind: 'delivery', id: `dlv-${d.date}-${i}`, event_date: d.date, title: d.title }));
      (Array.isArray(lv.data) ? (lv.data as { user_id: string; name: string; code: string | null; half: boolean | null; start_date: string; end_date: string }[]) : []).forEach((l) => eachDay(l.start_date, l.end_date, (ds) => {
        if (ds < from || ds > to || !isWorkingDay(ds)) return;
        lines.push({ kind: 'leave', id: `lv${ds}${l.user_id}`, event_date: ds, title: `${l.name} off (${(l.code || '').toUpperCase()}${l.half ? ' ½ day' : ''})` });
      }));
      const byDate: Record<string, CalLine[]> = {};
      lines.forEach((l) => { (byDate[l.event_date] ||= []).push(l); });
      return byDate;
    }),
  });
}

export type Recipient = { id: string; name: string; role: string };
/** Who a reminder can go to: PMs/admins and the people on the job. */
export function useRecipients(siteId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['calRecipients', siteId],
    enabled: !!siteId && enabled,
    queryFn: async () => {
      const [p, a] = await Promise.all([db.from('profiles').select('id,name,role').order('name'), db.from('site_assignments').select('user_id').eq('site_id', siteId as string)]);
      const on = new Set(((a.data as { user_id: string }[] | null) ?? []).map((x) => x.user_id));
      const all = (orThrow(p) as Recipient[]);
      return [...all.filter((x) => x.role === 'pm' || x.role === 'admin'), ...all.filter((x) => on.has(x.id) && x.role !== 'pm' && x.role !== 'admin')];
    },
  });
}

export type Draft = { title: string; date: string; private: boolean; remind: boolean; timing: Timing; custom: string; recipients: string[]; repeat: Repeat };

/** Operatives add a plain key date only (no private / repeat / reminder) — the RLS policy insists. */
export async function addEvent(me: Profile, site: Site & { closed_at?: string | null }, d: Draft, mgr: boolean): Promise<string | null> {
  const remind = mgr && d.remind && d.recipients.length > 0;
  const repeat: Repeat = mgr ? d.repeat : 'none';
  const dates = recurrenceDates(d.date, repeat, site.closed_at ?? null, site.status === 'closed');
  const group = repeat !== 'none' && dates.length > 1 ? (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`) : null;
  const rows = dates.map((date) => ({
    site_id: site.id, org_id: me.org_id, title: d.title, event_date: date, is_private: mgr ? d.private : false,
    reminder_recipient_ids: remind ? d.recipients : [], reminder_timing: remind ? d.timing : null,
    reminder_date: remind ? reminderDate(date, d.timing, d.custom) : null, reminder_sent: false, created_by: me.id,
    repeat_freq: repeat !== 'none' ? repeat : null, recurrence_group_id: group,
  }));
  const r = await db.from('site_calendar_events').insert(rows as never);
  if (r.error) return null;
  return rows.length > 1 ? `Added ${rows.length} repeating key dates` : 'Added to the calendar';
}

export async function saveEvent(id: string, d: Draft): Promise<boolean> {
  const remind = d.remind && d.recipients.length > 0;
  return !(await db.from('site_calendar_events').update({
    title: d.title, event_date: d.date, is_private: d.private, reminder_recipient_ids: remind ? d.recipients : [],
    reminder_timing: remind ? d.timing : null, reminder_date: remind ? reminderDate(d.date, d.timing, d.custom) : null, reminder_sent: false,
  } as never).eq('id', id)).error;
}

function log(me: Profile, siteId: string, description: string) {
  if (me.org_id) void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action: 'calendar_event_deleted', description } as never);
}
/** whole = this and every later date in the series. */
export async function deleteEvent(me: Profile, siteId: string, e: CalEvent, whole: boolean): Promise<boolean> {
  const r = whole && e.recurrence_group_id
    ? await db.from('site_calendar_events').delete().eq('recurrence_group_id', e.recurrence_group_id).gte('event_date', e.event_date)
    : await db.from('site_calendar_events').delete().eq('id', e.id);
  if (!r.error) log(me, siteId, whole ? `Deleted calendar event series "${e.title}"` : `Deleted calendar event "${e.title}"`);
  return !r.error;
}

/** "Also Add to Delivery Schedule": a stub delivery flagged needs_completing, first free drop. */
export async function addToDeliverySchedule(me: Profile, siteId: string, title: string, date: string): Promise<boolean> {
  const list = await dayList(me.org_id as string, date);
  const slot = DELIVERY_TIME_SLOTS.map((s) => s.key).find((k) => !slotProblem(list, { id: 'new', double_slot: false }, k, () => 'Site')) || '7am';
  const r = await db.from('delivery_tasks').insert({ org_id: me.org_id, site_id: siteId, created_by: me.id, description: title, scheduled_date: date, time_slot: slot, collection_type: 'yard', high_priority: false, needs_completing: true } as never);
  if (r.error) return false;
  await resequenceSlot(me.org_id as string, date, slot);
  return true;
}
