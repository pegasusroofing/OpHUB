// Price Sheets (400) and the weekly build-up (390). A sheet is built from the
// company rate card, saved as a draft, then issued: issuing makes (or updates)
// the Pricing Element it feeds, gives the people it's for access to it, and can
// add a Schedule of Works section with a task per line. Each week the PM books
// work in — free-form (operatives, named extras, one-off costs) for an ordinary
// element, or qty per sheet line (checked against the week's wages) for a sheet.
// Either way the week's figure lands in price_weeks, which drives Booked In.
import { autoAllocate, entryKey, pbRound2, rowsToSave, type PbRow, type PbWorking, type SheetItem } from '@/lib/rules/priceSheet';
import type { RateItem, RateOption } from '@/lib/rules/rateCard';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Row = Record<string, any>;
const rows = <T = Row>(r: { data: unknown }) => ((r.data as T[] | null) ?? []);
const now = () => new Date().toISOString();

export type Sheet = { id: string; site_id: string; title: string; status: 'draft' | 'issued'; subcontractor_name: string | null; assigned_user_ids: string[] | null; total: number | null; pricing_element_id: string | null; schedule_section_id: string | null; issued_at: string | null; issued_by: string | null; created_at: string };
export type WeekEntry = { id: string; week_number: number; operative_id: string | null; kind: 'assigned' | 'extra_operative' | 'cost'; label: string | null; amount: number | null };
export type ItemWeek = { sheet_item_id: string; week_number: number; qty: number | null; amount: number | null; is_manual: boolean };

export async function siteOperatives(siteId: string) {
  const ids = rows<{ user_id: string }>(await db.from('site_assignments').select('user_id').eq('site_id', siteId)).map((r) => r.user_id);
  if (!ids.length) return [] as { id: string; name: string }[];
  return rows<{ id: string; name: string; role: string }>(await db.from('profiles').select('id,name,role').in('id', ids)).filter((p) => p.role === 'operative').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/* ---------- sheets ---------- */
export const listSheets = async (siteId: string) => rows<Sheet>(await db.from('price_builder_sheets').select('*').eq('site_id', siteId).order('created_at', { ascending: false }));
export async function createSheet(me: Profile, siteId: string, title: string, userIds: string[], names: string): Promise<string | null> {
  const r = await db.from('price_builder_sheets').insert({ org_id: me.org_id, site_id: siteId, title: title || 'Price', subcontractor_name: names || null, assigned_user_ids: userIds, created_by: me.id } as never).select('id').single();
  return r.error ? null : (r.data as { id: string }).id;
}
export async function loadRateCard(orgId: string) {
  const items = rows<RateItem>(await db.from('price_rate_items').select('*').eq('org_id', orgId).eq('active', true).order('category').order('sort_order').order('name'));
  const ids = items.filter((i) => i.is_dropdown).map((i) => i.id);
  const options = ids.length ? rows<RateOption>(await db.from('price_rate_options').select('*').in('rate_item_id', ids).order('sort_order')).filter((o) => (o.label || '').trim().toLowerCase() !== 'none') : [];
  return { items, options };
}
export async function loadSheet(sheetId: string) {
  const sheet = (await db.from('price_builder_sheets').select('*').eq('id', sheetId).maybeSingle()).data as Sheet | null;
  if (!sheet) return null;
  const items = rows<SheetItem>(await db.from('price_builder_sheet_items').select('*').eq('sheet_id', sheetId).order('sort_order'));
  const alloc: Record<string, number> = {};
  if (items.length) rows<{ sheet_item_id: string; amount: number }>(await db.from('price_builder_sheet_item_weeks').select('sheet_item_id,amount').in('sheet_item_id', items.map((i) => i.id))).forEach((w) => { alloc[w.sheet_item_id] = (alloc[w.sheet_item_id] || 0) + Number(w.amount || 0); });
  return { sheet, items, alloc };
}

type Persist = { total: number; rows: SheetItem[]; added: SheetItem[]; removedIds: string[]; blocked: number; failed?: boolean };
async function persist(me: Profile, sheetId: string, w: PbWorking, rateItems: RateItem[], status: 'issued' | null, names: string): Promise<Persist> {
  const byId: Record<string, RateItem> = Object.fromEntries(rateItems.map((i) => [i.id, i]));
  const existing = rows<{ id: string; rate_item_id: string | null; option_id: string | null }>(await db.from('price_builder_sheet_items').select('id,rate_item_id,option_id').eq('sheet_id', sheetId));
  const keyToId: Record<string, string> = {}; existing.forEach((r) => { if (r.rate_item_id) keyToId[entryKey(r.rate_item_id, r.option_id)] = r.id; });
  const { rows: toSave, total } = rowsToSave(w, byId, keyToId, !!status);
  const kept = new Set(toSave.filter((r) => r.id).map((r) => r.id as string));
  const alloc: Record<string, number> = {};
  if (existing.length) rows<{ sheet_item_id: string; amount: number }>(await db.from('price_builder_sheet_item_weeks').select('sheet_item_id,amount').in('sheet_item_id', existing.map((e) => e.id))).forEach((x) => { alloc[x.sheet_item_id] = (alloc[x.sheet_item_id] || 0) + Number(x.amount || 0); });
  const removedIds: string[] = []; let blocked = 0;
  for (const e of existing) {
    if (kept.has(e.id)) continue;
    if ((alloc[e.id] || 0) > 0) { blocked++; continue; } // never orphan a booking
    if (!(await db.from('price_builder_sheet_items').delete().eq('id', e.id)).error) removedIds.push(e.id);
  }
  const clean = (r: PbRow) => { const { id: _i, key: _k, customIdx: _c, ...rest } = r; return { ...rest, sheet_id: sheetId }; };
  let failed = false;
  const added: SheetItem[] = [], updated: SheetItem[] = [];
  const ins = toSave.filter((r) => !r.id);
  if (ins.length) {
    const r = await db.from('price_builder_sheet_items').insert(ins.map(clean) as never).select();
    if (r.error) failed = true;
    rows<SheetItem>(r).forEach((saved) => {
      added.push(saved);
      const src = ins.find((x) => x.sort_order === saved.sort_order);
      if (src?.key && w.items[src.key]) w.items[src.key].id = saved.id;
      if (src?.customIdx != null && w.customRows[src.customIdx]) w.customRows[src.customIdx].id = saved.id;
    });
  }
  for (const r of toSave.filter((x) => x.id)) {
    const u = await db.from('price_builder_sheet_items').update(clean(r) as never).eq('id', r.id as string).select().maybeSingle();
    if (u.error) failed = true; else if (u.data) updated.push(u.data as SheetItem);
    if (r.key && w.items[r.key]) w.items[r.key].id = r.id;
  }
  if (failed) return { total, rows: [...updated, ...added], added, removedIds, blocked, failed: true };
  const cur = (await db.from('price_builder_sheets').select('issued_at').eq('id', sheetId).maybeSingle()).data as { issued_at: string | null } | null;
  const patch: Row = { title: w.title, subcontractor_name: names || null, assigned_user_ids: w.assignedUserIds, total, updated_at: now() };
  if (status) { patch.status = status; if (!cur?.issued_at) { patch.issued_by = me.id; patch.issued_at = now(); } }
  await db.from('price_builder_sheets').update(patch as never).eq('id', sheetId);
  return { total, rows: [...updated, ...added], added, removedIds, blocked };
}

export async function saveDraft(me: Profile, sheetId: string, w: PbWorking, rateItems: RateItem[], names: string): Promise<string> {
  const p = await persist(me, sheetId, w, rateItems, null, names);
  if (p.failed) return 'Draft NOT saved — some items failed to save. Check your signal and try again.';
  return p.blocked ? `Draft saved — ${p.blocked} item(s) kept because they already have bookings against them.` : 'Draft saved';
}

async function grantAccess(me: Profile, elementId: string, siteId: string, userIds: string[]) {
  if (!userIds.length) return;
  const [p, l] = await Promise.all([db.from('site_price_access').select('user_id').eq('element_id', elementId), db.from('site_labour_invoice_access').select('user_id').eq('element_id', elementId)]);
  const hp = new Set(rows<{ user_id: string }>(p).map((r) => r.user_id)), hl = new Set(rows<{ user_id: string }>(l).map((r) => r.user_id));
  const mk = (uid: string) => ({ site_id: siteId, element_id: elementId, user_id: uid, granted_by: me.id });
  const pr = userIds.filter((u) => !hp.has(u)).map(mk), lr = userIds.filter((u) => !hl.has(u)).map(mk);
  await Promise.all([pr.length ? db.from('site_price_access').insert(pr as never) : null, lr.length ? db.from('site_labour_invoice_access').insert(lr as never) : null]);
}
const nextPos = async (table: 'schedule_sections' | 'schedule_tasks', siteId: string) => (Number((rows<{ position: number | null }>(await db.from(table).select('position').eq('site_id', siteId).order('position', { ascending: false, nullsFirst: false }).limit(1))[0]?.position) || 0) + 1);
async function addTasks(siteId: string, sectionId: string, items: SheetItem[]) {
  if (!items.length) return;
  let pos = await nextPos('schedule_tasks', siteId);
  await db.from('schedule_tasks').insert(items.map((r) => ({ site_id: siteId, section_id: sectionId, sheet_item_id: r.id, name: r.name, status: 'todo', position: pos++ })) as never);
}
/** Keep the sheet's Schedule of Works section in step: rename, add, remove (or unlink a task already started). */
async function syncSow(siteId: string, sectionId: string | null, p: Persist) {
  if (!sectionId) return;
  const tasks = rows<{ id: string; name: string; sheet_item_id: string; status: string | null; completed_at: string | null }>(await db.from('schedule_tasks').select('id,name,sheet_item_id,status,completed_at').eq('section_id', sectionId).not('sheet_item_id', 'is', null));
  const byItem: Record<string, (typeof tasks)[number]> = Object.fromEntries(tasks.map((t) => [t.sheet_item_id, t]));
  for (const r of p.rows) { const t = byItem[r.id]; if (t && t.name !== r.name) await db.from('schedule_tasks').update({ name: r.name } as never).eq('id', t.id); }
  await addTasks(siteId, sectionId, p.added.filter((r) => !byItem[r.id]));
  for (const id of p.removedIds) { const t = byItem[id]; if (!t) continue; if ((t.status && t.status !== 'todo') || t.completed_at) await db.from('schedule_tasks').update({ sheet_item_id: null } as never).eq('id', t.id); else await db.from('schedule_tasks').delete().eq('id', t.id); }
}

export async function issueSheet(me: Profile, site: Site, sheet: Sheet, w: PbWorking, rateItems: RateItem[], names: string, tileName: string | null, subId: string | null): Promise<string | null> {
  const p = await persist(me, sheet.id, w, rateItems, 'issued', names);
  if (p.failed) return 'Sheet NOT issued — some items failed to save. Check your signal and try again.';
  let elId = sheet.pricing_element_id;
  if (!elId) {
    const last = rows<{ sort_order: number | null }>(await db.from('pricing_elements').select('sort_order').eq('site_id', site.id).order('sort_order', { ascending: false }).limit(1))[0];
    const r = await db.from('pricing_elements').insert({ site_id: site.id, sub_site_id: subId, name: tileName || w.title, sort_order: last ? Number(last.sort_order || 0) + 1 : 0, price_total: p.total, created_by: me.id } as never).select('id').single();
    if (!r.error) elId = (r.data as { id: string }).id;
  } else await db.from('pricing_elements').update({ price_total: p.total } as never).eq('id', elId);
  if (elId) await grantAccess(me, elId, site.id, w.assignedUserIds);
  let secId = sheet.schedule_section_id;
  if (w.populateSOW && !secId) {
    const r = await db.from('schedule_sections').insert({ site_id: site.id, name: w.title, position: await nextPos('schedule_sections', site.id), created_by: me.id } as never).select('id').single();
    if (!r.error) { secId = (r.data as { id: string }).id; await addTasks(site.id, secId, p.rows); }
  } else if (secId) {
    await syncSow(site.id, secId, p);
    const have = new Set(rows<{ sheet_item_id: string }>(await db.from('schedule_tasks').select('sheet_item_id').eq('section_id', secId).not('sheet_item_id', 'is', null)).map((t) => t.sheet_item_id));
    await addTasks(site.id, secId, p.rows.filter((r) => !have.has(r.id)));
  }
  const link: Row = {};
  if (elId && elId !== sheet.pricing_element_id) link.pricing_element_id = elId;
  if (secId && secId !== sheet.schedule_section_id) link.schedule_section_id = secId;
  if (Object.keys(link).length) await db.from('price_builder_sheets').update(link as never).eq('id', sheet.id);
  if (w.assignedUserIds.length && me.org_id) {
    await db.from('messages').insert(w.assignedUserIds.map((uid) => ({ org_id: me.org_id, site_id: site.id, sender_id: me.id, audience: 'single', recipient_id: uid, kind: 'price_sheet_issued', body: `A price sheet ("${w.title}") has been issued to you on ${site.name || 'this site'}`, related_id: sheet.id })) as never);
    void supabase.functions.invoke('notify-price-sheet-issued', { body: { site_id: site.id, sheet_id: sheet.id, sheet_title: w.title, user_ids: w.assignedUserIds } }).catch(() => undefined);
  }
  return null;
}
export async function saveIssuedEdits(me: Profile, site: Site, sheet: Sheet, w: PbWorking, rateItems: RateItem[], names: string): Promise<string> {
  const p = await persist(me, sheet.id, w, rateItems, 'issued', names);
  if (p.failed) return 'Sheet NOT updated — some items failed to save. Check your signal and try again.';
  if (sheet.pricing_element_id) { await db.from('pricing_elements').update({ price_total: p.total } as never).eq('id', sheet.pricing_element_id); await grantAccess(me, sheet.pricing_element_id, site.id, w.assignedUserIds); }
  await syncSow(site.id, sheet.schedule_section_id, p);
  return p.blocked ? `Sheet updated — ${p.blocked} item(s) kept because they already have bookings against them.` : 'Sheet updated';
}
export const unissueSheet = async (id: string) => !(await db.from('price_builder_sheets').update({ status: 'draft' } as never).eq('id', id)).error;
export const renameSheet = async (id: string, title: string) => !(await db.from('price_builder_sheets').update({ title } as never).eq('id', id)).error;
/** Returns null when it can go, or why it can't. */
export async function sheetDeleteBlock(sheet: Sheet): Promise<string | null> {
  if (sheet.status !== 'issued' && !sheet.pricing_element_id) return null;
  const items = rows<{ id: string }>(await db.from('price_builder_sheet_items').select('id').eq('sheet_id', sheet.id));
  if (items.length && rows<{ amount: number }>(await db.from('price_builder_sheet_item_weeks').select('amount').in('sheet_item_id', items.map((i) => i.id))).reduce((t, w) => t + Number(w.amount || 0), 0) > 0) return 'Can’t delete — this sheet has bookings against it. Remove them first.';
  if (sheet.pricing_element_id) { const el = (await db.from('pricing_elements').select('price_booked_override').eq('id', sheet.pricing_element_id).maybeSingle()).data as { price_booked_override: number | null } | null; if (el?.price_booked_override != null && Number(el.price_booked_override) > 0) return 'Can’t delete — its price tile has a manual Booked In amount set. Clear that first.'; }
  return null;
}
export async function deleteSheet(sheet: Sheet): Promise<boolean> {
  if (sheet.schedule_section_id) { await db.from('schedule_tasks').delete().eq('section_id', sheet.schedule_section_id); await db.from('schedule_sections').delete().eq('id', sheet.schedule_section_id); }
  if (sheet.pricing_element_id) await db.from('pricing_elements').delete().eq('id', sheet.pricing_element_id);
  return !(await db.from('price_builder_sheets').delete().eq('id', sheet.id)).error;
}
/** Total / Taken / Balance, live from the Pricing Element the sheet feeds. */
export async function sheetFigures(sheet: Sheet) {
  const total = Number(sheet.total) || 0;
  if (!sheet.pricing_element_id) return { total, taken: 0, balance: total };
  const el = (await db.from('pricing_elements').select('price_total,price_booked_override').eq('id', sheet.pricing_element_id).maybeSingle()).data as { price_total: number | null; price_booked_override: number | null } | null;
  if (!el) return { total, taken: 0, balance: total };
  const auto = rows<{ amount: number }>(await db.from('price_weeks').select('amount').eq('element_id', sheet.pricing_element_id)).reduce((t, w) => t + Number(w.amount || 0), 0);
  const taken = el.price_booked_override != null ? Number(el.price_booked_override) : auto, t2 = Number(el.price_total ?? total);
  return { total: t2, taken, balance: t2 - taken };
}

/* ---------- weekly build-up ---------- */
export async function loadElementWeeks(elementId: string, siteId: string) {
  const [e, w, sh, ops] = await Promise.all([
    db.from('price_week_operative_entries').select('id,week_number,operative_id,kind,label,amount').eq('element_id', elementId).order('week_number'),
    db.from('price_weeks').select('week_number,amount,wage_mismatch_override_reason').eq('element_id', elementId),
    db.from('price_builder_sheets').select('*').eq('pricing_element_id', elementId).eq('status', 'issued').limit(1),
    siteOperatives(siteId),
  ]);
  const sheet = rows<Sheet>(sh)[0] ?? null;
  const items = sheet ? rows<SheetItem>(await db.from('price_builder_sheet_items').select('*').eq('sheet_id', sheet.id).order('sort_order')) : [];
  const itemWeeks = items.length ? rows<ItemWeek>(await db.from('price_builder_sheet_item_weeks').select('*').in('sheet_item_id', items.map((i) => i.id))) : [];
  return { entries: rows<WeekEntry>(e), weeks: rows<{ week_number: number; amount: number; wage_mismatch_override_reason: string | null }>(w), sheet, items, itemWeeks, operatives: ops };
}
async function setWeekTotal(elementId: string, siteId: string, wk: number, amount: number | null) {
  if (amount === null) return !(await db.from('price_weeks').delete().eq('element_id', elementId).eq('week_number', wk)).error;
  return !(await db.from('price_weeks').upsert({ site_id: siteId, element_id: elementId, week_number: wk, amount } as never, { onConflict: 'element_id,week_number' })).error;
}
/** A week's figure from its build-up rows (none left: the week goes). */
export async function rollUpWeek(elementId: string, siteId: string, wk: number) {
  const es = rows<{ amount: number }>(await db.from('price_week_operative_entries').select('amount').eq('element_id', elementId).eq('week_number', wk));
  return setWeekTotal(elementId, siteId, wk, es.length ? pbRound2(es.reduce((t, x) => t + Number(x.amount || 0), 0)) : null);
}
/** A manager typing the week's figure straight in; blank goes back to adding up the build-up. */
export async function setWeekAmount(elementId: string, siteId: string, wk: number, amount: number | null) {
  return amount === null ? rollUpWeek(elementId, siteId, wk) : setWeekTotal(elementId, siteId, wk, amount);
}
/** One operative's figure for a week (one row per person and kind). Blank removes it. */
export async function setOperativeEntry(me: Profile, elementId: string, siteId: string, wk: number, operativeId: string, kind: 'assigned' | 'extra_operative', amount: number | null, rollUp: boolean) {
  const ex = rows<{ id: string }>(await db.from('price_week_operative_entries').select('id').eq('element_id', elementId).eq('week_number', wk).eq('operative_id', operativeId).eq('kind', kind));
  let ok: boolean;
  if (amount === null) ok = !(await db.from('price_week_operative_entries').delete().eq('element_id', elementId).eq('week_number', wk).eq('operative_id', operativeId).eq('kind', kind)).error;
  else if (ex.length) ok = !(await db.from('price_week_operative_entries').update({ amount, entered_by: me.id, updated_at: now() } as never).eq('id', ex[0].id)).error;
  else ok = !(await db.from('price_week_operative_entries').insert({ site_id: siteId, element_id: elementId, week_number: wk, operative_id: operativeId, amount, kind, entered_by: me.id, updated_at: now() } as never)).error;
  if (ok && rollUp) await rollUpWeek(elementId, siteId, wk);
  return ok;
}
export async function addEntry(me: Profile, elementId: string, siteId: string, wk: number, e: { kind: 'extra_operative' | 'cost'; operative_id?: string | null; label?: string | null; amount: number }, rollUp: boolean) {
  const ok = !(await db.from('price_week_operative_entries').insert({ site_id: siteId, element_id: elementId, week_number: wk, operative_id: e.operative_id ?? null, kind: e.kind, label: e.label ?? null, amount: e.amount, entered_by: me.id, updated_at: now() } as never)).error;
  if (ok && rollUp) await rollUpWeek(elementId, siteId, wk);
  return ok;
}
export async function setEntryAmount(me: Profile, elementId: string, siteId: string, wk: number, id: string, amount: number | null, rollUp: boolean) {
  const ok = amount === null ? !(await db.from('price_week_operative_entries').delete().eq('id', id)).error : !(await db.from('price_week_operative_entries').update({ amount, updated_at: now() } as never).eq('id', id)).error;
  if (ok && amount === null && me.org_id) void db.from('site_activity_log').insert({ org_id: me.org_id, site_id: siteId, actor_id: me.id, action: 'price_week_entry_deleted', description: `Deleted price entry for Week ${wk}` } as never);
  if (ok && rollUp) await rollUpWeek(elementId, siteId, wk);
  return ok;
}

/* ---------- a sheet-fed element's week ---------- */
async function upsertItemWeek(me: Profile, itemId: string, wk: number, qty: number | null, amount: number, manual: boolean) {
  return !(await db.from('price_builder_sheet_item_weeks').upsert({ sheet_item_id: itemId, week_number: wk, qty, amount, is_manual: manual, updated_by: me.id } as never, { onConflict: 'sheet_item_id,week_number' })).error;
}
async function rollUpFromItems(elementId: string, siteId: string, items: SheetItem[], wk: number) {
  const total = items.length ? rows<{ amount: number }>(await db.from('price_builder_sheet_item_weeks').select('amount').in('sheet_item_id', items.map((i) => i.id)).eq('week_number', wk)).reduce((t, r) => t + Number(r.amount || 0), 0) : 0;
  return setWeekTotal(elementId, siteId, wk, pbRound2(total));
}
export const weekWages = async (elementId: string, wk: number) => pbRound2(rows<{ amount: number }>(await db.from('price_week_operative_entries').select('amount').eq('element_id', elementId).eq('week_number', wk)).reduce((t, e) => t + Number(e.amount || 0), 0));
/** Save every line's qty / £ override for a week; a wages mismatch needs a reason (null clears it). */
export async function saveSheetWeek(me: Profile, elementId: string, siteId: string, items: SheetItem[], wk: number, pending: { id: string; qty: number | null; amount: number; manual: boolean }[], reason: string | null): Promise<boolean> {
  for (const p of pending) if (!(await upsertItemWeek(me, p.id, wk, p.qty, p.amount, p.manual))) return false;
  await rollUpFromItems(elementId, siteId, items, wk);
  await db.from('price_weeks').update((reason ? { wage_mismatch_override_reason: reason, wage_mismatch_override_by: me.id, wage_mismatch_override_at: now() } : { wage_mismatch_override_reason: null, wage_mismatch_override_by: null, wage_mismatch_override_at: null }) as never).eq('element_id', elementId).eq('week_number', wk);
  return true;
}
export async function allocateWages(me: Profile, elementId: string, siteId: string, items: SheetItem[], wk: number): Promise<string> {
  const wages = await weekWages(elementId, wk);
  if (wages <= 0) return 'Enter at least one labour wage amount first.';
  if (!items.length) return 'This sheet has no priced items to allocate to.';
  const all = rows<ItemWeek>(await db.from('price_builder_sheet_item_weeks').select('*').in('sheet_item_id', items.map((i) => i.id)));
  const prior: Record<string, number> = {}, manual: Record<string, number> = {};
  all.forEach((x) => { if (x.week_number === wk) { if (x.is_manual) manual[x.sheet_item_id] = Number(x.amount || 0); } else prior[x.sheet_item_id] = (prior[x.sheet_item_id] || 0) + Number(x.qty || 0); });
  const r = autoAllocate(items, prior, manual, wages);
  for (const row of r.rows) await upsertItemWeek(me, row.id, wk, row.qty, row.amount, false);
  await rollUpFromItems(elementId, siteId, items, wk);
  return r.left > 0.01 ? `Allocated what the sheet can take — £${r.left.toFixed(2)} of labour wages couldn’t be matched (sheet may be fully booked).` : 'Labour wages allocated to items';
}
