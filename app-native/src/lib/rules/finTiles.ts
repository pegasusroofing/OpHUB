// Finance › Overview's six tiles (Andy, 17 Nov 2026). They stay in their places ("keep positions fixed"): Live Contract
// Value (the number of jobs as a note), Still To Invoice, Owed To You, Overdue, Due Out To Suppliers, Retention Held By
// Clients. Each tile's ⋯ changes what its own figure covers ("Live contract value then ellipsis for all contract
// values, all by date, all closed, all upcoming ... Owed to you, same sort of thing, next 30 days, next 60 days, by date,
// by client"). Each person's choices are kept (profiles.fin_home_tiles, as "tile=view"; none means the standard). Pure.

export type TileKey = 'live_value' | 'to_invoice' | 'owed' | 'overdue' | 'due_out' | 'ret_held';
export const TILE_ORDER: TileKey[] = ['live_value', 'to_invoice', 'owed', 'overdue', 'due_out', 'ret_held'];
/** A tile's view: k is one of its choices; dates carry from / to; client / supplier carry who. */
export type View = { k: string; from?: string; to?: string; who?: string };
export type Views = Record<TileKey, View>;

const JOBS: [string, string][] = [['live', 'Live Jobs'], ['upcoming', 'Upcoming Jobs'], ['closed', 'Closed Jobs'], ['all', 'All Jobs'], ['dates', 'By Start Date…'], ['client', 'By Client…']];
/** Each tile's choices, in the ⋯'s order; the first is the standard one. */
export const TILE_CHOICES: Record<TileKey, [string, string][]> = {
  live_value: JOBS,
  to_invoice: JOBS,
  owed: [['all', 'All'], ['d30', 'Due In The Next 30 Days'], ['d60', 'Due In The Next 60 Days'], ['dates', 'By Due Date…'], ['client', 'By Client…']],
  overdue: [['all', 'All'], ['o30', 'Over 30 Days Late'], ['o60', 'Over 60 Days Late'], ['o90', 'Over 90 Days Late'], ['client', 'By Client…']],
  due_out: [['all', 'All'], ['d30', 'Due In The Next 30 Days'], ['d60', 'Due In The Next 60 Days'], ['late', 'Past Their Due Date'], ['dates', 'By Due Date…'], ['supplier', 'By Supplier…']],
  ret_held: [['all', 'All Jobs'], ['live', 'Live Jobs'], ['closed', 'Closed Jobs'], ['client', 'By Client…']],
};
const std = (t: TileKey): View => ({ k: TILE_CHOICES[t][0][0] });

/** Someone's saved views ("tile=k", "tile=dates:from:to", "tile=client:Name"); anything unknown means the standard. */
export function readViews(saved: readonly string[] | null | undefined): Views {
  const out = Object.fromEntries(TILE_ORDER.map((t) => [t, std(t)])) as Views;
  (saved ?? []).forEach((x) => {
    const at = x.indexOf('='); if (at < 0) return;
    const t = x.slice(0, at) as TileKey, v = x.slice(at + 1);
    if (!TILE_ORDER.includes(t)) return;
    const ks = TILE_CHOICES[t].map((c) => c[0]);
    if (v.startsWith('dates:')) { const [from, to] = v.slice(6).split(':'); if (ks.includes('dates') && /^\d{4}-\d{2}-\d{2}$/.test(from || '') && /^\d{4}-\d{2}-\d{2}$/.test(to || '')) out[t] = { k: 'dates', from, to }; return; }
    for (const w of ['client', 'supplier']) if (v.startsWith(`${w}:`)) { if (ks.includes(w) && v.length > w.length + 1) out[t] = { k: w, who: v.slice(w.length + 1) }; return; }
    if (ks.includes(v)) out[t] = { k: v };
  });
  return out;
}
/** What to save: only the tiles not on their standard view; null when all are. */
export function writeViews(v: Views): string[] | null {
  const out = TILE_ORDER.filter((t) => v[t].k !== std(t).k).map((t) => {
    const x = v[t];
    return `${t}=${x.k === 'dates' ? `dates:${x.from}:${x.to}` : x.k === 'client' || x.k === 'supplier' ? `${x.k}:${x.who}` : x.k}`;
  });
  return out.length ? out : null;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (d?: string) => (d ? `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}${d.slice(0, 4) === String(new Date().getFullYear()) ? '' : ` ${d.slice(2, 4)}`}` : '');
const span = (v: View) => `${short(v.from)} – ${short(v.to)}`;
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const between = (d: string | null | undefined, v: View) => !!d && !!v.from && !!v.to && d.slice(0, 10) >= v.from && d.slice(0, 10) <= v.to;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The tile's words: its name, with what it's showing when that isn't the standard. */
const SHORT: Record<string, string> = { live: 'Live Jobs', upcoming: 'Upcoming', closed: 'Closed', all: 'All Jobs', d30: 'Next 30 Days', d60: 'Next 60 Days', o30: '30+ Days', o60: '60+ Days', o90: '90+ Days', late: 'Past Due' };
export function tileLabel(t: TileKey, v: View): string {
  if (t === 'live_value' && ['live', 'upcoming', 'closed', 'all'].includes(v.k)) return `${{ live: 'Live', upcoming: 'Upcoming', closed: 'Closed', all: 'Total' }[v.k as 'live']} Contract Value`;
  const base = { live_value: 'Contract Value', to_invoice: 'Still To Invoice', owed: 'Owed To You', overdue: 'Overdue', due_out: 'Due Out To Suppliers', ret_held: 'Retention Held By Clients' }[t];
  if (v.k === std(t).k) return base;
  const what = v.k === 'dates' ? `${t === 'live_value' || t === 'to_invoice' ? 'Started' : 'Due'} ${span(v)}` : v.k === 'client' || v.k === 'supplier' ? String(v.who) : (SHORT[v.k] ?? v.k);
  return `${base} · ${what}`;
}

// ---- the figures, from plain rows the page builds ----
export type JobRow = { id: string; status: string; start: string | null; client: string | null; value: number; invoiced: number; ret: number };
export type InvRow = { out: number; due: string | null; overdue: boolean; client: string | null };
export type PinvRow = { total: number; approved: boolean; due: string | null; supplier: string | null };
export type Figure = { v: number; note: string };

const pickJobs = (jobs: readonly JobRow[], v: View) => jobs.filter((j) => (v.k === 'all' ? true : v.k === 'dates' ? between(j.start, v) : v.k === 'client' ? (j.client || '') === v.who : j.status === v.k));
const jobsNote = (n: number, v: View) => plural(n, `${v.k === 'live' ? 'Live ' : v.k === 'upcoming' ? 'Upcoming ' : v.k === 'closed' ? 'Closed ' : ''}Job`);

/** Contract value of the jobs in view. */
export function contractFigure(jobs: readonly JobRow[], v: View): Figure {
  const js = pickJobs(jobs, v);
  return { v: r2(js.reduce((t, j) => t + j.value, 0)), note: jobsNote(js.length, v) };
}
/** Still to invoice on the jobs in view: each job's contract value less what's been invoiced, never below nothing. */
export function toInvoiceFigure(jobs: readonly JobRow[], v: View): Figure {
  const js = pickJobs(jobs, v);
  return { v: r2(js.reduce((t, j) => t + Math.max(0, j.value - j.invoiced), 0)), note: jobsNote(js.length, v) };
}
/** Owed to you (outstanding on sales invoices, excl. VAT): all, or due within 30 / 60 days from today (not the overdue
 *  ones: they're on Overdue), or due between two dates, or one client's. */
export function owedFigure(invs: readonly InvRow[], v: View, now: string): Figure {
  const on = invs.filter((i) => i.out > 0).filter((i) => (v.k === 'd30' || v.k === 'd60' ? !!i.due && i.due >= now && i.due <= addDays(now, v.k === 'd30' ? 30 : 60) : v.k === 'dates' ? between(i.due, v) : v.k === 'client' ? (i.client || '') === v.who : true));
  return { v: r2(on.reduce((t, i) => t + i.out, 0)), note: plural(on.length, 'Invoice') };
}
/** Overdue (excl. VAT): all, or more than 30 / 60 / 90 days past due, or one client's. */
export function overdueFigure(invs: readonly InvRow[], v: View, now: string): Figure {
  const days = v.k === 'o30' ? 30 : v.k === 'o60' ? 60 : v.k === 'o90' ? 90 : 0;
  const on = invs.filter((i) => i.overdue && i.out > 0).filter((i) => (days ? !!i.due && i.due < addDays(now, -days) : v.k === 'client' ? (i.client || '') === v.who : true));
  return { v: r2(on.reduce((t, i) => t + i.out, 0)), note: plural(on.length, 'Invoice') };
}
/** Due out to suppliers (Andy, 17 Nov 2026: "needs to include the money to check but note x amount requires approval"):
 *  every supplier invoice not paid yet, approved or not, incl. VAT; the note says how much of it still needs approval. */
export function dueOutFigure(pinvs: readonly PinvRow[], v: View, now: string): Figure {
  const on = pinvs.filter((i) => (v.k === 'd30' || v.k === 'd60' ? !!i.due && i.due >= now && i.due <= addDays(now, v.k === 'd30' ? 30 : 60) : v.k === 'late' ? !!i.due && i.due < now : v.k === 'dates' ? between(i.due, v) : v.k === 'supplier' ? (i.supplier || '') === v.who : true));
  const needs = r2(on.filter((i) => !i.approved).reduce((t, i) => t + i.total, 0));
  return { v: r2(on.reduce((t, i) => t + i.total, 0)), note: needs ? `£${Math.round(needs).toLocaleString('en-GB')} Needs Approval` : plural(on.length, 'Invoice') };
}
/** Retention held by clients on the jobs in view. */
export function retentionFigure(jobs: readonly JobRow[], v: View): Figure {
  const js = jobs.filter((j) => j.ret > 0).filter((j) => (v.k === 'live' || v.k === 'closed' ? j.status === v.k : v.k === 'client' ? (j.client || '') === v.who : true));
  return { v: r2(js.reduce((t, j) => t + j.ret, 0)), note: plural(js.length, 'Job') };
}

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

type Pinv = { id: string; status: string; total?: number | null; paid_on?: string | null; sub_job_id?: string | null; due_date?: string | null; supplier_name?: string | null };
/** The supplier invoices still to pay (materials, plant, scaffold, skips: not subcontractors or labour, whose invoices
 *  are kept elsewhere; a subcontract order's invoice is left out too): approved, or still being checked or queried, and
 *  not paid by hand or on a statement. */
export function unpaidSupplierInvoices(pinvs: readonly Pinv[], paidIds: Record<string, string>): PinvRow[] {
  return pinvs.filter((i) => !i.sub_job_id && !i.paid_on && !paidIds[i.id] && ['approved', 'to_approve', 'query'].includes(i.status))
    .map((i) => ({ total: Number(i.total || 0), approved: i.status === 'approved', due: i.due_date || null, supplier: i.supplier_name || null }));
}
