// The Price Sheet rate card as an Excel file (760 exportPriceRateExcel /
// importPriceRateExcel): a Read Me tab, then one tab per element of works —
// Item | Unit | Rate (£) | Option 1 | Option 1 Rate (£) … up to 6 pairs. Reading
// it back gives the whole new card (uploading replaces the card). Pure.
import { rateCategories, type RateItem, type RateOption } from './rateCard.ts';
import type { XSheet } from './xlsx.ts';
import type { Cell } from './xlsxRead.ts';

export const OPTION_SLOTS = 6;
const SKIP = ['read me', 'readme', 'instructions'];
const UNIT_LABEL: Record<string, string> = { lm: 'Linear metre', m2: 'm²', each: 'Each' };
const UNIT_FROM: Record<string, string> = { lm: 'lm', 'linear metre': 'lm', 'linear metres': 'lm', 'linear m': 'lm', m: 'lm', m2: 'm2', 'sq m': 'm2', sqm: 'm2', 'm²': 'm2', 'm2 (sq m)': 'm2', each: 'each', ea: 'each', no: 'each', nr: 'each' };

export function rateCardSheets(items: RateItem[], options: RateOption[], company: string): XSheet[] {
  const { cats, opts } = rateCategories(items, options);
  const readMe: XSheet = { name: 'Read Me', widths: [100], rows: [
    [{ v: `${company} Price Sheet Rate Card`, s: 'title' }], [],
    ['One tab per element of works. Each row is one item.'],
    ['Columns: Item | Unit | Rate (£) | Option 1 | Option 1 Rate (£) | Option 2 | Option 2 Rate (£) ... up to 6 pairs.'], [],
    ['A plain item: fill in Rate, leave every Option column blank.'],
    ['A dropdown item: leave Rate blank, fill in Option/Rate pairs (e.g. "Plain Tiles" / 37.50). To add a new'],
    ['option to an item that already has some, just use the next empty pair.'], [],
    ['To add a whole new element of works, add a new tab named after it.'],
    ['Unit is one of: lm (linear metre), m2 (m²), each.'], [],
    ['Uploading this file back to the app REPLACES the entire rate card with what is in it — download the'],
    ['current version first, edit it, then upload the whole thing back rather than a partial file.'],
  ] };
  const head = ['Item', 'Unit', 'Rate (£)']; for (let i = 1; i <= OPTION_SLOTS; i++) head.push(`Option ${i}`, `Option ${i} Rate (£)`);
  return [readMe, ...cats.map((c): XSheet => ({
    name: c.name.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Category',
    widths: [42, 12, 10, ...Array(OPTION_SLOTS).fill(0).flatMap(() => [18, 12])],
    rows: [head.map((h) => ({ v: h, s: 'head' as const })), ...c.items.map((it) => {
      const o = opts[it.id] || [];
      const row: Cell[] = [it.name, UNIT_LABEL[it.unit] || it.unit, it.is_dropdown || it.rate == null ? '' : Number(it.rate)];
      for (let i = 0; i < OPTION_SLOTS; i++) row.push(o[i] ? o[i].label : '', o[i] ? Number(o[i].rate) : '');
      return row;
    })],
  }))];
}

export type NewRateItem = { category: string; name: string; unit: string; rate: number | null; is_dropdown: boolean; sort_order: number; options: { label: string; rate: number; sort_order: number }[] };
export function readRateCard(sheets: { name: string; rows: Cell[][] }[]): { items: NewRateItem[]; skipped: number } {
  const items: NewRateItem[] = []; let skipped = 0;
  sheets.forEach((sh) => {
    if (SKIP.includes(sh.name.trim().toLowerCase()) || !sh.rows.length) return;
    const category = sh.name.trim(); let sort = 0;
    const header = String(sh.rows[0]?.[0] ?? '').trim().toLowerCase() === 'item';
    for (let i = header ? 1 : 0; i < sh.rows.length; i++) {
      const r = sh.rows[i]; if (!r || !r.length) continue;
      const name = String(r[0] ?? '').trim(); if (!name) continue;
      const unit = UNIT_FROM[String(r[1] ?? '').trim().toLowerCase()] || 'each';
      const options: NewRateItem['options'] = [];
      for (let s = 0; s < OPTION_SLOTS; s++) {
        const label = String(r[3 + s * 2] ?? '').trim(), rate = parseFloat(String(r[3 + s * 2 + 1] ?? ''));
        if (label && !Number.isNaN(rate)) options.push({ label, rate, sort_order: options.length });
      }
      if (options.length) { items.push({ category, name, unit, rate: null, is_dropdown: true, sort_order: sort++, options }); continue; }
      const rate = parseFloat(String(r[2] ?? ''));
      if (Number.isNaN(rate)) { skipped++; continue; }
      items.push({ category, name, unit, rate, is_dropdown: false, sort_order: sort++, options: [] });
    }
  });
  return { items, skipped };
}
