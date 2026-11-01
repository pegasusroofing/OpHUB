// Sorting a Finance table by its headings (Andy, 1 Nov 2026): click for A to Z, again for Z to A, again for off.
// Pure rules, so they can be tested without the screen.
export type FinSort = { k: string; dir: 'asc' | 'desc' };
export type SortCol<T> = { k: string; sort?: (r: T) => string | number | null | undefined };

/** What a column sorts by: its own rule, else the words in the cell. Money and plain numbers sort as numbers. */
export function sortKey<T>(c: SortCol<T>, r: T, text: (r: T) => string): string | number {
  const v = c.sort ? c.sort(r) : text(r).trim();
  if (v == null || v === '') return '';
  if (typeof v === 'number') return v;
  const n = String(v).replace(/[£,\s]/g, '');
  return /^-?\d+(\.\d+)?$/.test(n) ? Number(n) : String(v);
}

/** The rows in the chosen order; blanks go last either way. No choice means the rows as they came. */
export function sortRows<T>(rows: T[], cols: SortCol<T>[], by: FinSort | null, text: (c: SortCol<T>, r: T) => string): T[] {
  const c = by && cols.find((x) => x.k === by.k);
  if (!c || !by) return rows;
  const dir = by.dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const x = sortKey(c, a, (r) => text(c, r)), y = sortKey(c, b, (r) => text(c, r));
    if (x === '' && y !== '') return 1;
    if (y === '' && x !== '') return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
    return String(x).localeCompare(String(y), 'en-GB', { numeric: true, sensitivity: 'base' }) * dir;
  });
}

/** The next state of a heading when clicked: A to Z, Z to A, off. */
export const nextSort = (cur: FinSort | null, k: string): FinSort | null => (cur?.k !== k ? { k, dir: 'asc' } : cur.dir === 'asc' ? { k, dir: 'desc' } : null);
