// A repair job's quote (Andy, 7 Nov 2026): lines from the contract's schedule of rates (less its set discount) or typed
// in, or just one figure. No VAT on the lines: the contract's VAT (from its Finance set-up) is added once at the bottom.
// Pure functions only.

export type QuoteLine = { code?: string | null; description: string; unit?: string | null; qty: number; rate: number; sor?: boolean };
export type Rate = { id: string; code: string | null; description: string; unit: string | null; rate: number };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** VAT for a treatment: standard 20%; reverse charge and zero rated, none on the quote (reverse charge says so). */
export function vatFor(treatment: string | null | undefined): { pct: number; note: string } {
  if (treatment === 'reverse_charge') return { pct: 0, note: 'Domestic reverse charge: the customer accounts for the VAT.' };
  if (treatment === 'zero') return { pct: 0, note: 'Zero rated.' };
  return { pct: 20, note: '' };
}

/** A line's value: quantity × rate, less the discount if it's from the schedule of rates. */
export const lineValue = (l: QuoteLine, discountPct: number) => r2(Number(l.qty || 0) * Number(l.rate || 0) * (l.sor ? 1 - (discountPct || 0) / 100 : 1));

export function quoteTotals(lines: QuoteLine[], discountPct: number, treatment: string | null | undefined) {
  const sorGross = r2(lines.filter((l) => l.sor).reduce((t, l) => t + Number(l.qty || 0) * Number(l.rate || 0), 0));
  const discount = r2(sorGross * (discountPct || 0) / 100);
  const net = r2(lines.reduce((t, l) => t + lineValue(l, discountPct), 0));
  const v = vatFor(treatment);
  const vat = r2(net * v.pct / 100);
  return { sorGross, discount, net, vatPct: v.pct, vat, total: r2(net + vat), vatNote: v.note };
}

/** A schedule-of-rates item as a quote line (quantity 1 to start). */
export const rateLine = (r: Rate, qty = 1): QuoteLine => ({ code: r.code, description: r.description, unit: r.unit, qty, rate: Number(r.rate || 0), sor: true });

/** Rates from a pasted or exported table: Code, Description, Unit, Rate (a header row is skipped; £ and commas allowed). */
export function parseRates(rows: (string | number | null | undefined)[][]): { code: string | null; description: string; unit: string | null; rate: number }[] {
  const out: { code: string | null; description: string; unit: string | null; rate: number }[] = [];
  rows.forEach((row) => {
    const c = row.map((x) => String(x ?? '').trim());
    if (c.length < 2) return;
    // Description is the longest text cell; rate the last number-looking cell.
    const nums = c.map((x) => x.replace(/[£,\s]/g, '')).map((x) => (/^-?\d+(\.\d+)?$/.test(x) ? Number(x) : null));
    const rateIdx = nums.map((n, i) => (n == null ? -1 : i)).filter((i) => i >= 0).pop();
    if (rateIdx == null) return;
    const texts = c.map((x, i) => ({ x, i })).filter(({ x, i }) => i !== rateIdx && x);
    const desc = texts.slice().sort((a, b) => b.x.length - a.x.length)[0];
    if (!desc || /^(description|item)$/i.test(desc.x)) return;
    const code = texts.find((t) => t.i < desc.i)?.x || null;
    const unit = texts.find((t) => t.i > desc.i && t.i < rateIdx)?.x || null;
    out.push({ code, description: desc.x, unit, rate: Number(nums[rateIdx]) });
  });
  return out;
}
