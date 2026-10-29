// Monthly project report (920): per month — applied and certified (the change
// from the last application), invoiced and actual costs — for the whole job,
// then each plot / repair job (by the plot on each schedule line and each
// cost), with the forecast value, budget and final cost. Pure.
import { round2 } from './finance.ts';

type Row = Record<string, any>;
export type MonGroup = { id: string; name: string };
export type MonRow = { label: string; vals: number[] | null; total: number | null };
const mk = (d: unknown) => (d ? String(d).slice(0, 7) : '');
const pct = (p: unknown) => Math.max(0, Math.min(100, Number(p || 0)));

/** Which plot each schedule line belongs to (its own, else its sub-section's, else its section's). */
export function itemPlots(items: Row[]): Record<string, string | null> {
  const out: Record<string, string | null> = {}; let sec: string | null = null, sub: string | null = null;
  items.forEach((i) => {
    const own = i.sub_job_id || i.sub || null;
    if (i.kind === 'section') { sec = own; sub = null; out[i.id || ''] = own; return; }
    if (i.kind === 'subsection') { sub = own; out[i.id || ''] = own || sec; return; }
    out[i.id || ''] = own || sub || sec;
  });
  return out;
}
const isItem = (i: Row) => !i.kind || i.kind === 'item';

export function monthlyReport(input: {
  apps: Row[]; invs: Row[]; lines: { cat: string; date: string | null; net: number; sub: string | null }[]; items: Row[]; subs: MonGroup[];
  forecast: { value: number | null; budget: number | null; final: number | null }; subValues: Record<string, number | null>; today: string;
}) {
  const { subs } = input;
  const groups: MonGroup[] = [{ id: 'all', name: 'Total' }, ...(subs.length ? [...subs, { id: 'none', name: 'Not allocated' }] : [])];
  const data: Record<string, Record<string, Record<string, number>>> = {};
  groups.forEach((g) => { data[g.id] = { applied: {}, certified: {}, invoiced: {}, cost: {} }; });
  const add = (g: string, row: string, m: string, v: number) => { if (!data[g] || !m || !v) return; data[g][row][m] = round2((data[g][row][m] || 0) + v); };
  const months = new Set<string>();
  const plots = itemPlots(input.items);
  let pg = 0, pc = 0; const prevPlot: Record<string, number> = {};
  input.apps.filter((a) => !['void', 'draft'].includes(a.status)).sort((x, y) => x.number - y.number).forEach((a) => {
    const m = mk(a.valuation_date); months.add(m);
    const g = Number(a.gross || 0); add('all', 'applied', m, round2(g - pg)); pg = g;
    if (a.cert_gross != null) { const cm = mk(a.cert_date || a.valuation_date); months.add(cm); add('all', 'certified', cm, round2(Number(a.cert_gross) - pc)); pc = Number(a.cert_gross); }
    if (subs.length) {
      const byPlot: Record<string, number> = {};
      (a.lines || []).forEach((l: Row) => { if (!isItem(l)) return; const k = plots[l.item_id] || 'none'; byPlot[k] = (byPlot[k] || 0) + (Number(l.value || 0) * pct(l.pct)) / 100; });
      Object.keys({ ...byPlot, ...prevPlot }).forEach((k) => { const now = round2(byPlot[k] || 0); add(data[k] ? k : 'none', 'applied', m, round2(now - (prevPlot[k] || 0))); prevPlot[k] = now; });
    }
  });
  input.invs.filter((i) => !['void', 'draft'].includes(i.status)).forEach((i) => { const m = mk(i.issue_date || i.created_at); months.add(m); add('all', 'invoiced', m, Number(i.net || 0)); });
  input.lines.filter((l) => l.cat !== 'committed').forEach((l) => { const m = mk(l.date); if (!m) return; months.add(m); add('all', 'cost', m, l.net); if (subs.length) add(l.sub && data[l.sub] ? l.sub : 'none', 'cost', m, l.net); });
  months.add(mk(input.today));
  const ms = Array.from(months).filter(Boolean).sort();
  const all: string[] = [];
  if (ms.length) { let [y, mo] = ms[0].split('-').map(Number); const [ly, lm] = ms[ms.length - 1].split('-').map(Number); while (y < ly || (y === ly && mo <= lm)) { all.push(`${y}-${String(mo).padStart(2, '0')}`); mo++; if (mo > 12) { mo = 1; y++; } } }
  const schedCost: Record<string, number> = {}; input.items.filter(isItem).forEach((i) => { if (i.cost == null) return; const k = plots[i.id] || 'none'; schedCost[k] = round2((schedCost[k] || 0) + Number(i.cost)); });
  const committed: Record<string, number> = {}; input.lines.filter((l) => l.cat === 'committed').forEach((l) => { const k = l.sub && data[l.sub] ? l.sub : 'none'; committed[k] = round2((committed[k] || 0) + l.net); });
  const fcast: Record<string, { value: number | null; budget: number | null; final: number | null }> = { all: input.forecast };
  groups.slice(1).forEach((g) => {
    const k = g.id, value = k === 'none' ? input.subValues[''] ?? null : input.subValues[k] ?? null;
    const spent = round2(Object.values(data[k].cost).reduce((t, v) => t + v, 0)), budget = schedCost[k] != null ? schedCost[k] : null;
    fcast[k] = { value, budget, final: round2(Math.max(budget || 0, spent + (committed[k] || 0))) };
  });
  return { groups, data, months: all, fcast };
}

const ROWS: [string, string][] = [['applied', 'Applied'], ['certified', 'Certified'], ['invoiced', 'Invoiced'], ['cost', 'Actual costs']];
/** The rows to show / export for each group, "in the month" or as running totals. */
export function monthlyRows(r: ReturnType<typeof monthlyReport>, cum: boolean): { g: MonGroup; rows: MonRow[] }[] {
  return r.groups.map((g) => {
    const d = r.data[g.id], f = r.fcast[g.id] || { value: null, budget: null, final: null };
    const rows: MonRow[] = ROWS.filter(([k]) => g.id === 'all' || !['certified', 'invoiced'].includes(k)).map(([k, l]) => {
      let run = 0;
      const vals = r.months.map((m) => { const v = d[k][m] || 0; run = round2(run + v); return cum ? run : v; });
      return { label: l, vals, total: round2(Object.values(d[k]).reduce((t, v) => t + v, 0)) };
    });
    rows.push({ label: 'Forecast value', vals: null, total: f.value }, { label: 'Forecast budget', vals: null, total: f.budget }, { label: 'Forecast final cost', vals: null, total: f.final });
    return { g, rows };
  });
}
