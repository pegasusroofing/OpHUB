// The Finance "book" engine (911 finCostLinesFromBook / finJobForecast, 917
// finAllocs, 9219zl OHP, 9219zv invoice jobs): every cost line on a project —
// purchase invoices, open POs, operative invoices (and the materials on them),
// PAYE sign-in days, timesheets, plant hire, other costs, subcontractor
// certificates and open subcontract orders — then the budget / forecast /
// margin figures. Pure: the book is loaded elsewhere.
import { invOutstandingNet, retentionStillHeld, round2, type FinApp, type FinInv } from './finance.ts';

export const COST_CATS: Record<string, string> = { materials: 'Materials', labour: 'Labour', plant: 'Plant', subcontract: 'Subcontract', overheads: 'Prelims & site costs', other: 'Other' };
export const PI_STATUS: Record<string, string> = { to_approve: 'To approve', approved: 'Approved', query: 'Query', rejected: 'Rejected' };
type Row = Record<string, any>;
export type Book = {
  siteId: string | null; jf: Row[]; invs: FinInv[]; apps: (FinApp & Row)[]; pinvs: Row[]; pos: Row[]; cks: Row[]; manual: Row[]; hires: Row[]; extra: Row[];
  budgets: Row[]; vars: Row[]; scs: Row[]; sapps: Row[]; rates: Record<string, Row>; cpos: Row[]; items: Row[]; ops: Row[]; names: Record<string, string>;
};
export type CostLine = { key: string; date: string | null; cat: string; ccat?: string; desc: string; who: string; ref: string; status: string; waiting?: boolean; net: number; sub: string | null; share: number; days?: number; person?: string; go?: string };
const by = <T extends Row>(arr: T[] | undefined, siteId: string) => (arr || []).filter((x) => x.site_id === siteId);
const fdate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const isoDay = (ts: string) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const poInvoiced = (po: Row, pinvs: Row[]) => round2(pinvs.filter((i) => i.po_id === po.id && i.status !== 'rejected').reduce((t, i) => t + Number(i.net || 0), 0));
export const billingType = (jf: Row | null | undefined, itemsCount: number, appsCount: number): string | null => (jf?.billing_type ? jf.billing_type : itemsCount || appsCount ? 'application' : null);
export const personKey = (r: Row) => r.user_id || (r.worker_id ? `w:${r.worker_id}` : `n:${r.name || ''}`);

/** Where a row's cost goes: split rows by their split, PO invoices follow the PO, multi-plot POs by item value. */
export function allocs(row: Row, ctx: { poBy: Record<string, Row> }): { site_id: string; sub: string | null; share: number; cat?: string | null }[] {
  if (Array.isArray(row.split) && row.split.length) return row.split.map((e: Row) => ({ site_id: e.site_id, sub: e.sub_job_id || null, share: Number(e.pct || 0) / 100, cat: e.cost_code || null }));
  if (row.po_id && !row.sub_job_id && ctx.poBy[row.po_id]) {
    const a = allocs(ctx.poBy[row.po_id], ctx);
    if (a.some((x) => x.sub) || a.some((x) => x.site_id !== row.site_id)) return a;
  }
  if (Array.isArray(row.items) && !row.sub_job_id) {
    const its = row.items.filter(Boolean) as Row[];
    const subs = new Set(its.map((i) => i.sub_job_id || ''));
    if (subs.size > 1) {
      const priced = its.every((i) => i.amount != null && Number(i.amount) > 0);
      const w = (i: Row) => (priced ? Number(i.amount) : 1);
      const tot = its.reduce((t, i) => t + w(i), 0) || 1;
      const sh: Record<string, number> = {}; its.forEach((i) => { const k = i.sub_job_id || ''; sh[k] = (sh[k] || 0) + w(i) / tot; });
      return Object.keys(sh).map((k) => ({ site_id: row.site_id, sub: k || null, share: sh[k] }));
    }
    if (subs.size === 1 && its[0]?.sub_job_id) return [{ site_id: row.site_id, sub: its[0].sub_job_id, share: 1 }];
  }
  return [{ site_id: row.site_id, sub: row.sub_job_id || null, share: 1 }];
}
/** One working day per person per project per date, from sign-ins. */
export function labourDays(cks: Row[]) {
  const seen = new Set<string>(), out: { user_id: string; site_id: string; date: string }[] = [];
  cks.forEach((c) => { if (c.type && c.type !== 'in') return; const d = isoDay(c.ts), k = `${c.user_id}|${c.site_id}|${d}`; if (seen.has(k)) return; seen.add(k); out.push({ user_id: c.user_id, site_id: c.site_id, date: d }); });
  return out;
}

export function costLines(b: Book, siteId: string): CostLine[] {
  const poBy: Record<string, Row> = {}; (b.pos || []).forEach((p) => { poBy[p.id] = p; });
  const ctx = { poBy }, lines: CostLine[] = [];
  const each = (rows: Row[] | undefined, fn: (r: Row, a: ReturnType<typeof allocs>[number]) => void) => (rows || []).forEach((r) => allocs(r, ctx).forEach((a) => { if (a.site_id === siteId) fn(r, a); }));
  const tag = (a: { share: number }) => (a.share < 0.9999 ? ` (${round2(a.share * 100)}% share)` : '');
  const name = (id: string) => b.names[id] || 'Unknown';
  each(b.pinvs, (i, a) => {
    const cat = a.cat && COST_CATS[a.cat] ? a.cat : COST_CATS[i.cost_code] ? i.cost_code : 'materials';
    lines.push({ key: `pi:${i.id}:${a.sub || ''}${a.cat ? `:${a.cat}` : ''}`, date: i.invoice_date, cat, desc: (i.description || (i.kind === 'receipt' ? 'Receipt' : 'Purchase invoice')) + tag(a), who: i.supplier_name || '', ref: [i.invoice_no, poBy[i.po_id]?.number].filter(Boolean).join(' · '), status: PI_STATUS[i.status] || i.status, waiting: i.status !== 'approved', net: round2(Number(i.net || 0) * a.share), sub: a.sub, share: a.share, go: `/fin/pinv/${i.id}` });
  });
  each((b.pos || []).filter((p) => p.status === 'open' && p.value != null), (p, a) => {
    const left = round2(Number(p.value) - poInvoiced(p, b.pinvs || []));
    if (left <= 0) return;
    const byCode: Record<string, number> = {}; let codedTot = 0;
    (p.items || []).forEach((it: Row) => { const c = COST_CATS[it.cost_code] ? it.cost_code : 'materials'; const amt = Number(it.amount || 0); if (amt > 0) { byCode[c] = (byCode[c] || 0) + amt; codedTot += amt; } });
    const codes = codedTot ? Object.keys(byCode) : ['materials'];
    codes.forEach((c) => {
      const part = codedTot ? byCode[c] / codedTot : 1;
      lines.push({ key: `po:${p.id}:${a.sub || ''}:${c}`, date: String(p.created_at || '').slice(0, 10), cat: 'committed', ccat: c, desc: `Ordered, not invoiced yet${tag(a)}${codes.length > 1 ? ` — ${COST_CATS[c]}` : ''}`, who: p.supplier_name || '', ref: p.number, status: 'Committed', net: round2(left * a.share * part), sub: a.sub, share: a.share, go: `/fin/po/${p.id}` });
    });
  });
  const dayCks = by(b.cks, siteId), daySubs: Record<string, Set<string>> = {};
  dayCks.forEach((c) => { if (c.type && c.type !== 'in') return; const k = `${c.user_id}|${isoDay(c.ts)}`; (daySubs[k] = daySubs[k] || new Set()).add(c.sub_site_id || ''); });
  (b.ops || []).forEach((p) => (p.lines || []).forEach((l: Row, li: number) => {
    if (l.site_id !== siteId) return;
    lines.push({ key: `op:${p.id}:${li}`, date: p.period_start, cat: 'labour', desc: (l.description || 'Operative invoice') + (p.invoice_no ? ` · inv ${p.invoice_no}` : ''), who: p.name || '', ref: `w/c ${fdate(p.period_start)}`, status: p.status === 'paid' ? 'Paid' : 'To pay', net: round2(Number(l.amount || 0)), person: p.worker_id ? `w:${p.worker_id}` : p.user_id, sub: l.sub_job_id || null, share: 1, go: `/fin/labour/${p.id}` });
  }));
  // Materials an operative supplied go to the jobs on that invoice, shared by labour value.
  (b.ops || []).forEach((p) => {
    const mat = Number(p.materials || 0); if (!(mat > 0)) return;
    const ls = (p.lines || []).filter((l: Row) => l && l.site_id) as Row[];
    const lab = ls.reduce((t, l) => t + Math.max(0, Number(l.amount || 0)), 0);
    ls.forEach((l, li) => {
      if (l.site_id !== siteId) return;
      const share = lab > 0 ? Math.max(0, Number(l.amount || 0)) / lab : 1 / ls.length;
      if (!(share > 0)) return;
      lines.push({ key: `opm:${p.id}:${li}`, date: p.period_start, cat: 'materials', desc: `Materials supplied by operative${p.invoice_no ? ` · inv ${p.invoice_no}` : ''}${share < 0.9999 ? ` (${round2(share * 100)}% share)` : ''}`, who: p.name || '', ref: `w/c ${fdate(p.period_start)}`, status: p.status === 'paid' ? 'Paid' : 'To pay', net: round2(mat * share), sub: l.sub_job_id || null, share, go: `/fin/labour/${p.id}` });
    });
  });
  // Sign-in days only cost PAYE staff (their day rate), split over the plots signed into that day.
  labourDays(dayCks).forEach((d) => {
    const r = b.rates[d.user_id];
    if (!r || r.pay_type !== 'paye') return;
    const subs = Array.from(daySubs[`${d.user_id}|${d.date}`] || ['']);
    subs.forEach((sb) => {
      const share = 1 / subs.length;
      lines.push({ key: `ck:${d.user_id}${d.date}${sb}`, date: d.date, cat: 'labour', desc: `Day on site (sign-in)${subs.length > 1 ? ` (${round2(share * 100)}% share)` : ''}`, who: name(d.user_id), ref: '', status: r.day_rate != null ? '' : 'No day rate', waiting: r.day_rate == null, net: r.day_rate != null ? round2(Number(r.day_rate) * share) : 0, days: share, person: d.user_id, sub: sb || null, share });
    });
  });
  by(b.manual, siteId).forEach((m) => {
    lines.push({ key: `ml:${m.id}`, date: m.work_date, cat: 'labour', desc: m.description || 'Timesheet', who: m.name || name(personKey(m)), ref: m.days ? `${m.days} day${Number(m.days) === 1 ? '' : 's'}` : '', status: '', net: Number(m.amount || 0), days: Number(m.days || 0), person: personKey(m), sub: m.sub_job_id || null, share: 1 });
  });
  each((b.hires || []).filter((h) => h.cost_from !== 'invoices'), (h, a) => {
    const end = h.off_hire || isoDay(new Date().toISOString());
    const days = Math.max(1, Math.round((new Date(`${end}T12:00:00`).getTime() - new Date(`${h.on_hire}T12:00:00`).getTime()) / 864e5) + 1);
    const cost = round2(h.rate_period === 'day' ? days * Number(h.rate || 0) : (days / 7) * Number(h.rate || 0)), weeks = Math.round((days / 7) * 10) / 10;
    lines.push({ key: `ph:${h.id}:${a.sub || ''}`, date: h.on_hire, cat: 'plant', desc: `${h.item} (${h.off_hire ? `${fdate(h.on_hire)} – ${fdate(h.off_hire)}` : `on hire ${weeks} wk`})${tag(a)}`, who: h.supplier_name || '', ref: h.hire_ref || '', status: h.off_hire ? 'Off hire' : 'On hire', net: round2(cost * a.share), sub: a.sub, share: a.share, go: `/fin/plant/${h.id}` });
  });
  each(b.extra, (x, a) => {
    lines.push({ key: `jc:${x.id}:${a.sub || ''}`, date: x.cost_date, cat: COST_CATS[x.category] ? x.category : 'other', desc: x.description + tag(a), who: x.supplier || '', ref: x.ref || '', status: '', net: round2(Number(x.net || 0) * a.share), sub: a.sub, share: a.share });
  });
  by(b.scs, siteId).forEach((sc) => {
    let prevG = 0, prevC = 0, certG = 0;
    (b.sapps || []).filter((a) => a.subcontract_id === sc.id && a.certified_gross != null).sort((x, y) => x.number - y.number).forEach((a) => {
      const g = Number(a.certified_gross || 0), c = Number(a.contra || 0);
      lines.push({ key: `sa:${a.id}`, date: a.app_date, cat: 'subcontract', desc: `${sc.number} application ${a.number}`, who: sc.name, ref: sc.description || '', status: a.status === 'paid' ? 'Paid' : 'Certified', net: round2(g - prevG - (c - prevC)), sub: sc.sub_job_id || null, share: 1, go: `/fin/sub/${sc.id}` });
      prevG = g; prevC = c; certG = g;
    });
    if (sc.order_value != null && sc.status !== 'complete') {
      const left = round2(Number(sc.order_value) - certG);
      if (left > 0) lines.push({ key: `sc:${sc.id}`, date: String(sc.created_at || '').slice(0, 10), cat: 'committed', ccat: 'subcontract', desc: 'Subcontractor PO not yet certified', who: sc.name, ref: sc.number, status: 'Committed', net: left, sub: sc.sub_job_id || null, share: 1, go: `/fin/sub/${sc.id}` });
    }
  });
  return lines;
}

export const ohpPct = (jf: Row | null | undefined, settings: Row | null | undefined) => {
  const j = jf?.ohp_pct; if (j != null && j !== '' && !isNaN(j)) return Number(j);
  const s = settings?.ohp_pct; return s != null && s !== '' && !isNaN(s) ? Number(s) : 0;
};

/** Value and cost forecast for one job (with company overheads and invoice-job adjustments). */
export function forecast(b: Book, siteId: string, settings: Row | null) {
  const lines = costLines(b, siteId);
  const cats = Object.keys(COST_CATS);
  const actual: Record<string, number> = {}, committed: Record<string, number> = {}, budget: Record<string, number | null> = {}, toComplete: Record<string, number> = {}, tcSet: Record<string, boolean> = {}, fcast: Record<string, number> = {};
  cats.forEach((k) => { actual[k] = 0; committed[k] = 0; budget[k] = null; toComplete[k] = 0; tcSet[k] = false; });
  lines.forEach((l) => { if (l.cat === 'committed') committed[l.ccat || 'materials'] += l.net; else actual[l.cat] = (actual[l.cat] || 0) + l.net; });
  by(b.budgets, siteId).forEach((r) => { if (r.category in budget) { budget[r.category] = r.budget != null ? Number(r.budget) : null; if (r.to_complete != null) { toComplete[r.category] = Number(r.to_complete); tcSet[r.category] = true; } } });
  cats.forEach((k) => {
    actual[k] = round2(actual[k]); committed[k] = round2(committed[k]);
    if (!tcSet[k]) toComplete[k] = budget[k] != null ? Math.max(0, round2((budget[k] as number) - actual[k] - committed[k])) : 0;
    fcast[k] = round2(actual[k] + committed[k] + toComplete[k]);
  });
  const sum = (o: Record<string, number | null>) => round2(cats.reduce((t, k) => t + (Number(o[k]) || 0), 0));
  const jf = by(b.jf, siteId)[0] || {};
  const vars = by(b.vars, siteId);
  const vAgreed = round2(vars.filter((v) => v.status === 'agreed').reduce((t, v) => t + Number(v.agreed_value != null ? v.agreed_value : v.quoted || 0), 0));
  const vPending = round2(vars.filter((v) => ['priced', 'submitted'].includes(v.status)).reduce((t, v) => t + Number(v.quoted || 0), 0));
  const vInstructed = round2(vars.filter((v) => v.status === 'instructed').reduce((t, v) => t + Number(v.quoted != null ? v.quoted : v.cost_estimate || 0), 0));
  const contract = Number(jf.contract_value || 0);
  let ffa = round2(contract + vAgreed + vPending);
  const apps = by(b.apps, siteId).filter((a) => a.status !== 'void');
  const lastApp = apps.filter((a) => a.status !== 'draft').sort((x, y) => y.number - x.number)[0];
  const valuation = lastApp ? Number(lastApp.cert_gross != null ? lastApp.cert_gross : lastApp.gross || 0) : 0;
  const certified = lastApp && lastApp.cert_gross != null ? Number(lastApp.cert_gross) : 0;
  const invs = by(b.invs as Row[], siteId).filter((i) => i.status !== 'void') as FinInv[];
  const invoiced = round2(invs.reduce((t, i) => t + Number(i.net || 0), 0));
  const owed = round2(invs.reduce((t, i) => t + invOutstandingNet(i), 0));
  const costToDate = sum(actual), committedTotal = sum(committed);
  let forecastCost = sum(fcast);
  const schedItems = by(b.items, siteId).filter((i) => !i.kind || i.kind === 'item');
  const schedCosted = schedItems.filter((i) => i.cost != null);
  const schedCost = round2(schedCosted.reduce((t, i) => t + Number(i.cost || 0), 0));
  const varCost = round2(vars.filter((v) => ['agreed', 'priced', 'submitted'].includes(v.status)).reduce((t, v) => t + Number(v.cost_estimate || 0), 0));
  const catBudget = cats.some((k) => budget[k] != null);
  let budgetTotal: number | null = catBudget ? sum(budget) : null, budgetSource: string | null = catBudget ? 'categories' : null, toCompleteSched = 0;
  if (!catBudget && schedCosted.length) {
    budgetTotal = round2(schedCost + varCost); budgetSource = 'schedule';
    const typedTc = round2(cats.reduce((t, k) => t + (tcSet[k] ? Number(toComplete[k] || 0) : 0), 0));
    toCompleteSched = Math.max(0, round2(budgetTotal - costToDate - committedTotal - typedTc));
    forecastCost = round2(forecastCost + toCompleteSched);
  }
  const isInvoiceJob = billingType(jf, schedItems.length, apps.length) === 'invoice';
  const sales = isInvoiceJob ? invoiced : valuation;
  const ov = jf.original_value != null ? Number(jf.original_value) : null, oc = jf.original_cost != null ? Number(jf.original_cost) : null;
  const retHeld = retentionStillHeld(apps, jf, invs);
  const p = ohpPct(jf, settings);
  // Invoice jobs: once invoiced passes contract + variations, invoiced is the expected final value.
  let ffaFromInvoiced = false;
  if (billingType(jf, schedItems.length, valuation ? 1 : 0) === 'invoice' && invoiced > ffa) { ffa = round2(invoiced); ffaFromInvoiced = true; }
  const ohpToDate = round2((sales * p) / 100), ohpOnValuation = round2((valuation * p) / 100), ohpForecast = round2((ffa * p) / 100);
  const salesMargin = round2(sales - costToDate - ohpToDate), marginToDate = round2(valuation - costToDate - ohpOnValuation), forecastMargin = round2(ffa - forecastCost - ohpForecast);
  return {
    lines, cats, actual, committed, budget, toComplete, tcSet, forecast: fcast, jf, contract, vAgreed, vPending, vInstructed, ffa, ffaFromInvoiced,
    valuation, certified, invoiced, owed, retHeld, applied: lastApp ? Number(lastApp.gross || 0) : 0, costToDate, committedTotal, forecastCost,
    budgetTotal, budgetSource, schedCost, schedCostedN: schedCosted.length, schedItemsN: schedItems.length, varCost, toCompleteSched, sales, isInvoiceJob,
    ohpPct: p, ohpToDate, ohpForecast, grossProfitToDate: round2(sales - costToDate),
    salesMargin, salesMarginPct: sales ? round2((salesMargin / sales) * 100) : null, profitToDate: salesMargin, profitToDatePct: sales ? round2((salesMargin / sales) * 100) : null,
    origValue: ov, origCost: oc, origMargin: ov != null && oc != null ? round2(ov - oc) : null, origMarginPct: ov && oc != null ? round2(((ov - oc) / ov) * 100) : null,
    marginToDate, marginToDatePct: valuation ? round2((marginToDate / valuation) * 100) : null,
    forecastMargin, forecastMarginPct: ffa ? round2((forecastMargin / ffa) * 100) : null,
  };
}
export type Forecast = ReturnType<typeof forecast>;
export const pctTxt = (p: number | null | undefined) => (p == null ? '—' : `${Math.round(p * 10) / 10}%`);
/** What "profit to date" is measured on: certified, else applied, else invoiced. */
export type MarginBasis = 'auto' | 'applied' | 'certified' | 'invoiced';
export function marginOn(fc: Forecast, basis: MarginBasis = 'auto') {
  if (basis === 'applied') return { value: fc.applied || 0, label: 'applied', basis };
  if (basis === 'certified') return { value: fc.certified || 0, label: 'certified', basis };
  if (basis === 'invoiced') return { value: fc.invoiced || 0, label: 'invoiced', basis };
  if (fc.certified) return { value: fc.certified, label: 'certified', basis };
  if (fc.applied) return { value: fc.applied, label: 'applied', basis };
  return { value: fc.invoiced || 0, label: 'invoiced', basis };
}
