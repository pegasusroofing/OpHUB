// Code each line of a purchase invoice to a project and cost type (9219g finPiCodeSave): lines on one
// project / cost type just set the invoice's cost type; otherwise the net is split across the
// project / cost type pairs in the same proportions as the lines.
type Row = Record<string, any>;
export type CodeLine = { description: string; amount: number; site_id: string; cost_code: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
const lineAmount = (l: Row) => (l.amount != null ? Number(l.amount) : l.qty != null && l.unit_price != null ? round2(Number(l.qty) * Number(l.unit_price)) : 0);

/** The invoice's item lines, each with the project and cost type it's coded to now. */
export function codeStart(i: Row, cats: Record<string, string>): CodeLine[] {
  const def = cats[i.cost_code] ? i.cost_code : 'materials';
  return ((i.lines || []) as Row[]).filter((l) => l && (l.kind || 'item') !== 'total').map((l) => ({ description: l.description || '', amount: lineAmount(l), site_id: l.site_id || i.site_id, cost_code: cats[l.cost_code] ? l.cost_code : def }));
}

/** The update to save, or an error. */
export function codePatch(i: Row, lines: CodeLine[]): { patch: Row } | { error: string } {
  const tot = lines.reduce((t, l) => t + Math.max(0, Number(l.amount || 0)), 0);
  if (!(tot > 0)) return { error: 'These lines have no amounts to share by.' };
  const by: Record<string, { site_id: string; cost_code: string; amt: number }> = {};
  lines.forEach((l) => { const k = `${l.site_id}|${l.cost_code}`; const e = (by[k] = by[k] || { site_id: l.site_id, cost_code: l.cost_code, amt: 0 }); e.amt += Math.max(0, Number(l.amount || 0)); });
  const parts = Object.values(by).filter((e) => e.amt > 0).sort((a, b) => b.amt - a.amt);
  const net = Number(i.net || 0);
  const out = ((i.lines || []) as Row[]).slice(); let j = 0;
  out.forEach((l, idx) => { if (l && (l.kind || 'item') !== 'total') { const c = lines[j++]; if (c) out[idx] = { ...l, site_id: c.site_id, cost_code: c.cost_code }; } });
  if (parts.length === 1 && parts[0].site_id === i.site_id) return { patch: { cost_code: parts[0].cost_code, split: null, lines: out } };
  const split = parts.map((e) => ({ site_id: e.site_id, sub_job_id: null, pct: Math.round((e.amt / tot) * 1000000) / 10000, amount: round2((e.amt / tot) * net), cost_code: e.cost_code }));
  const sumP = split.reduce((t, x) => t + x.pct, 0);
  split[split.length - 1].pct = Math.round((split[split.length - 1].pct + 100 - sumP) * 10000) / 10000;
  return { patch: { cost_code: parts[0].cost_code, split, sub_job_id: null, lines: out } };
}
