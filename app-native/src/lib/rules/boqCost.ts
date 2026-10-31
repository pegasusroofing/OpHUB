// Bill of Quantities costing (902 finCostFromPct / finContractGroupRange, 9219zs finBqdInsertAt):
// a line's budget cost from a margin or mark-up %, the margin shown on a line, which item lines sit
// under a section, and where a new line goes when added under a heading.
import { money } from './finance.ts';

export type BoqKind = 'item' | 'section' | 'subsection' | string;

/** Margin m% of the sale price: cost = sale × (1 − m/100). Mark-up k% on cost: cost = sale ÷ (1 + k/100). */
export function costFromPct(sale: number | null | undefined, basis: 'margin' | 'markup', pct: number): number | null {
  const s = Number(sale), p = Number(pct);
  if (sale == null || isNaN(s) || isNaN(p)) return null;
  return Math.round((basis === 'markup' ? s / (1 + p / 100) : s * (1 - p / 100)) * 100) / 100;
}
/** "Margin 25% · mark-up 33.3%" for a line with a sale value and a cost, or ''. */
export function marginText(value: number | null | undefined, cost: number | null | undefined): string {
  const v = Number(value), c = Number(cost);
  if (cost == null || value == null || isNaN(c) || !v) return '';
  const m = ((v - c) / v) * 100, k = c ? ((v - c) / c) * 100 : null;
  const pct = (n: number) => `${Math.round(n * 10) / 10}%`;
  return `Margin ${pct(m)} (${money(v - c)})${k != null ? ` · mark-up ${pct(k)}` : ''}`;
}
/** The item lines under a section (to the next section) or sub-section (to the next heading). */
export function groupRange(rows: { kind?: BoqKind }[], i: number): number[] {
  const level = rows[i]?.kind, out: number[] = [];
  for (let j = i + 1; j < rows.length; j++) {
    const k = rows[j].kind;
    if (k === 'section' || (level === 'subsection' && k === 'subsection')) break;
    if (k !== 'section' && k !== 'subsection') out.push(j);
  }
  return out;
}
/** Where a new line goes when added under the heading at i: the end of that heading's lines. */
export function insertAt(rows: { kind?: BoqKind }[], i: number, kind: BoqKind): number {
  const head = rows[i]; if (!head) return rows.length;
  let j = i + 1;
  for (; j < rows.length; j++) {
    const k = rows[j].kind;
    if (k === 'section') break;
    if (k === 'subsection' && (head.kind === 'subsection' || kind === 'item' || head.kind === 'item')) break;
  }
  return head.kind === 'item' ? i + 1 : j;
}
