// Price Sheets (400) and the weekly build-up (390): the tick-box sheet's lines
// and totals (rounded to the penny), turning the sheet being edited into the
// rows to save, the per-week booking of sheet items, and sharing a week's
// labour wages out across the sheet's items top-down. Pure.
import type { RateItem } from './rateCard.ts';

export const pbRound2 = (n: unknown) => { const x = Number(n) || 0; return Math.round((x + (x >= 0 ? 1 : -1) * Number.EPSILON * Math.max(1, Math.abs(x))) * 100) / 100; };
export const PRICE_UNIT_LABEL: Record<string, string> = { lm: 'lm', m2: 'm²', each: 'each', item: 'item' };

/** One ticked line while a sheet is being built: a plain rate item (key = its id) or one option of a dropdown item (key = "item::option"). */
export type PbEntry = { id?: string | null; rateItemId: string; quantity: number | ''; optionId: string | null; optionRate: number | null; optionLabel: string | null; nameOverride: string | null; unit?: string | null; rateOverride: number | null; isManualRate: boolean };
export type PbCustom = { localId: string; id: string | null; name: string; rate: number | ''; quantity: number | ''; unit: string };
export type PbWorking = { title: string; assignedUserIds: string[]; populateSOW: boolean; items: Record<string, PbEntry>; customRows: PbCustom[] };
export type SheetItem = { id: string; sheet_id: string; rate_item_id: string | null; category: string; name: string; unit: string; rate: number; quantity: number; option_id: string | null; option_label: string | null; is_manual_rate: boolean; line_total: number; sort_order: number };

export const entryKey = (rateItemId: string, optionId?: string | null) => (optionId ? `${rateItemId}::${optionId}` : rateItemId);
export function resolvedRate(e: PbEntry, item: RateItem) {
  if (e.isManualRate && e.rateOverride != null) return Number(e.rateOverride);
  return item.is_dropdown ? (e.optionRate != null ? Number(e.optionRate) : 0) : Number(item.rate || 0);
}
export const lineTotal = (e: PbEntry, item: RateItem) => pbRound2((Number(e.quantity) || 0) * resolvedRate(e, item));

/** Saved sheet rows back into the editing state (400 renderPriceBuilderEdit load). */
export function workingFromRows(rows: SheetItem[], itemsById: Record<string, RateItem>, optionRate: (itemId: string, optId: string) => number | null, sheet: { title: string; assigned_user_ids: string[] | null; schedule_section_id: string | null }): PbWorking {
  const items: Record<string, PbEntry> = {}, customRows: PbCustom[] = [];
  rows.forEach((r) => {
    const it = r.rate_item_id ? itemsById[r.rate_item_id] : undefined;
    if (!r.rate_item_id || !it) { customRows.push({ localId: r.id, id: r.id, name: r.name || '', rate: r.rate, quantity: r.quantity, unit: r.unit || 'item' }); return; }
    let oRate: number | null = null;
    if (r.option_id) { const o = optionRate(r.rate_item_id, r.option_id); oRate = o != null ? o : r.is_manual_rate ? null : Number(r.rate); }
    items[entryKey(r.rate_item_id, r.option_id)] = {
      id: r.id, rateItemId: r.rate_item_id, quantity: r.quantity, optionId: r.option_id, optionRate: oRate, optionLabel: r.option_label,
      nameOverride: r.name && r.name !== it.name ? r.name : null, unit: r.unit && r.unit !== it.unit ? r.unit : null,
      rateOverride: r.is_manual_rate ? Number(r.rate) : null, isManualRate: !!r.is_manual_rate,
    };
  });
  return { title: sheet.title, assignedUserIds: (sheet.assigned_user_ids || []).slice(), populateSOW: !sheet.schedule_section_id, items, customRows };
}

export type PbRow = Omit<SheetItem, 'id' | 'sheet_id'> & { id: string | null; key?: string; customIdx?: number };
/** The rows a save writes (400 pbPersist). A draft keeps every tick; issuing drops lines with no quantity (or no option). */
export function rowsToSave(w: PbWorking, itemsById: Record<string, RateItem>, existingKeyToId: Record<string, string>, issuing: boolean): { rows: PbRow[]; total: number } {
  const rows: PbRow[] = []; let total = 0, sort = 0;
  Object.keys(w.items).forEach((key) => {
    const e = w.items[key], item = itemsById[e.rateItemId]; if (!item) return;
    const qty = Number(e.quantity) || 0;
    if (issuing && (!qty || (item.is_dropdown && !e.optionId))) return;
    const lt = qty && !(item.is_dropdown && !e.optionId) ? lineTotal(e, item) : 0;
    total += lt;
    rows.push({ id: e.id || existingKeyToId[key] || null, key, rate_item_id: item.id, category: item.category, name: e.nameOverride || item.name, unit: e.unit || item.unit, rate: resolvedRate(e, item) || 0, quantity: qty, option_id: e.optionId, option_label: e.optionLabel, is_manual_rate: !!e.isManualRate, line_total: lt, sort_order: sort++ });
  });
  w.customRows.forEach((c, i) => {
    const qty = Number(c.quantity) || 0, rate = Number(c.rate) || 0;
    if (!c.name || ((!qty || !rate) && issuing)) return;
    const lt = pbRound2(qty * rate); total += lt;
    rows.push({ id: c.id, customIdx: i, rate_item_id: null, category: 'Additional Items', name: c.name, unit: c.unit || 'item', rate, quantity: qty, option_id: null, option_label: null, is_manual_rate: false, line_total: lt, sort_order: sort++ });
  });
  return { rows, total: pbRound2(total) };
}
export const canIssue = (w: PbWorking) => Object.values(w.items).some((e) => Number(e.quantity) > 0) || w.customRows.some((c) => c.name && Number(c.quantity) && Number(c.rate));

/** Share a week's wages over the sheet's items, top-down, up to what's left on each (390 pbWageAutoAllocate). Manual rows are kept and count against the pool. */
export function autoAllocate(items: { id: string; rate: number; quantity: number }[], priorQty: Record<string, number>, manualThisWeek: Record<string, number>, wages: number) {
  let left = wages;
  const out: { id: string; qty: number | null; amount: number; manual: boolean }[] = [];
  items.forEach((it) => {
    if (manualThisWeek[it.id] != null) { left -= manualThisWeek[it.id]; return; }
    const rate = Number(it.rate || 0), remain = Math.max(0, Number(it.quantity || 0) - (priorQty[it.id] || 0)) * rate;
    if (left <= 0 || remain <= 0 || rate <= 0) { out.push({ id: it.id, qty: null, amount: 0, manual: false }); return; }
    const take = Math.min(left, remain);
    out.push({ id: it.id, qty: pbRound2(take / rate), amount: take, manual: false });
    left -= take;
  });
  return { rows: out, left: Math.max(0, left) };
}
