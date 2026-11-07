// A repair job's quote (Andy, 7 Nov 2026): lines from the contract's schedule of rates (less its set discount) or typed
// in, or just one figure. No VAT on the lines: the contract's VAT (from its Finance set-up) is added once at the bottom.
// Pure functions only.

export type QuoteLine = { code?: string | null; description: string; unit?: string | null; qty: number; rate: number; sor?: boolean };
export type Rate = { id: string; code: string | null; description: string; unit: string | null; rate: number; category?: string | null; section?: string | null; title?: string | null; source?: string | null };

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

const SHOUTY: Record<string, string> = { Ne: 'NE', Eo: 'EO', Hp: 'HP', Wbp: 'WBP', Pvcu: 'PVCu', Upvc: 'uPVC', Epdm: 'EPDM', Grp: 'GRP', Mm: 'mm', Sm: 'SM', Lm: 'LM' };
/** "TILE:RENEW WITH RESIN" → "Tile: Renew With Resin" (the NHF short titles are in capitals). */
export function titleWords(s: string): string {
  const t = String(s || '').replace(/\s*:\s*/g, ': ').replace(/\s+/g, ' ').trim();
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase()
    .replace(/(^|[\s(/-])([a-z])/g, (_m, a: string, c: string) => a + c.toUpperCase())
    .replace(/\b[A-Z][a-z]+\b/g, (w) => SHOUTY[w] || w);
}
/** What a rate is called in a list or on a quote: its short title, else the first line of its description. */
export const rateTitle = (r: Pick<Rate, 'title' | 'description'>) => titleWords(r.title || String(r.description || '').split(/\r?\n/)[0]);
/** The full wording under the title (NHF descriptions repeat the title first), for a second line. */
export const rateWording = (r: Pick<Rate, 'title' | 'description'>) => (r.title ? String(r.description || '').split(/\r?\n/).slice(1).join(' ').trim() : '');

/** A schedule-of-rates item as a quote line (quantity 1 to start). */
export const rateLine = (r: Rate, qty = 1): QuoteLine => ({ code: r.code, description: r.title ? rateTitle(r) : r.description, unit: r.unit, qty, rate: Number(r.rate || 0), sor: true });

export type SheetRate = { code: string | null; description: string; unit: string | null; rate: number; category: string | null; section: string | null; title: string | null };
const lastLine = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean).pop() || '';
/** A whole schedule of rates workbook, NHF style (Andy, 7 Nov 2026): each sheet is a category (Pitched Roofing, Flat
 *  Roofing…), a row with no rate is a heading the items under it sit in, and each item has a code (or none), a
 *  description (a short title in capitals on its first line, then the full wording), a unit and a rate. Header rows
 *  (Item / Description / Unit / Rate) are skipped; a heading with "Unit | Rate" beside it counts as a heading. */
export function parseScheduleSheets(sheets: { name: string; rows: (string | number | null | undefined)[][] }[]): SheetRate[] {
  const out: SheetRate[] = [];
  sheets.forEach((sh) => {
    let section: string | null = null;
    const category = String(sh.name || '').trim() || null;
    sh.rows.forEach((row) => {
      const c = row.map((x) => String(x ?? '').replace(/\r/g, '').trim());
      if (!c.some(Boolean)) return;
      const upper = c.map((x) => x.toUpperCase());
      if (upper.includes('UNIT') || upper.includes('RATE') || upper.includes('DESCRIPTION')) {
        if (c[0] && !['ITEM', 'CODE', 'DESCRIPTION'].includes(upper[0])) section = lastLine(c[0]) || section;
        return;
      }
      const nums = c.map((x) => x.replace(/[£,\s]/g, '')).map((x) => (/^-?\d+(\.\d+)?$/.test(x) ? Number(x) : null));
      const rateIdx = nums.map((n, i) => (n == null ? -1 : i)).filter((i) => i >= 0).pop();
      const texts = c.map((x, i) => ({ x, i })).filter(({ x, i }) => i !== rateIdx && x);
      if (rateIdx == null) {
        // No rate: a heading (its last line, when it has two).
        const h = texts.slice().sort((a, b) => b.x.length - a.x.length)[0]?.x;
        if (h && h.length <= 160) section = lastLine(h) || section;
        return;
      }
      const desc = texts.filter((t) => t.i < rateIdx).sort((a, b) => b.x.length - a.x.length)[0];
      if (!desc) return;
      const before = texts.find((t) => t.i < desc.i)?.x || '';
      const code = before && before.length <= 14 && !/\s/.test(before) ? before : null;
      const unit = texts.find((t) => t.i > desc.i && t.i < rateIdx)?.x || null;
      const lines = desc.x.split('\n').map((x) => x.trim()).filter(Boolean);
      out.push({ code, description: lines.join('\n'), unit, rate: Number(nums[rateIdx]), category, section, title: lines.length > 1 ? lines[0] : null });
    });
  });
  return out;
}

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
