// Price Sheet rate card rules (300 / 760): the categories in RTB's order with
// each item's dropdown options attached, units, and reading a typed rate. Pure.
export type RateItem = { id: string; category: string; name: string; unit: string; is_dropdown: boolean; rate: number | null; sort_order?: number | null };
export type RateOption = { id: string; rate_item_id: string; label: string; rate: number; sort_order?: number | null };
export const PRICE_CATEGORY_ORDER = ['Pitched Roofing', 'Roofline', 'Leadwork', 'Loft Insulation', 'General'];
export const RATE_UNITS: [string, string][] = [['lm', 'Linear metre (lm)'], ['m2', 'm²'], ['each', 'Each']];

export function rateCategories(items: RateItem[], options: RateOption[]) {
  const opts: Record<string, RateOption[]> = {};
  options.forEach((o) => { (opts[o.rate_item_id] = opts[o.rate_item_id] || []).push(o); });
  const cats: { name: string; items: RateItem[] }[] = [];
  items.forEach((it) => { let c = cats.find((x) => x.name === it.category); if (!c) { c = { name: it.category, items: [] }; cats.push(c); } c.items.push(it); });
  cats.sort((a, b) => {
    const ai = PRICE_CATEGORY_ORDER.indexOf(a.name), bi = PRICE_CATEGORY_ORDER.indexOf(b.name);
    if (ai > -1 && bi > -1) return ai - bi;
    if (ai > -1) return -1;
    if (bi > -1) return 1;
    return a.name.localeCompare(b.name);
  });
  return { cats, opts };
}
/** A typed rate: a number, or null when it isn't one. */
export function readRate(v: string): number | null {
  const n = parseFloat(String(v || '').replace(/[£,\s]/g, ''));
  return Number.isNaN(n) ? null : n;
}
