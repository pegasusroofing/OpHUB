// Booking a cost to a plot / repair job, or splitting it across projects and plots (917 openFinSplit /
// saveFinSplit): lines by % or by £, share evenly, across all plots, the rounding penny on the last
// line, and the patch saved (sub_job_id for one line on the home project, otherwise `split`). Pure.
import { round2 } from './finance.ts';

type Row = Record<string, any>;
export type SplitLine = { site_id: string; sub: string; v: number | null };

/** The lines to start from: the saved split, or where it goes now (`alloc` = allocs(row)). */
export const splitStart = (row: Row, alloc: { site_id: string; sub: string | null; share: number }[]): SplitLine[] =>
  Array.isArray(row.split) && row.split.length ? row.split.map((e: Row) => ({ site_id: e.site_id, sub: e.sub_job_id || '', v: Number(e.pct) })) : alloc.map((x) => ({ site_id: x.site_id, sub: x.sub || '', v: round2(x.share * 100) }));
export const splitTotal = (rows: SplitLine[]) => round2(rows.reduce((t, r) => t + (Number(r.v) || 0), 0));
/** The rounding penny goes on the last line. */
export function splitFix(rows: SplitLine[], target: number): SplitLine[] {
  if (!rows.length) return rows;
  const out = rows.map((r) => ({ ...r })), last = out[out.length - 1];
  last.v = round2((Number(last.v) || 0) + target - splitTotal(out));
  return out;
}
export function splitMode(rows: SplitLine[], to: 'pct' | 'gbp', net: number): SplitLine[] {
  const out = rows.map((r) => ({ ...r, v: to === 'gbp' ? round2(((Number(r.v) || 0) / 100) * net) : round2(((Number(r.v) || 0) / net) * 100) }));
  return Math.abs(splitTotal(out) - (to === 'pct' ? 100 : net)) < 0.05 ? splitFix(out, to === 'pct' ? 100 : net) : out;
}
export const splitEven = (rows: SplitLine[], target: number) => splitFix(rows.map((r) => ({ ...r, v: round2(target / rows.length) })), target);
export const splitAcross = (siteId: string, subs: string[], target: number) => splitFix(subs.map((s) => ({ site_id: siteId, sub: s, v: round2(target / subs.length) })), target);
/** "Still to allocate: 20%" / "✓ Adds up to 100%". */
export function splitFoot(rows: SplitLine[], pct: boolean, net: number | null, money: (v: number) => string) {
  const target = pct ? 100 : Number(net || 0), left = round2(target - splitTotal(rows)), ok = Math.abs(left) < 0.01;
  return { ok, text: ok ? `✓ Adds up to ${pct ? '100%' : money(target)}` : `${left > 0 ? 'Still to allocate: ' : 'Over by: '}${pct ? `${round2(Math.abs(left))}%` : money(Math.abs(left))}` };
}

/** What to save, or why not. One line on the home project = just its plot; otherwise the split with
 *  percentages to 4 dp adding up to exactly 100 (and the £ share when there's a value). */
export function splitPatch(rows0: SplitLine[], homeSite: string, pct: boolean, net: number | null, money: (v: number) => string): { patch?: Row; error?: string } {
  const rows = rows0.filter((r) => r.site_id && Number(r.v) > 0);
  if (!rows.length) return { error: 'Add at least one line.' };
  const target = pct ? 100 : Number(net || 0), tot = splitTotal(rows);
  if (Math.abs(tot - target) >= 0.01) return { error: `It needs to add up to ${pct ? '100%' : money(target)} — it’s ${pct ? `${tot}%` : money(tot)}.` };
  const seen = new Set<string>();
  for (const r of rows) { const k = `${r.site_id}|${r.sub || ''}`; if (seen.has(k)) return { error: 'The same project / plot is on two lines — put them together.' }; seen.add(k); }
  if (rows.length === 1 && rows[0].site_id === homeSite) return { patch: { sub_job_id: rows[0].sub || null, split: null } };
  const out = rows.map((r) => ({ site_id: r.site_id, sub_job_id: r.sub || null, pct: pct ? Math.round(Number(r.v) * 10000) / 10000 : Math.round((Number(r.v) / Number(net)) * 1000000) / 10000, amount: net != null ? (pct ? round2((Number(r.v) / 100) * net) : round2(Number(r.v))) : null }));
  const sumP = out.reduce((t, x) => t + x.pct, 0); out[out.length - 1].pct = Math.round((out[out.length - 1].pct + 100 - sumP) * 10000) / 10000;
  return { patch: { split: out, sub_job_id: null } };
}
