import { createClient } from 'npm:@supabase/supabase-js@2';
import ExcelJS from 'npm:exceljs@4.4.0';
import { REPORTS, type Filters, type Result } from './reports.ts';
import { addMonths, today } from './rules.ts';

// Auto-run Finance reports (2 Nov 2026). Saves a report as Excel into the OneDrive folder chosen on its report page.
//   Cron (x-cron-secret), hourly: runs whatever is due, from 6am UK time. Each runs at most once a day.
//   Cron secret + { probe: true }: works out every report for every company with a schedule-free dry run; returns only counts and timings.
//   Signed in (admin / PM with Finance): { schedule_id } runs one now; { dry_run: report_id, filters } returns the rows and saves nothing.
// It only reads Finance and adds a new file to that folder: OneDrive renames on a clash, so nothing is overwritten.
// reports.ts and book.ts are copies of the app's code: tools/sync-report-fn.js keeps them the same.
const corsHeaders = { 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token, x-cron-secret, cache-control, pragma' };
const OPHUB_ORIGINS = new Set(['https://operativehub.co.uk', 'https://www.operativehub.co.uk', 'https://ophub-ten.vercel.app', 'capacitor://localhost', 'https://localhost', 'http://localhost']);
const originOk = (o: string | null) => !!o && (OPHUB_ORIGINS.has(o) || /^https:\/\/ophub-[a-z0-9-]+-op-hub\.vercel\.app$/.test(o) || /^http:\/\/localhost:\d{2,5}$/.test(o));
const reply = (req: Request, obj: unknown, status = 200) => {
  const h = new Headers({ ...corsHeaders, 'Content-Type': 'application/json', Vary: 'Origin' });
  const o = req.headers.get('Origin');
  if (originOk(o)) h.set('Access-Control-Allow-Origin', o as string);
  return new Response(JSON.stringify(obj), { status, headers: h });
};
const GRAPH = 'https://graph.microsoft.com/v1.0';
type Row = Record<string, any>;
const SETTINGS_DEFAULTS = { default_retention_pct: 5, default_due_days: 30, default_final_days: 14, default_vat: 'standard', default_defects_months: 12 };
const LEAN = ['moneydue', 'debtors']; // these only need invoices, applications and job details

async function all(admin: any, table: string, cols: string, extra: (q: any) => any, order = 'id') {
  const out: Row[] = [];
  for (let at = 0; ; at += 1000) {
    const { data, error } = await extra(admin.from(table).select(cols)).order(order).range(at, at + 999);
    if (error) throw new Error(`Could not read ${table}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}
/** The same read as the app's loadBook. This key sees every company, so every read is held to this one. */
async function loadBook(admin: any, org: string, sites: Row[], lean: boolean) {
  const o = (q: any) => q.eq('org_id', org);
  const [jf, invs, apps] = await Promise.all([all(admin, 'job_finance', '*', o, 'site_id'), all(admin, 'fin_invoices', '*', (q) => o(q).neq('status', 'draft')), all(admin, 'fin_applications', '*', o)]);
  const empty = { pinvs: [], pos: [], cks: [], manual: [], hires: [], extra: [], budgets: [], vars: [], scs: [], sapps: [], rates: {}, cpos: [], items: [], ops: [], names: {} };
  if (lean) return { siteId: null, jf, invs, apps, ...empty };
  const [pinvs, pos, manual, hires, extra, budgets, vars, scs, sapps, rates, items, ops, people] = await Promise.all([
    all(admin, 'purchase_invoices', '*', (q) => o(q).neq('status', 'rejected')), all(admin, 'purchase_orders', '*', o), all(admin, 'fin_labour_manual', '*', o), all(admin, 'fin_plant_hires', '*', o), all(admin, 'fin_job_costs', '*', o),
    all(admin, 'fin_job_budgets', '*', o), all(admin, 'fin_variations', '*', o), all(admin, 'fin_subcontracts', '*', o), all(admin, 'fin_sub_apps', '*', o), all(admin, 'fin_labour_rates', '*', o),
    all(admin, 'fin_contract_items', 'id,site_id,kind,value,cost,sub_job_id,position', o), all(admin, 'fin_sub_payments', '*', (q) => o(q).is('sub_app_id', null).in('status', ['approved', 'paid'])), all(admin, 'profiles', 'id,name', o),
  ]);
  // Sign-ins have no company on them: read them by this company's projects.
  const cks: Row[] = [], ids = sites.map((s) => s.id);
  for (let i = 0; i < ids.length; i += 50) cks.push(...await all(admin, 'checkins', 'id,user_id,site_id,sub_site_id,ts,type', (q) => q.in('site_id', ids.slice(i, i + 50)).eq('type', 'in')));
  const rateMap: Row = {}, names: Record<string, string> = {};
  people.forEach((p) => { names[p.id] = p.name; });
  rates.forEach((r) => { if (r.user_id) rateMap[r.user_id] = r; else { rateMap[`w:${r.id}`] = r; names[`w:${r.id}`] = String(r.name || r.trading_name || 'Worker'); } });
  return { siteId: null, jf, invs, apps, pinvs, pos, cks, manual, hires, extra, budgets, vars, scs, sapps, rates: rateMap, cpos: [], items, ops, names };
}
const siteStatus = (s: Row) => (s.status === 'active' || s.status === 'live' ? 'live' : s.status === 'closed' || s.status === 'upcoming' ? s.status : 'upcoming');
/** The dates for a saved period. */
function periodDates(period: unknown): { from: string; to: string } {
  const t = today(), first = `${t.slice(0, 7)}-01`;
  if (period === 'this_month') return { from: first, to: t };
  if (period === 'last_month') { const from = addMonths(first, -1); return { from, to: new Date(new Date(`${first}T12:00:00Z`).getTime() - 864e5).toISOString().slice(0, 10) }; }
  if (period === 'cis_month') { const end5 = Number(t.slice(8)) >= 6 ? `${t.slice(0, 7)}-05` : addMonths(`${t.slice(0, 7)}-05`, -1); return { from: addMonths(`${end5.slice(0, 7)}-06`, -1), to: end5 }; }
  return { from: '', to: '' };
}
async function work(admin: any, org: string, id: string, saved: Row | null): Promise<{ title: string; res: Result }> {
  const rep = REPORTS.find((r) => r.id === id);
  if (!rep) throw new Error('This report can’t be found');
  const sites = await all(admin, 'sites', '*', (q) => q.eq('org_id', org));
  const [b, st, cisPays] = await Promise.all([
    loadBook(admin, org, sites, LEAN.includes(id)), admin.from('fin_settings').select('*').eq('org_id', org).maybeSingle(),
    id === 'cis' ? all(admin, 'fin_sub_payments', '*', (q) => q.eq('org_id', org).eq('status', 'paid')) : Promise.resolve([]),
  ]);
  const settings: Row = { ...SETTINGS_DEFAULTS }; Object.entries(st.data || {}).forEach(([k, v]) => { if (v !== null && v !== undefined) settings[k] = v; });
  const f: Filters = { job: saved?.job || '', status: saved?.status || 'live', opening: saved?.opening || '', varstatus: saved?.varstatus || '', postatus: saved?.postatus || '', ...periodDates(saved?.period) };
  return { title: rep.title, res: rep.run({ b: b as never, settings, sites, status: siteStatus, cisPays }, f) };
}
const totalsOf = (res: Result) => (res.totals ? res.cols.map((c, i) => {
  if (!(res.totals === true ? c.money : Array.isArray(res.totals) && res.totals.includes(c.k))) return i === 0 ? `Total (${res.rows.length})` : null;
  return Math.round(res.rows.reduce((t, r) => t + (Number(r[c.k]) || 0), 0) * 100) / 100;
}) : null);

async function excel(title: string, res: Result, orgName: string, stamp: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet(title.slice(0, 31).replace(/[\\/*?:[\]]/g, ' '));
  ws.addRow([`${orgName} — ${title}`]).font = { name: 'Arial', bold: true, size: 14 };
  ws.addRow([`Run automatically on ${stamp}`]).font = { name: 'Arial', italic: true, size: 10 };
  ws.addRow([]);
  const hd = ws.addRow(res.cols.map((c) => c.l)); hd.font = { name: 'Arial', bold: true }; hd.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF0F2' } };
  res.rows.forEach((r) => {
    const row = ws.addRow(res.cols.map((c) => { const v = r[c.k]; return v == null || v === '' ? null : c.date ? new Date(`${String(v).slice(0, 10)}T12:00:00Z`) : v; }));
    row.font = { name: 'Arial', bold: !!(r._head || r._bold) };
  });
  const tot = totalsOf(res);
  if (tot) ws.addRow(tot).font = { name: 'Arial', bold: true };
  if (res.note) { ws.addRow([]); ws.addRow([res.note]).font = { name: 'Arial', italic: true, size: 10 }; }
  res.cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1); col.width = c.money ? 14 : c.date ? 13 : c.num || c.pct ? 10 : i < 3 ? 30 : 22;
    const fmt = c.money ? '£#,##0.00;[Red]-£#,##0.00' : c.date ? 'dd/mm/yyyy' : c.pct ? '0.0"%"' : null;
    if (fmt) col.eachCell((cell, n) => { if (n > 4) cell.numFmt = fmt; });
  });
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  return new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

async function tokenFor(admin: any, conn: any) {
  if (new Date(conn.expires_at).getTime() > Date.now() + 60000) return conn.access_token;
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: Deno.env.get('AZURE_CLIENT_ID')!, client_secret: Deno.env.get('AZURE_CLIENT_SECRET')!, refresh_token: conn.refresh_token, grant_type: 'refresh_token' }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error('OneDrive needs reconnecting');
  await admin.from('onedrive_connections').update({ access_token: d.access_token, refresh_token: d.refresh_token || conn.refresh_token, expires_at: new Date(Date.now() + (d.expires_in || 3600) * 1000).toISOString() }).eq('org_id', conn.org_id);
  return d.access_token;
}
const ukNow = () => {
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
  return { ymd: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), day: Number(p.day), wd: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1 };
};
const ukDay = (t: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(t));

async function runOne(admin: any, sc: Row): Promise<{ ok: boolean; message: string }> {
  const uk = ukNow(); let message = '', ok = false;
  try {
    if (!sc.folder_id) throw new Error('No OneDrive folder chosen');
    const { title, res } = await work(admin, sc.org_id, sc.report_id, sc.filters);
    const { data: o } = await admin.from('organizations').select('name').eq('id', sc.org_id).maybeSingle();
    const bytes = await excel(title, res, o?.name || 'OpHUB', uk.ymd.split('-').reverse().join('/'));
    const { data: conn } = await admin.from('onedrive_connections').select('*').eq('org_id', sc.org_id).maybeSingle();
    if (!conn?.access_token) throw new Error('OneDrive isn’t connected');
    const token = await tokenFor(admin, conn);
    const file = `${title.replace(/[\\/:*?"<>|]+/g, '-')} ${uk.ymd}.xlsx`;
    const base = sc.drive_id ? `${GRAPH}/drives/${encodeURIComponent(sc.drive_id)}/items/${encodeURIComponent(sc.folder_id)}` : `${GRAPH}/me/drive/items/${encodeURIComponent(sc.folder_id)}`;
    const up = await fetch(`${base}:/${encodeURIComponent(file)}:/content?@microsoft.graph.conflictBehavior=rename`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: bytes as unknown as BodyInit });
    if (!up.ok) throw new Error(up.status === 401 ? 'OneDrive needs reconnecting' : up.status === 404 ? 'The OneDrive folder can’t be found' : 'OneDrive refused the file');
    const d = await up.json().catch(() => ({}));
    ok = true; message = `Saved ${d.name || file}`;
  } catch (e) { console.error('finance-report-run', sc.id, e); message = String((e as Error)?.message || 'Failed').slice(0, 200); }
  await admin.from('fin_report_schedules').update({ last_run_at: new Date().toISOString(), last_ok: ok, last_message: message }).eq('id', sc.id);
  return { ok, message };
}
const isDue = (sc: Row, uk: ReturnType<typeof ukNow>) => {
  if (uk.hour < 6 || (sc.last_run_at && ukDay(sc.last_run_at) === uk.ymd)) return false;
  if (sc.frequency === 'daily') return true;
  if (sc.frequency === 'weekly') return uk.wd === Number(sc.run_day);
  return sc.frequency === 'monthly' && uk.day === Number(sc.run_day);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply(req, { ok: true });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const secret = Deno.env.get('CRON_SECRET'), given = req.headers.get('x-cron-secret');
    const body = await req.json().catch(() => ({}));
    if (given) {
      if (!secret || given !== secret) return reply(req, { error: 'Forbidden' }, 403);
      if (body.probe) { // counts and timings only
        const t0 = Date.now();
        const { res } = await work(admin, body.org_id, body.report_id, { status: 'all' });
        return reply(req, { report: body.report_id, rows: res.rows.length, ms: Date.now() - t0 });
      }
      const uk = ukNow();
      const { data } = await admin.from('fin_report_schedules').select('*').eq('active', true);
      const due = (data || []).filter((s: Row) => isDue(s, uk));
      const results = [];
      for (const s of due) results.push(await runOne(admin, s)); // one at a time: a few a day at most
      return reply(req, { ran: results.length, failed: results.filter((r) => !r.ok).length });
    }
    const token = req.headers.get('X-User-Token') || (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return reply(req, { error: 'Not authenticated' }, 401);
    const { data: me } = await admin.from('profiles').select('org_id,role,finance_enabled').eq('id', u.user.id).maybeSingle();
    if (!me || !['admin', 'pm'].includes(me.role) || !me.finance_enabled) return reply(req, { error: 'Forbidden' }, 403);
    if (body.dry_run) { const { res } = await work(admin, me.org_id, body.dry_run, body.filters || null); return reply(req, { cols: res.cols, rows: res.rows, totals: totalsOf(res) }); }
    const { data: sc } = await admin.from('fin_report_schedules').select('*').eq('id', body.schedule_id).eq('org_id', me.org_id).maybeSingle();
    if (!sc) return reply(req, { error: 'Not found' }, 404);
    return reply(req, await runOne(admin, sc));
  } catch (e) { console.error('finance-report-run', e); return reply(req, { error: 'Something went wrong' }, 500); }
});
