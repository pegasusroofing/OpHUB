// Driver rules, ported from 840-delivery-driver.js, 870 (resequenceSlot) and
// 9219zz-driver-time-off.js. Pure functions only.

export const DELIVERY_TIME_SLOTS = [
  { key: '7am', label: '1st drop' }, { key: '8am', label: '2nd drop' }, { key: '9am', label: '3rd drop' },
  { key: '10am', label: '4th drop' }, { key: '11am', label: '5th drop' }, { key: '12pm', label: '6th drop' },
  { key: '1pm', label: '7th drop' }, { key: '2pm', label: '8th drop' }, { key: '3pm', label: '9th drop' },
  { key: '4pm', label: '10th drop' }, { key: '5pm', label: '11th drop' },
];

export type DTask = {
  id: string; site_id: string | null; time_slot: string; double_slot?: boolean | null; status: string;
  high_priority?: boolean | null; sub_priority?: number | null; created_at?: string;
  manual_site_name?: string | null; manual_site_address?: string | null;
  collection_type?: string | null; collection_address_manual?: string | null; supplier_id?: string | null;
  supplier_branch?: { name?: string; address?: string } | null; sub_site_label?: string | null;
};

export const slotLabel = (key: string) => DELIVERY_TIME_SLOTS.find((s) => s.key === key)?.label || key;
export function nextSlotKey(key: string): string | null {
  const i = DELIVERY_TIME_SLOTS.findIndex((s) => s.key === key);
  return i > -1 && i < DELIVERY_TIME_SLOTS.length - 1 ? DELIVERY_TIME_SLOTS[i + 1].key : null;
}

/** Slots taken by the "extra time" of a 2-drop delivery in the slot before. */
export function blockedSlots<T extends DTask>(list: T[], excludeId?: string): Record<string, T> {
  const out: Record<string, T> = {};
  list.forEach((t) => {
    if (t && t.double_slot && t.id !== excludeId && t.status !== 'cancelled') {
      const nx = nextSlotKey(t.time_slot);
      if (nx && !out[nx]) out[nx] = t;
    }
  });
  return out;
}

/** Deliveries carrying on from the previous drop (2-drop bookings). */
export function continuations<T extends DTask>(list: T[], slot: string): T[] {
  return list.filter((t) => t.double_slot && nextSlotKey(t.time_slot) === slot);
}

/** Why `task` can't go in `slot`, or '' if it can. `place` names a delivery in messages. */
export function slotProblem(list: DTask[], task: Pick<DTask, 'id' | 'double_slot'>, slot: string, place: (t: DTask) => string): string {
  const others = list.filter((x) => x.id !== task.id && x.status !== 'cancelled');
  const blocker = blockedSlots(others)[slot];
  if (blocker) return `The ${slotLabel(slot)} is taken by ${place(blocker)} (extra time from the ${slotLabel(blocker.time_slot)}).`;
  const holder = others.find((x) => x.double_slot && x.time_slot === slot);
  if (holder) return `The ${slotLabel(slot)} is taken by ${place(holder)} (needs extra time — 2 drops).`;
  if (task.double_slot) {
    const same = others.filter((x) => x.time_slot === slot);
    if (same.length) return `It needs extra time, so it needs the ${slotLabel(slot)} to itself — ${place(same[0])} is already in it.`;
    const nx = nextSlotKey(slot);
    if (!nx) return "A delivery needing extra time can't go in the last drop of the day.";
    const inNext = others.filter((x) => x.time_slot === nx);
    if (inNext.length) return `It needs extra time, so it also takes the ${slotLabel(nx)} — move ${place(inNext[0])} out of the ${slotLabel(nx)} first.`;
  }
  return '';
}

export function localISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Next weekday after max(today, the delivery's date). */
export function nextWorkingDay(scheduledISO: string, todayISO: string): string {
  const base = scheduledISO > todayISO ? scheduledISO : todayISO;
  const next = new Date(`${base}T00:00:00`);
  next.setDate(next.getDate() + 1);
  while (next.getDay() === 6 || next.getDay() === 0) next.setDate(next.getDate() + 1);
  return localISODate(next);
}

/**
 * Where a pushed delivery goes on the next working day: the 1st drop if it was a
 * 1st-drop job and nobody else has that day's 1st drop; otherwise the first free
 * drop from 2pm on; otherwise the first free drop at all. null = the day is full.
 */
export function pushSlot(dayList: DTask[], task: DTask, keepHigh: boolean, place: (t: DTask) => string): string | null {
  const free = (k: string) => !slotProblem(dayList, task, k, place);
  if (keepHigh && free(DELIVERY_TIME_SLOTS[0].key)) return DELIVERY_TIME_SLOTS[0].key;
  const from2 = DELIVERY_TIME_SLOTS.slice(DELIVERY_TIME_SLOTS.findIndex((s) => s.key === '2pm'));
  return (from2.find((s) => free(s.key)) || DELIVERY_TIME_SLOTS.find((s) => free(s.key)))?.key ?? null;
}

/** Order within a drop: 1st-drop jobs first, then sub_priority, then oldest. Returns the new sub_priority per id (null when alone). */
export function resequence(rows: DTask[]): Record<string, number | null> {
  const sorted = rows.slice().sort((a, b) =>
    ((b.high_priority ? 1 : 0) - (a.high_priority ? 1 : 0))
    || ((a.sub_priority == null ? 999 : a.sub_priority) - (b.sub_priority == null ? 999 : b.sub_priority))
    || ((a.created_at || '') < (b.created_at || '') ? -1 : 1));
  const out: Record<string, number | null> = {};
  sorted.forEach((r, i) => { out[r.id] = sorted.length > 1 ? i + 1 : null; });
  return out;
}

/* ---------- collections ---------- */
export const NO_COLLECTION = 'No collection';
export const CLEAR_SITE = 'Clear site';
export function collectionKind(t: DTask): string {
  if (t.collection_type === 'manual') {
    const a = String(t.collection_address_manual || '').trim().toLowerCase();
    if (a === NO_COLLECTION.toLowerCase()) return 'none';
    if (a === CLEAR_SITE.toLowerCase()) return 'clear';
  }
  return t.collection_type || '';
}
export function collectionLabel(t: DTask, supplierName?: string): string {
  if (t.collection_type === 'yard') return 'YARD';
  if (t.collection_type === 'supplier') {
    const b = t.supplier_branch;
    return (supplierName || 'Supplier') + (b && (b.name || b.address) ? ' — ' + [b.name, b.address].filter(Boolean).join(', ') : '');
  }
  return t.collection_address_manual || 'Collection address';
}
export function collectionLine(t: DTask, supplierName?: string): string {
  const k = collectionKind(t);
  if (k === 'none') return '🚫 No collection';
  if (k === 'clear') return '🧹 Clear site';
  return '📦 Collect from: ' + collectionLabel(t, supplierName);
}
export function collectionPlaceKey(t: DTask): string {
  if (t.collection_type === 'yard') return 'yard';
  if (t.collection_type === 'supplier') return 'supplier:' + (t.supplier_id || 'none');
  return 'manual:' + String(t.collection_address_manual || '').trim().toLowerCase();
}
/** "What to pick up where": places with 1st-drop jobs first, then the yard, then A–Z. */
export function groupCollections<T extends DTask>(tasks: T[], supplierName: (id: string | null | undefined) => string | undefined) {
  const slotIdx: Record<string, number> = {};
  DELIVERY_TIME_SLOTS.forEach((s, i) => { slotIdx[s.key] = i; });
  const places: { key: string; label: string; tasks: T[] }[] = [];
  tasks.filter((t) => !['none', 'clear'].includes(collectionKind(t))).forEach((t) => {
    const key = collectionPlaceKey(t);
    let pl = places.find((x) => x.key === key);
    if (!pl) { pl = { key, label: collectionLabel(t, supplierName(t.supplier_id)), tasks: [] }; places.push(pl); }
    pl.tasks.push(t);
  });
  const hasFirst = (pl: { tasks: T[] }) => (pl.tasks.some((t) => t.high_priority && t.status !== 'completed') ? 1 : 0);
  places.sort((a, b) => (hasFirst(b) - hasFirst(a)) || (a.key === 'yard' ? -1 : b.key === 'yard' ? 1 : a.label.localeCompare(b.label)));
  places.forEach((pl) => pl.tasks.sort((a, b) => ((b.high_priority ? 1 : 0) - (a.high_priority ? 1 : 0))
    || ((slotIdx[a.time_slot] ?? 99) - (slotIdx[b.time_slot] ?? 99))
    || ((a.sub_priority == null ? 999 : a.sub_priority) - (b.sub_priority == null ? 999 : b.sub_priority))));
  return places;
}

/* ---------- hours ---------- */
export function minsLabel(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
/** Minutes on duty, on breaks and worked for one day. */
export function dayTotals(checks: { type: string; ts: string }[], breaks: { started_at: string; ended_at: string | null }[], dayKey: string, now: Date = new Date()) {
  const isToday = dayKey === localISODate(now);
  let duty = 0, openIn: number | null = null;
  checks.filter((c) => localISODate(new Date(c.ts)) === dayKey).sort((a, b) => a.ts.localeCompare(b.ts)).forEach((c) => {
    if (c.type === 'in') openIn = new Date(c.ts).getTime();
    else if (c.type === 'out' && openIn != null) { duty += (new Date(c.ts).getTime() - openIn) / 60000; openIn = null; }
  });
  const stillIn = openIn != null && isToday;
  if (stillIn && openIn != null) duty += (now.getTime() - openIn) / 60000;
  let brk = 0, count = 0;
  breaks.filter((b) => localISODate(new Date(b.started_at)) === dayKey).forEach((b) => {
    const st = new Date(b.started_at).getTime();
    const en = b.ended_at ? new Date(b.ended_at).getTime() : isToday ? now.getTime() : st;
    brk += Math.max(0, (en - st) / 60000); count++;
  });
  duty = Math.round(duty); brk = Math.min(duty, Math.round(brk));
  return { duty, brk, worked: duty - brk, count, stillIn, noCheckout: openIn != null && !isToday };
}

/* ---------- time off ---------- */
export function dtoFmt(d: string): string {
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
export function dtoRange(t: { start_date: string; end_date: string }): string {
  return t.start_date === t.end_date ? dtoFmt(t.start_date) : `${dtoFmt(t.start_date)} – ${dtoFmt(t.end_date)}`;
}
export function dtoDays(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000) + 1;
}
/** Problem with a time-off booking, or ''. */
export function dtoProblem(from: string, to: string, todayISO: string): string {
  if (!from) return 'Pick the date.';
  if (!to || to < from) return 'The “To” date must be on or after the “From” date.';
  if (from < todayISO) return 'Pick today or a later date.';
  return '';
}

/* ---------- weekly vehicle checklist ---------- */
export const VEHICLE_ITEMS = [
  { key: 'windscreen', cat: 'Cab / Interior', label: 'Windscreen is undamaged and the view is unobscured' },
  { key: 'mirrors', cat: 'Cab / Interior', label: 'Mirrors are present, secure and unbroken' },
  { key: 'wipers', cat: 'Cab / Interior', label: 'Washers and wipers work properly' },
  { key: 'warning_lights', cat: 'Cab / Interior', label: 'No dashboard warning lights stay on after starting' },
  { key: 'steering', cat: 'Cab / Interior', label: 'Steering moves freely, no excessive play or jamming' },
  { key: 'horn', cat: 'Cab / Interior', label: 'Horn works' },
  { key: 'footbrake', cat: 'Cab / Interior', label: 'Footbrake is firm, no excessive travel' },
  { key: 'handbrake', cat: 'Cab / Interior', label: 'Handbrake holds the vehicle securely' },
  { key: 'seats_belts', cat: 'Cab / Interior', label: 'Seats are secure and seatbelts are undamaged, latch and retract properly' },
  { key: 'lights', cat: 'Exterior', label: 'All lights and indicators work, lenses clean and correct colour' },
  { key: 'plates', cat: 'Exterior', label: 'Number plates are secure, clean and legible' },
  { key: 'bodywork', cat: 'Exterior', label: 'Bodywork and doors undamaged, no sharp edges, doors shut and lock securely' },
  { key: 'exhaust', cat: 'Exterior', label: 'No exhaust leaks, excessive smoke or noise' },
  { key: 'battery', cat: 'Battery', label: 'Battery is secure, in good condition and not leaking' },
  { key: 'tyre_tread', cat: 'Tyres & Wheels', label: 'Legal tread depth on all tyres' },
  { key: 'tyre_pressure', cat: 'Tyres & Wheels', label: 'Tyre pressures correct' },
  { key: 'tyre_damage', cat: 'Tyres & Wheels', label: 'No cuts, bulges or sidewall damage, no wire/cord visible' },
  { key: 'wheels', cat: 'Tyres & Wheels', label: 'Wheels and wheel nuts secure, undamaged' },
  { key: 'load_area', cat: 'Load Securing', label: 'Load area / racking secure, nothing loose' },
  { key: 'rear_doors', cat: 'Load Securing', label: 'Rear doors / tailgate lock properly' },
];
export const VEHICLE_PHOTOS = [
  { key: 'photo_front', label: 'Front' }, { key: 'photo_back', label: 'Back' },
  { key: 'photo_left', label: 'Left hand side' }, { key: 'photo_right', label: 'Right hand side' },
];
export type VItem = { key: string; result?: 'pass' | 'fail'; note?: string; photo_path?: string };

/** Monday of this week, as YYYY-MM-DD. */
export function weekStart(now: Date = new Date()): string {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localISODate(d);
}
export function hasFails(items: Record<string, VItem>): boolean {
  return VEHICLE_ITEMS.some((i) => items[i.key]?.result === 'fail');
}
/** Why the checklist can't be submitted yet, or ''. Same order and wording as today. */
export function vehicleSubmitProblem(reg: string, mileage: string | number | null, items: Record<string, VItem>): string {
  if (VEHICLE_ITEMS.some((i) => !items[i.key]?.result)) return 'Every item needs a Pass or Fail before you can submit.';
  const miles = parseInt(String(mileage ?? '').replace(/[^0-9]/g, ''), 10);
  if (!String(reg || '').trim()) return 'Enter the vehicle registration first.';
  if (!(miles > 0)) return 'Enter the current mileage before you can submit.';
  const missing = VEHICLE_PHOTOS.find((p) => !items[p.key]?.photo_path);
  if (missing) return `All 4 vehicle photos are needed before you can submit — missing: ${missing.label}.`;
  if (VEHICLE_ITEMS.some((i) => items[i.key].result === 'fail' && (!items[i.key].photo_path || !items[i.key].note))) {
    return 'Every failed item needs both a photo and a note before you can submit.';
  }
  return '';
}
