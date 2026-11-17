// Finance › Overview's six tiles (Andy, 17 Nov 2026: "Can we have the tiles in finance Home Screen customisable with an
// ellipsis? I want what's owed out as a tile ... move qty of jobs as a note to the 1st tile ... Then put money due out
// as the 5th tile (this pulls through the total due out to manufacturers only)"). Each person chooses what each tile
// shows with its ⋯ (profiles.fin_home_tiles; empty means the standard six). Pure.

export const FIN_TILES = {
  live_value: 'Live Contract Value',
  live_jobs: 'Total Live Jobs',
  to_invoice: 'Still To Invoice',
  owed: 'Owed To You',
  overdue: 'Overdue',
  due_out: 'Due Out To Suppliers',
  ret_held: 'Retention Held By Clients',
} as const;
export type FinTile = keyof typeof FIN_TILES;
export const FIN_TILE_KEYS = Object.keys(FIN_TILES) as FinTile[];
/** The standard six: the number of live jobs is now a note on the first, and Due Out To Suppliers is fifth. */
export const DEFAULT_FIN_TILES: FinTile[] = ['live_value', 'to_invoice', 'owed', 'overdue', 'due_out', 'ret_held'];

/** Someone's saved six, tidied: unknown or repeated ones dropped, and any gaps filled from the standard six in order. */
export function finTileOrder(saved: readonly string[] | null | undefined): FinTile[] {
  const out: FinTile[] = [];
  (saved ?? []).forEach((k) => { if ((FIN_TILE_KEYS as string[]).includes(k) && !out.includes(k as FinTile) && out.length < 6) out.push(k as FinTile); });
  for (const k of [...DEFAULT_FIN_TILES, ...FIN_TILE_KEYS]) { if (out.length >= 6) break; if (!out.includes(k)) out.push(k); }
  return out;
}

/** Tile `slot` shows `key` now. If another tile already showed it, the two swap, so nothing shows twice. */
export function setFinTile(order: readonly FinTile[], slot: number, key: FinTile): FinTile[] {
  const next = [...order];
  const was = next.indexOf(key);
  if (was === slot) return next;
  if (was >= 0) next[was] = next[slot];
  next[slot] = key;
  return next;
}

/** True when the six are the standard ones in the standard order (then nothing needs saving). */
export const isStandardTiles = (order: readonly FinTile[]) => order.join() === DEFAULT_FIN_TILES.join();

type StmtRow = { status?: string | null; statement_date?: string | null; reconciled_at?: string | null; lines?: unknown };
/** Purchase invoices paid on a supplier's statement: a line counts once it's allocated (ticked), or the whole statement
 *  is reconciled (Andy, 5 Nov 2026). Purchase invoice id → the date. */
export function paidOnStatements(stmts: readonly StmtRow[]): Record<string, string> {
  const on: Record<string, string> = {};
  stmts.forEach((st) => ((st.lines as { match?: string | null; ignore?: boolean; allocated?: boolean }[] | null) || []).forEach((l) => {
    if (l.match && !l.ignore && !String(l.match).startsWith('in:') && (l.allocated || st.status === 'reconciled')) on[l.match] = String(st.statement_date || String(st.reconciled_at || '').slice(0, 10));
  }));
  return on;
}

type Pinv = { id: string; status: string; total?: number | null; paid_on?: string | null; sub_job_id?: string | null };
/** Money due out to suppliers (materials, plant, scaffold, skips: not subcontractors or labour, whose invoices are kept
 *  elsewhere; a subcontract order's invoice is left out too). Due: approved and not paid, including VAT, as Purchases'
 *  To Pay Suppliers. Checking: not approved yet (Needs Checking or queried) and not paid. */
export function supplierDueOut(pinvs: readonly Pinv[], paidIds: Record<string, string>): { due: number; dueN: number; checking: number; checkingN: number } {
  let due = 0, dueN = 0, checking = 0, checkingN = 0;
  pinvs.forEach((i) => {
    if (i.sub_job_id || i.paid_on || paidIds[i.id]) return;
    const t = Number(i.total || 0);
    if (i.status === 'approved') { due += t; dueN++; } else if (i.status === 'to_approve' || i.status === 'query') { checking += t; checkingN++; }
  });
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { due: r2(due), dueN, checking: r2(checking), checkingN };
}
