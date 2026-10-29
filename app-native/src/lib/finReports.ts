// Finance reports (913): each is {id, group, title, desc, filters, run(ctx, f)}
// returning {cols, rows, totals, note}. All read from the company "book" and
// the same forecast as the project pages.
import { COST_CATS, costLines, forecast, isoDay, poInvoiced, type Book } from '@/lib/rules/finBook';
import { addDays, invOutstanding, invOutstandingNet, money, retentionDates, retentionStillHeld, round2, today, type FinInv } from '@/lib/rules/finance';

type Row = Record<string, any>;
export type Col = { k: string; l: string; money?: boolean; num?: boolean; pct?: boolean; date?: boolean };
export type Result = { cols: Col[]; rows: Row[]; totals?: boolean | string[]; note?: string };
export type Filters = { job: string; from: string; to: string; status: string; opening: string; varstatus: string; postatus: string };
export type Ctx = { b: Book; settings: Row; sites: Row[]; status: (s: Row) => string; cisPays: Row[] };
export const REPORT_GROUPS: Record<string, string> = { qs: 'Commercial / QS', money: 'Money in & out', tax: 'Labour, CIS & VAT' };
const VAR_ST: Record<string, string> = { instructed: 'Instructed', priced: 'Priced', submitted: 'Submitted', agreed: 'Agreed', rejected: 'Rejected' };
const PO_ST: Record<string, string> = { open: 'Open', invoiced: 'Invoiced', cancelled: 'Cancelled' };
const by = <T extends Row>(arr: T[] | undefined, id: string) => (arr || []).filter((x) => x.site_id === id);
const job = (s: Row | undefined) => (s ? `${s.job_number ? `${s.job_number} · ` : ''}${s.name || ''}` : '');
const days = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 864e5);
const inR = (d: unknown, f: Filters) => !!d && (!f.from || String(d) >= f.from) && (!f.to || String(d) <= f.to);
const noDates = (f: Filters) => !f.from && !f.to;
const mondayOf = (d: string) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return isoDay(x.toISOString()); };
function sitesFor(c: Ctx, f: Filters, allStatus = false) {
  return c.sites.filter((s) => (!f.job || s.id === f.job) && (allStatus || f.status === 'all' || !f.status || c.status(s) === f.status)).sort((a, b) => String(a.job_number || '').localeCompare(String(b.job_number || ''), undefined, { numeric: true }));
}
const site = (c: Ctx, id: string) => c.sites.find((s) => s.id === id);

export const REPORTS: { id: string; group: string; title: string; desc: string; filters: string[]; run: (c: Ctx, f: Filters) => Result }[] = [
  { id: 'overview', group: 'qs', title: 'Company overview', desc: 'Every project: contract, final account, invoiced, owed, costs, forecast margin.', filters: ['status', 'job'], run: (c, f) => ({
    cols: [{ k: 'job', l: 'Project' }, { k: 'client', l: 'Client' }, { k: 'contract', l: 'Contract', money: true }, { k: 'vars', l: 'Variations agreed', money: true }, { k: 'ffa', l: 'Forecast final account', money: true }, { k: 'invoiced', l: 'Invoiced', money: true }, { k: 'owed', l: 'Owed', money: true }, { k: 'cost', l: 'Costs to date', money: true }, { k: 'committed', l: 'Ordered, not invoiced', money: true }, { k: 'fcost', l: 'Expected final cost', money: true }, { k: 'ohp', l: 'Company overheads', money: true }, { k: 'margin', l: 'Expected profit (after overheads)', money: true }, { k: 'pct', l: 'Profit %', pct: true }, { k: 'ret', l: 'Retention held', money: true }],
    rows: sitesFor(c, f).map((s) => { const fc = forecast(c.b, s.id, c.settings); const nb = fc.budgetTotal == null; return { job: job(s), client: s.client_name || '', contract: fc.contract, vars: fc.vAgreed, ffa: fc.ffa, invoiced: fc.invoiced, owed: fc.owed, cost: fc.costToDate, committed: fc.committedTotal, fcost: nb ? null : fc.forecastCost, ohp: round2((fc.ffa * fc.ohpPct) / 100), margin: nb ? null : fc.forecastMargin, pct: nb ? null : fc.forecastMarginPct, ret: fc.retHeld, _go: `/fin/job/${s.id}` }; }), totals: true }) },
  { id: 'cvr', group: 'qs', title: 'Cost value reconciliation (CVR)', desc: 'Value to date against cost to date, and the forecast at completion, project by project.', filters: ['status', 'job'], run: (c, f) => ({
    cols: [{ k: 'job', l: 'Project' }, { k: 'value', l: 'Value to date', money: true }, { k: 'cost', l: 'Cost to date', money: true }, { k: 'ohp', l: 'Overheads to date', money: true }, { k: 'margin', l: 'Margin to date (after overheads)', money: true }, { k: 'mpct', l: '%', pct: true }, { k: 'committed', l: 'Committed', money: true }, { k: 'ffa', l: 'Forecast final account', money: true }, { k: 'fcost', l: 'Forecast final cost', money: true }, { k: 'fmargin', l: 'Forecast margin', money: true }, { k: 'fpct', l: '%', pct: true }],
    rows: sitesFor(c, f).map((s) => { const fc = forecast(c.b, s.id, c.settings); return { job: job(s), value: fc.sales, cost: fc.costToDate, ohp: fc.ohpToDate, margin: fc.salesMargin, mpct: fc.salesMarginPct, committed: fc.committedTotal, ffa: fc.ffa, fcost: fc.forecastCost, fmargin: fc.forecastMargin, fpct: fc.forecastMarginPct, _go: `/fin/job/${s.id}/budget` }; }), totals: true,
    note: 'Value to date is the latest certified (or applied) gross valuation. Cost to date excludes committed orders. Margins are after company overheads (OHP), set in Finance › Settings.' }) },
  { id: 'ffa', group: 'qs', title: 'Forecast final account', desc: 'Contract sum plus variations agreed, submitted and instructed, by project.', filters: ['status', 'job'], run: (c, f) => ({
    cols: [{ k: 'job', l: 'Project' }, { k: 'contract', l: 'Contract sum', money: true }, { k: 'agreed', l: 'Variations agreed', money: true }, { k: 'pending', l: 'Submitted, not agreed', money: true }, { k: 'ffa', l: 'Forecast final account', money: true }, { k: 'instructed', l: 'Instructed, not priced (est.)', money: true }, { k: 'certified', l: 'Certified to date', money: true }],
    rows: sitesFor(c, f).map((s) => { const fc = forecast(c.b, s.id, c.settings); return { job: job(s), contract: fc.contract, agreed: fc.vAgreed, pending: fc.vPending, ffa: fc.ffa, instructed: fc.vInstructed, certified: fc.certified, _go: `/fin/job/${s.id}/variations` }; }), totals: true }) },
  { id: 'budget', group: 'qs', title: 'Budget vs actual', desc: 'Budget, spent, committed and forecast by heading, for one project or all.', filters: ['status', 'job'], run: (c, f) => {
    const rows: Row[] = [];
    sitesFor(c, f).forEach((s) => { const fc = forecast(c.b, s.id, c.settings); fc.cats.forEach((k) => { if (!fc.actual[k] && !fc.committed[k] && fc.budget[k] == null) return; rows.push({ job: job(s), head: COST_CATS[k], budget: fc.budget[k], spent: fc.actual[k], committed: fc.committed[k], tc: fc.toComplete[k], forecast: fc.forecast[k], variance: fc.budget[k] != null ? round2((fc.budget[k] as number) - fc.forecast[k]) : null, _go: `/fin/job/${s.id}/budget` }); }); });
    return { cols: [{ k: 'job', l: 'Project' }, { k: 'head', l: 'Heading' }, { k: 'budget', l: 'Budget', money: true }, { k: 'spent', l: 'Spent', money: true }, { k: 'committed', l: 'Committed', money: true }, { k: 'tc', l: 'To complete', money: true }, { k: 'forecast', l: 'Forecast final', money: true }, { k: 'variance', l: 'Under (+) / over (−)', money: true }], rows, totals: true };
  } },
  { id: 'costs', group: 'qs', title: 'Costs by project and type', desc: 'Materials, labour, plant, subcontract, prelims and other costs per project.', filters: ['status', 'job', 'dates'], run: (c, f) => {
    const keys = Object.keys(COST_CATS);
    const rows = sitesFor(c, f).map((s) => { const r: Row = { job: job(s), _go: `/fin/job/${s.id}/costs` }; keys.forEach((k) => { r[k] = 0; }); costLines(c.b, s.id).forEach((l) => { if (l.cat !== 'committed' && (noDates(f) || inR(l.date, f))) r[l.cat] += l.net; }); keys.forEach((k) => { r[k] = round2(r[k]); }); r.total = round2(keys.reduce((t, k) => t + r[k], 0)); return r; }).filter((r) => r.total);
    return { cols: [{ k: 'job', l: 'Project' }, ...keys.map((k) => ({ k, l: COST_CATS[k], money: true })), { k: 'total', l: 'Total', money: true }], rows, totals: true };
  } },
  { id: 'variations', group: 'qs', title: 'Variations register', desc: 'Every variation on every project with its status and values.', filters: ['status', 'job', 'varstatus'], run: (c, f) => {
    const ids = new Set(sitesFor(c, f).map((s) => s.id));
    return { cols: [{ k: 'job', l: 'Project' }, { k: 'no', l: 'No.' }, { k: 'title', l: 'Variation' }, { k: 'on', l: 'Instructed', date: true }, { k: 'status', l: 'Status' }, { k: 'cost', l: 'Our cost', money: true }, { k: 'quoted', l: 'Quoted', money: true }, { k: 'agreed', l: 'Agreed', money: true }],
      rows: (c.b.vars || []).filter((v) => ids.has(v.site_id) && (!f.varstatus || v.status === f.varstatus)).map((v) => ({ job: job(site(c, v.site_id)), no: v.number, title: v.title, on: v.instructed_on, status: VAR_ST[v.status] || v.status, cost: v.cost_estimate != null ? Number(v.cost_estimate) : null, quoted: v.quoted != null ? Number(v.quoted) : null, agreed: v.agreed_value != null ? Number(v.agreed_value) : null, _go: `/fin/job/${v.site_id}/variations` })), totals: true };
  } },
  { id: 'apps', group: 'qs', title: 'Applications & Certificates', desc: 'Applied, certified, shortfall and invoice for every application.', filters: ['status', 'job', 'dates'], run: (c, f) => {
    const ids = new Set(sitesFor(c, f).map((s) => s.id)), invBy: Record<string, FinInv> = {}; (c.b.invs || []).forEach((i) => { invBy[i.id] = i; });
    const rows = (c.b.apps as Row[]).filter((a) => ids.has(a.site_id) && a.status !== 'void' && (noDates(f) || inR(a.valuation_date, f))).sort((x, y) => String(y.valuation_date).localeCompare(String(x.valuation_date))).map((a) => {
      const inv = invBy[a.invoice_id];
      return { job: job(site(c, a.site_id)), no: a.number, date: a.valuation_date, status: a.status, applied: Number(a.net_due || 0), certified: a.cert_net != null ? Number(a.cert_net) : null, short: a.cert_net != null ? round2(Number(a.net_due || 0) - Number(a.cert_net)) : null, invoice: inv ? inv.number : '', paid: inv ? (invOutstanding(inv) > 0 ? `Owed ${money(invOutstanding(inv))}` : 'Paid') : '', _go: `/fin/job/${a.site_id}/application/${a.id}` };
    });
    return { cols: [{ k: 'job', l: 'Project' }, { k: 'no', l: 'App', num: true }, { k: 'date', l: 'Valuation', date: true }, { k: 'status', l: 'Status' }, { k: 'applied', l: 'Applied (net)', money: true }, { k: 'certified', l: 'Certified (net)', money: true }, { k: 'short', l: 'Shortfall', money: true }, { k: 'invoice', l: 'Invoice' }, { k: 'paid', l: 'Payment' }], rows, totals: true };
  } },
  { id: 'retention', group: 'qs', title: 'Retention ledger', desc: 'Retention held by your clients, release dates, and retention you hold on subcontractors.', filters: ['status', 'job'], run: (c, f) => {
    const rows: Row[] = [];
    sitesFor(c, f).forEach((s) => {
      const apps = by(c.b.apps as Row[], s.id).filter((a) => a.status !== 'void'), jf = by(c.b.jf, s.id)[0] || {}, held = retentionStillHeld(apps as never, jf, by(c.b.invs as Row[], s.id) as never);
      if (held) { const d = retentionDates(jf, c.settings); rows.push({ job: job(s), who: s.client_name || 'Client', type: 'Held by client (owed to us)', held, first: d.first, second: d.second, _go: `/fin/job/${s.id}` }); }
      by(c.b.scs, s.id).forEach((sc) => { const last = (c.b.sapps || []).filter((a) => a.subcontract_id === sc.id && a.certified_gross != null).sort((x, y) => x.number - y.number).pop(); if (last && Number(last.retention)) rows.push({ job: job(s), who: sc.name, type: 'We hold (owed to subcontractor)', held: -Number(last.retention), first: null, second: null, _go: `/fin/sub/${sc.id}` }); });
    });
    return { cols: [{ k: 'job', l: 'Project' }, { k: 'who', l: 'Client / subcontractor' }, { k: 'type', l: 'Type' }, { k: 'held', l: 'Amount', money: true }, { k: 'first', l: '1st half due', date: true }, { k: 'second', l: '2nd half due', date: true }], rows, totals: true, note: 'Negative amounts are retention you hold on subcontractors and will have to pay out.' };
  } },
  { id: 'debtors', group: 'money', title: 'Aged debtors', desc: 'Who owes you money and how overdue it is.', filters: ['job'], run: (c, f) => {
    const t = today(), ids = new Set(sitesFor(c, f, true).map((s) => s.id));
    const rows = (c.b.invs as Row[]).filter((i) => ids.has(i.site_id) && invOutstandingNet(i as never) > 0).map((i) => {
      const s = site(c, i.site_id), o = invOutstandingNet(i as never), late = i.due_date ? days(i.due_date, t) : 0;
      const r: Row = { client: i.bill_name || s?.client_name || '', job: job(s), inv: i.number, due: i.due_date, cur: 0, d30: 0, d60: 0, d90: 0, d90p: 0, total: o, _go: `/fin/job/${i.site_id}/invoice/${i.id}` };
      if (late <= 0) r.cur = o; else if (late <= 30) r.d30 = o; else if (late <= 60) r.d60 = o; else if (late <= 90) r.d90 = o; else r.d90p = o;
      return r;
    }).sort((x, y) => String(x.client).localeCompare(String(y.client)));
    return { cols: [{ k: 'client', l: 'Client' }, { k: 'job', l: 'Project' }, { k: 'inv', l: 'Invoice' }, { k: 'due', l: 'Due', date: true }, { k: 'cur', l: 'Not due', money: true }, { k: 'd30', l: '1–30 days', money: true }, { k: 'd60', l: '31–60', money: true }, { k: 'd90', l: '61–90', money: true }, { k: 'd90p', l: '90+', money: true }, { k: 'total', l: 'Total owed', money: true }], rows, totals: true, note: 'Excluding VAT (as everywhere in Finance). Days overdue are counted from the invoice due date.' };
  } },
  { id: 'creditors', group: 'money', title: 'Aged creditors', desc: 'Purchase invoices and subcontractor payments you still have to pay.', filters: ['job'], run: (c, f) => {
    const t = today(), ids = new Set(sitesFor(c, f, true).map((s) => s.id)), rows: Row[] = [];
    const bucket = (r: Row, amt: number, due: string) => { const late = days(due, t); Object.assign(r, { cur: 0, d30: 0, d60: 0, d90: 0, d90p: 0, total: amt }); if (late <= 0) r.cur = amt; else if (late <= 30) r.d30 = amt; else if (late <= 60) r.d60 = amt; else if (late <= 90) r.d90 = amt; else r.d90p = amt; return r; };
    (c.b.pinvs || []).filter((i) => ids.has(i.site_id) && i.status === 'approved' && !i.paid_on).forEach((i) => { const due = i.due_date || addDays(i.invoice_date, 30); rows.push(bucket({ who: i.supplier_name || '', job: job(site(c, i.site_id)), ref: i.invoice_no || '', due, _go: `/fin/pinv/${i.id}` }, Number(i.total || 0), due)); });
    (c.b.sapps || []).filter((a) => ids.has(a.site_id) && a.status === 'certified').forEach((a) => { const sc = (c.b.scs || []).find((x) => x.id === a.subcontract_id) || {}; const due = a.final_date || addDays(a.app_date, 30); rows.push(bucket({ who: sc.name || 'Subcontractor', job: job(site(c, a.site_id)), ref: `${sc.number || ''} app ${a.number}`, due, _go: `/fin/sub/${a.subcontract_id}` }, Number(a.pay_amount || 0), due)); });
    rows.sort((x, y) => String(x.who).localeCompare(String(y.who)));
    return { cols: [{ k: 'who', l: 'Supplier / subcontractor' }, { k: 'job', l: 'Project' }, { k: 'ref', l: 'Ref' }, { k: 'due', l: 'Due', date: true }, { k: 'cur', l: 'Not due', money: true }, { k: 'd30', l: '1–30 days', money: true }, { k: 'd60', l: '31–60', money: true }, { k: 'd90', l: '61–90', money: true }, { k: 'd90p', l: '90+', money: true }, { k: 'total', l: 'Total', money: true }], rows, totals: true, note: 'Approved purchase invoices not marked paid (incl. VAT; due 30 days after the invoice date unless a due date was entered) and certified subcontractor payments not yet paid (after CIS).' };
  } },
  { id: 'cashflow', group: 'money', title: 'Cash flow forecast', desc: 'Money due in and out over the next 12 weeks, week by week.', filters: ['opening'], run: (c, f) => {
    const mon = mondayOf(today()), weeks = Array.from({ length: 12 }, (_, i) => ({ wk: addDays(mon, i * 7), inv: 0, apps: 0, sup: 0, subs: 0 }));
    const put = (date: string | null, k: 'inv' | 'apps' | 'sup' | 'subs', amt: number) => { let i = date ? Math.floor(days(mon, date) / 7) : 0; if (i < 0) i = 0; if (i > 11) return; weeks[i][k] += amt; };
    (c.b.invs as Row[]).filter((i) => invOutstanding(i as never) > 0).forEach((i) => put(i.due_date, 'inv', invOutstanding(i as never)));
    (c.b.apps as Row[]).filter((a) => !a.invoice_id && ['submitted', 'certified'].includes(a.status)).forEach((a) => { const jf = by(c.b.jf, a.site_id)[0] || {}; put(a.final_date || a.due_date, 'apps', Number(a.cert_net != null ? a.cert_net : a.net_due || 0) * ((jf.vat_treatment || 'standard') === 'standard' ? 1.2 : 1)); });
    (c.b.pinvs || []).filter((i) => i.status === 'approved' && !i.paid_on).forEach((i) => put(i.due_date || addDays(i.invoice_date, 30), 'sup', Number(i.total || 0)));
    (c.b.sapps || []).filter((a) => a.status === 'certified').forEach((a) => put(a.final_date || addDays(a.app_date, 30), 'subs', Number(a.pay_amount || 0)));
    let bal = Number(f.opening || 0);
    const rows = weeks.map((w) => { const net = round2(w.inv + w.apps - w.sup - w.subs); bal = round2(bal + net); return { wk: w.wk, inv: round2(w.inv), apps: round2(w.apps), sup: round2(-w.sup), subs: round2(-w.subs), net, bal }; });
    return { cols: [{ k: 'wk', l: 'Week of', date: true }, { k: 'inv', l: 'In: invoices', money: true }, { k: 'apps', l: 'In: applications not invoiced', money: true }, { k: 'sup', l: 'Out: suppliers', money: true }, { k: 'subs', l: 'Out: subcontractors', money: true }, { k: 'net', l: 'Net', money: true }, { k: 'bal', l: 'Running balance', money: true }], rows, totals: ['inv', 'apps', 'sup', 'subs', 'net'], note: 'Anything overdue is in the first week. Applications not yet invoiced are estimated at the certified (or applied) amount plus VAT. Add your bank balance as the opening balance.' };
  } },
  { id: 'pos', group: 'money', title: 'Purchase order register', desc: 'Every PO with its value, what’s been invoiced and what’s left.', filters: ['status', 'job', 'dates', 'postatus'], run: (c, f) => {
    const ids = new Set(sitesFor(c, f).map((s) => s.id));
    const rows = (c.b.pos || []).filter((p) => ids.has(p.site_id) && (!f.postatus || p.status === f.postatus) && (noDates(f) || inR(String(p.created_at || '').slice(0, 10), f))).sort((x, y) => String(y.created_at).localeCompare(String(x.created_at))).map((p) => {
      const inv = poInvoiced(p, by(c.b.pinvs, p.site_id));
      return { job: job(site(c, p.site_id)), no: p.number, date: String(p.created_at || '').slice(0, 10), supplier: p.supplier_name || '', status: PO_ST[p.status] || p.status, value: p.value != null ? Number(p.value) : null, invoiced: inv, left: p.value != null && p.status === 'open' ? Math.max(0, round2(Number(p.value) - inv)) : 0, _go: `/fin/po/${p.id}` };
    });
    return { cols: [{ k: 'job', l: 'Project' }, { k: 'no', l: 'PO' }, { k: 'date', l: 'Date', date: true }, { k: 'supplier', l: 'Supplier' }, { k: 'status', l: 'Status' }, { k: 'value', l: 'Value', money: true }, { k: 'invoiced', l: 'Invoiced', money: true }, { k: 'left', l: 'Still to come', money: true }], rows, totals: true };
  } },
  { id: 'labour', group: 'tax', title: 'Labour by person', desc: 'Days and cost per person per project.', filters: ['job', 'dates'], run: (c, f) => {
    const m: Record<string, Row> = {}; let unk = false;
    const opDays = (key: string) => { const p = key.split(':'); if (p[0] !== 'op') return null; const op = (c.b.ops || []).find((x) => x.id === p[1]); const ln = op && (op.lines || [])[Number(p[2])]; return ln && Number(ln.days) ? Number(ln.days) : null; };
    sitesFor(c, f, true).forEach((s) => costLines(c.b, s.id).filter((l) => l.cat === 'labour' && (noDates(f) || inR(l.date, f))).forEach((l) => {
      const k = `${l.person || l.who}|${s.id}`, r = (m[k] = m[k] || { who: l.who, job: job(s), days: 0, cost: 0, unk: false });
      const d = l.days || (l.key.startsWith('ck:') ? 1 : opDays(l.key));
      if (d) r.days += Number(d); else if (l.net) { r.unk = true; unk = true; }
      r.cost += l.net;
    }));
    const rows = Object.values(m).map((r) => ({ who: r.who, job: r.job, cost: round2(r.cost), days: r.days ? round2(r.days) : r.unk ? null : 0 })).sort((x, y) => String(x.who).localeCompare(String(y.who)));
    return { cols: [{ k: 'who', l: 'Person' }, { k: 'job', l: 'Project' }, { k: 'days', l: 'Days', num: true }, { k: 'cost', l: 'Cost', money: true }], rows, totals: true, note: unk ? 'Some operative invoices don’t say how many days they cover, so those days aren’t counted.' : undefined };
  } },
  { id: 'cis', group: 'tax', title: 'CIS payments', desc: 'Subcontractor payments, materials and CIS deducted, for your return.', filters: ['dates'], run: (c, f) => {
    const m: Record<string, Row> = {};
    c.cisPays.filter((p) => (!f.from || p.paid_on >= f.from) && (!f.to || p.paid_on <= f.to)).forEach((p) => {
      const k = p.user_id || (p.worker_id ? `w:${p.worker_id}` : `n:${p.name || ''}`), rate = c.b.rates[k] || {};
      const r = (m[k] = m[k] || { who: p.name, utr: rate.utr || p.utr || '', n: 0, gross: 0, mat: 0, cis: 0, net: 0 });
      r.n++; r.gross += Number(p.gross || 0); r.mat += Number(p.materials || 0); r.cis += Number(p.cis_deduction || 0); r.net += Number(p.net_pay || 0);
    });
    return { cols: [{ k: 'who', l: 'Subcontractor' }, { k: 'utr', l: 'UTR' }, { k: 'n', l: 'Payments', num: true }, { k: 'gross', l: 'Gross', money: true }, { k: 'mat', l: 'Materials', money: true }, { k: 'cis', l: 'CIS deducted', money: true }, { k: 'net', l: 'Paid', money: true }], rows: Object.values(m).map((r) => ({ ...r, gross: round2(r.gross), mat: round2(r.mat), cis: round2(r.cis), net: round2(r.net) })), totals: ['gross', 'mat', 'cis', 'net'], note: 'Payments marked paid in the date range. Pick the 6th of one month to the 5th of the next for a CIS return.' };
  } },
  { id: 'vat', group: 'tax', title: 'VAT listing', desc: 'Sales and purchase invoices in a period with net and VAT, incl. reverse charge.', filters: ['dates'], run: (c, f) => {
    const rows: Row[] = [];
    (c.b.invs as Row[]).filter((i) => i.status !== 'void' && (noDates(f) || inR(i.issue_date, f))).forEach((i) => rows.push({ type: 'Sales', date: i.issue_date, ref: i.number, who: i.bill_name || '', job: job(site(c, i.site_id)), vatt: i.vat_treatment === 'reverse_charge' ? 'Reverse charge' : i.vat_treatment === 'zero' ? 'Zero rated' : 'Standard', net: Number(i.net || 0), vat: Number(i.vat || 0), _go: `/fin/job/${i.site_id}/invoice/${i.id}` }));
    (c.b.pinvs || []).filter((i) => i.status === 'approved' && (noDates(f) || inR(i.invoice_date, f))).forEach((i) => rows.push({ type: 'Purchase', date: i.invoice_date, ref: i.invoice_no || '', who: i.supplier_name || '', job: job(site(c, i.site_id)), vatt: Number(i.vat) ? 'Standard' : 'No VAT', net: Number(i.net || 0), vat: Number(i.vat || 0), _go: `/fin/pinv/${i.id}` }));
    rows.sort((x, y) => x.type.localeCompare(y.type) || String(x.date).localeCompare(String(y.date)));
    const sv = round2(rows.filter((r) => r.type === 'Sales').reduce((t, r) => t + r.vat, 0)), pv = round2(rows.filter((r) => r.type === 'Purchase').reduce((t, r) => t + r.vat, 0));
    return { cols: [{ k: 'type', l: 'Type' }, { k: 'date', l: 'Date', date: true }, { k: 'ref', l: 'Ref' }, { k: 'who', l: 'Client / supplier' }, { k: 'job', l: 'Project' }, { k: 'vatt', l: 'VAT' }, { k: 'net', l: 'Net', money: true }, { k: 'vat', l: 'VAT £', money: true }], rows, totals: false, note: `Output VAT ${money(sv)} · input VAT ${money(pv)} · difference ${money(sv - pv)}. Reverse-charge sales carry no VAT here; your customer accounts for it. Check against Xero before filing.` };
  } },
];
