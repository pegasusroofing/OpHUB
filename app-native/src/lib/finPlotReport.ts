// Finance report: plot by plot (Andy, 2 Nov 2026). For each plot or repair job: its value, what's been invoiced and is
// owed, its costs by type, what's ordered, and invoiced less cost. Lives apart from finReports.ts because it needs the
// plots as well as the book; the auto-run server function doesn't have it yet.
import type { Col, Ctx, Filters, Result } from '@/lib/finReports';
import { costLines } from '@/lib/rules/finBook';
import { invOutstandingNet, round2 } from '@/lib/rules/finance';

type Row = Record<string, any>;
export type PlotCtx = Ctx & { plots: { id: string; site_id: string; name: string }[]; plotValues: Row[] };
const job = (s: Row) => `${s.job_number ? `${s.job_number} · ` : ''}${s.name || ''}`;
const CATS = ['materials', 'labour', 'plant', 'subcontract'];

/** A Bill line belongs to the plot set on it, or on the heading above it (as Costs by plot). */
function billValues(items: Row[]) {
  const out: Record<string, number> = {};
  let sec: string | null = null, sub: string | null = null;
  items.slice().sort((a, b) => Number(a.position || 0) - Number(b.position || 0)).forEach((i) => {
    if (i.kind === 'section') { sec = i.sub_job_id || null; sub = null; return; }
    if (i.kind === 'subsection') { sub = i.sub_job_id || null; return; }
    const k = i.sub_job_id || sub || sec || ''; out[k] = (out[k] || 0) + Number(i.value || 0);
  });
  return out;
}

export function runPlotReport(c: PlotCtx, f: Filters): Result {
  const rows: Row[] = [];
  const sites = c.sites.filter((s) => (!f.job || s.id === f.job) && (f.status === 'all' || !f.status || c.status(s) === f.status)).sort((a, b) => String(a.job_number || '').localeCompare(String(b.job_number || ''), undefined, { numeric: true }));
  sites.forEach((s) => {
    const plots = c.plots.filter((p) => p.site_id === s.id);
    const items = (c.b.items || []).filter((i) => i.site_id === s.id);
    const values: Record<string, number> = items.length ? billValues(items) : {};
    if (!items.length) c.plotValues.filter((v) => v.site_id === s.id && v.value != null).forEach((v) => { values[v.sub_job_id] = Number(v.value); });
    const invs = (c.b.invs as Row[]).filter((i) => i.site_id === s.id && i.status !== 'void');
    const lines = costLines(c.b, s.id);
    const row = (key: string, name: string): Row => {
      const r: Row = { job: job(s), plot: name, value: values[key] != null ? round2(values[key]) : null, invoiced: 0, owed: 0, materials: 0, labour: 0, plant: 0, subcontract: 0, other: 0, cost: 0, committed: 0, _go: `/fin/job/${s.id}/parts` };
      invs.filter((i) => (i.sub_job_id || '') === key).forEach((i) => { r.invoiced += Number(i.net || 0); r.owed += invOutstandingNet(i as never); });
      lines.filter((l) => (l.sub || '') === key).forEach((l) => { if (l.cat === 'committed') r.committed += l.net; else { r[CATS.includes(l.cat) ? l.cat : 'other'] += l.net; r.cost += l.net; } });
      ['invoiced', 'owed', 'materials', 'labour', 'plant', 'subcontract', 'other', 'cost', 'committed'].forEach((k) => { r[k] = round2(r[k]); });
      r.left = round2(r.invoiced - r.cost);
      return r;
    };
    if (!plots.length) return; // single-site projects aren't in this report
    plots.forEach((p) => rows.push(row(p.id, p.name)));
    const un = row('', 'Not booked to a plot');
    if (un.invoiced || un.cost || un.committed || un.value) rows.push(un);
  });
  const cols: Col[] = [{ k: 'job', l: 'Project' }, { k: 'plot', l: 'Plot' }, { k: 'value', l: 'Value', money: true }, { k: 'invoiced', l: 'Invoiced', money: true }, { k: 'owed', l: 'Owed', money: true }, { k: 'materials', l: 'Materials', money: true }, { k: 'labour', l: 'Labour', money: true }, { k: 'plant', l: 'Plant', money: true }, { k: 'subcontract', l: 'Subcontract', money: true }, { k: 'other', l: 'Other', money: true }, { k: 'cost', l: 'Total cost', money: true }, { k: 'committed', l: 'Ordered', money: true }, { k: 'left', l: 'Invoiced less cost', money: true }];
  return { cols, rows, totals: true, note: 'Excl. VAT. Multi-site and repair projects only. Value is the Bill of Quantities by plot, or the value typed in Costs by plot. An invoice with no plot chosen, and any cost not booked to one, shows as Not booked to a plot.' };
}

export const PLOT_REPORT = { id: 'plots', group: 'qs', title: 'Plot by plot', desc: 'Value, invoiced, owed, costs and ordered for every plot or repair job.', filters: ['status', 'job'], run: (c: Ctx, f: Filters) => runPlotReport(c as PlotCtx, f) };
