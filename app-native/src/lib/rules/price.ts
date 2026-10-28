// Price tile figures (390 loadPriceTileData). Pure functions only.

export type PriceElement = { id: string; site_id: string; sub_site_id: string | null; name: string; sort_order: number | null; price_total: number | null; price_booked_override: number | null; closed: boolean | null; closed_show_price_to_operatives: boolean | null; group_id: string | null; include_in_summary?: boolean | null };
export type PriceWeek = { element_id: string; week_number: number; amount: number | null };
export type Variation = { id?: string; element_id: string; amount: number | null; status: string };
export type Figures = { autoBookedIn: number; hasOverride: boolean; bookedIn: number; priceTotal: number; awNotApprovedTotal: number; awApprovedTotal: number; balance: number };

export function elementFigures(el: PriceElement, weeks: PriceWeek[], aw: Variation[]): Figures {
  const autoBookedIn = weeks.filter((w) => w.element_id === el.id).reduce((s, w) => s + Number(w.amount || 0), 0);
  const hasOverride = el.price_booked_override !== null && el.price_booked_override !== undefined;
  const bookedIn = hasOverride ? Number(el.price_booked_override) : autoBookedIn;
  const priceTotal = Number(el.price_total || 0);
  const mine = aw.filter((r) => r.element_id === el.id);
  const awNotApprovedTotal = mine.filter((r) => r.status !== 'approved').reduce((s, r) => s + Number(r.amount || 0), 0);
  const awApprovedTotal = mine.filter((r) => r.status === 'approved').reduce((s, r) => s + Number(r.amount || 0), 0);
  return { autoBookedIn, hasOverride, bookedIn, priceTotal, awNotApprovedTotal, awApprovedTotal, balance: priceTotal + awApprovedTotal - bookedIn };
}

/** Combined figures for a colour group's open tiles. */
export function groupFigures(els: PriceElement[], figs: Record<string, Figures>) {
  const out: Record<string, { priceTotal: number; bookedIn: number; awApprovedTotal: number; count: number; balance: number }> = {};
  els.forEach((el) => {
    if (!el.group_id || el.closed) return;
    const f = figs[el.id], g = (out[el.group_id] ||= { priceTotal: 0, bookedIn: 0, awApprovedTotal: 0, count: 0, balance: 0 });
    g.priceTotal += f.priceTotal; g.bookedIn += f.bookedIn; g.awApprovedTotal += f.awApprovedTotal; g.count++;
    g.balance = g.priceTotal + g.awApprovedTotal - g.bookedIn;
  });
  return out;
}

export const money = (n: number | null | undefined) => `£${(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Reads a typed amount: '' = clear, number, or 'bad'. */
export function readAmount(v: string): number | null | 'bad' {
  const t = v.trim().replace(/[£,]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : 'bad';
}
