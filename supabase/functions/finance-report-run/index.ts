import { createClient } from 'npm:@supabase/supabase-js@2';
import ExcelJS from 'npm:exceljs@4.4.0';

// Auto-run Finance reports (2 Nov 2026). Saves a report as Excel into the OneDrive folder chosen on its report page.
//   Cron (x-cron-secret), hourly: runs whatever is due, from 6am UK time. Each runs at most once a day.
//   Signed in (admin / PM with Finance): { schedule_id } runs one now.
// It only reads Finance and adds a new file to that folder: OneDrive renames on a clash, so nothing is overwritten.
// The sums match app-native/src/lib/finReports.ts (moneydue, debtors) and lib/rules/finance.ts: change them together.
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

// ---------- same rules as the app ----------
const round2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
const OPEN = ['issued', 'sent', 'part_paid'];
const invOutstanding = (i: Row) => (OPEN.includes(i.status) ? round2(Number(i.total || 0) - Number(i.paid || 0)) : 0);
const invOutstandingNet = (i: Row) => { const o = invOutstanding(i), t = Number(i.total || 0), n = Number(i.net || 0); return o && t ? round2((o * n) / t) : 0; };
const certified = (apps: Row[]) => apps.filter((a) => a.cert_retention != null && a.status !== 'void');
const retentionHeld = (apps: Row[]) => { const c = certified(apps).sort((x, y) => y.number - x.number)[0]; return c ? round2(c.cert_retention) : 0; };
function retentionDrop(apps: Row[]) {
  const c = certified(apps).sort((x, y) => x.number - y.number);
  if (!c.length) return { amt: 0, date: null as string | null };
  let peak = 0, date: string | null = null;
  c.forEach((a, i) => { const v = Number(a.cert_retention || 0); if (i && v < Number(c[i - 1].cert_retention || 0) - 0.005) date = a.cert_date || a.valuation_date || null; peak = Math.max(peak, v); });
  return { amt: round2(Math.max(0, peak - Number(c[c.length - 1].cert_retention || 0))), date };
}
function retentionReleased(jf: Row | undefined, invs: Row[], apps: Row[]) {
  const list = [jf?.ret1_invoice_id, jf?.ret2_invoice_id].map((id) => id && invs.find((x) => x.id === id)).filter((i) => !!i && !['void', 'draft'].includes(i.status)) as Row[];
  const sum = (arr: Row[]) => arr.reduce((t, i) => t + Number(i.net || 0), 0);
  const drop = retentionDrop(apps);
  if (!(drop.amt > 0)) return round2(sum(list));
  const before = list.filter((i) => !drop.date || !i.issue_date || String(i.issue_date).slice(0, 10) <= (drop.date as string)), after = list.filter((i) => !before.includes(i));
  return round2(sum(after) + Math.max(0, sum(before) - drop.amt));
}
const retentionStillHeld = (apps: Row[], jf: Row | undefined, invs: Row[]) => round2(Math.max(0, retentionHeld(apps) - retentionReleased(jf, invs, apps)));
const days = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 864e5);
const job = (s: Row | undefined) => (s ? `${s.job_number ? `${s.job_number} · ` : ''}${s.name || ''}` : '');

type Col = { k: string; l: string; money?: boolean; date?: boolean };
type Result = { title: string; cols: Col[]; rows: Row[] };

function moneyDue(sites: Row[], invs: Row[], apps: Row[], jfs: Row[], now: string): Result {
  const site = (id: string) => sites.find((s) => s.id === id);
  const live = apps.filter((a) => a.status !== 'void');
  const inv = invs.filter((i) => invOutstandingNet(i) > 0).sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || ''))).map((i) => {
    const s = site(i.site_id), late = i.due_date ? days(i.due_date, now) : 0;
    return { inv: i.number, client: i.bill_name || s?.client_name || '', addr: s?.name || '', due: invOutstandingNet(i), date: i.due_date, status: late > 0 ? `${late} days overdue` : 'Not yet due', notes: i.notes || '' };
  });
  const appr = live.filter((a) => a.status !== 'invoiced' && !a.invoice_id && Number(a.cert_net ?? a.net_due ?? 0) > 0).sort((a, b) => String(a.final_date || a.due_date || a.valuation_date || '').localeCompare(String(b.final_date || b.due_date || b.valuation_date || ''))).map((a) => {
    const s = site(a.site_id);
    return { inv: `App ${a.number}`, client: s?.client_name || '', addr: s?.name || '', due: round2(a.cert_net ?? a.net_due), date: a.final_date || a.due_date || a.valuation_date, status: a.status === 'certified' ? 'Certified' : a.status === 'submitted' ? 'Applied' : 'Draft – value TBC', notes: a.notes || '' };
  });
  const ret = sites.map((s) => {
    const jf = jfs.find((j) => j.site_id === s.id), held = retentionStillHeld(live.filter((a) => a.site_id === s.id), jf, invs.filter((i) => i.site_id === s.id));
    return held > 0 ? { inv: '', client: s.client_name || '', addr: `${s.name || ''} – retention`, due: held, date: jf?.pc_date || null, status: 'Held', notes: '' } : null;
  }).filter(Boolean) as Row[];
  const sum = (a: Row[]) => round2(a.reduce((t, r) => t + r.due, 0));
  const head = (t: string): Row => ({ inv: t, _head: true }), total = (t: string, v: number): Row => ({ addr: t, due: v, _bold: true });
  return { title: 'Money due', cols: [{ k: 'inv', l: 'Invoice No' }, { k: 'client', l: 'Client' }, { k: 'addr', l: 'Address' }, { k: 'due', l: 'Due', money: true }, { k: 'date', l: 'Date', date: true }, { k: 'status', l: 'Status' }, { k: 'notes', l: 'Notes' }], rows: [
    head('Invoices'), ...inv, total('Invoice total:', sum(inv)), head('Applications'), ...appr, total('Applications total:', sum(appr)), head('Retentions'), ...ret, total('Retentions total:', sum(ret)), total('Total due:', round2(sum(inv) + sum(appr) + sum(ret))),
  ] };
}
function debtors(sites: Row[], invs: Row[], now: string): Result {
  const rows = invs.filter((i) => invOutstandingNet(i) > 0).map((i) => {
    const s = sites.find((x) => x.id === i.site_id), o = invOutstandingNet(i), late = i.due_date ? days(i.due_date, now) : 0;
    const r: Row = { client: i.bill_name || s?.client_name || '', job: job(s), inv: i.number, due: i.due_date, cur: 0, d30: 0, d60: 0, d90: 0, d90p: 0, total: o };
    if (late <= 0) r.cur = o; else if (late <= 30) r.d30 = o; else if (late <= 60) r.d60 = o; else if (late <= 90) r.d90 = o; else r.d90p = o;
    return r;
  }).sort((x, y) => String(x.client).localeCompare(String(y.client)));
  const m = ['cur', 'd30', 'd60', 'd90', 'd90p', 'total'], t: Row = { client: 'Total', _bold: true };
  m.forEach((k) => { t[k] = round2(rows.reduce((n, r) => n + r[k], 0)); });
  return { title: 'Aged debtors', cols: [{ k: 'client', l: 'Client' }, { k: 'job', l: 'Project' }, { k: 'inv', l: 'Invoice' }, { k: 'due', l: 'Due', date: true }, { k: 'cur', l: 'Not yet due', money: true }, { k: 'd30', l: '1-30 days', money: true }, { k: 'd60', l: '31-60 days', money: true }, { k: 'd90', l: '61-90 days', money: true }, { k: 'd90p', l: '90+ days', money: true }, { k: 'total', l: 'Total', money: true }], rows: [...rows, t] };
}

async function excel(res: Result, orgName: string, stamp: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet(res.title);
  ws.addRow([`${orgName} — ${res.title}`]).font = { name: 'Arial', bold: true, size: 14 };
  ws.addRow([`Run automatically on ${stamp}`]).font = { name: 'Arial', italic: true, size: 10 };
  ws.addRow([]);
  const hd = ws.addRow(res.cols.map((c) => c.l)); hd.font = { name: 'Arial', bold: true }; hd.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF0F2' } };
  res.rows.forEach((r) => {
    const row = ws.addRow(res.cols.map((c) => { const v = r[c.k]; return v == null || v === '' ? null : c.date ? new Date(`${String(v).slice(0, 10)}T12:00:00Z`) : v; }));
    row.font = { name: 'Arial', bold: !!(r._head || r._bold) };
  });
  res.cols.forEach((c, i) => { const col = ws.getColumn(i + 1); col.width = c.money ? 14 : c.date ? 13 : i < 3 ? 30 : 22; if (c.money) col.numFmt = '£#,##0.00;[Red]-£#,##0.00'; if (c.date) col.numFmt = 'dd/mm/yyyy'; });
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
async function all(admin: any, table: string, cols: string, org: string, extra?: (q: any) => any, order = 'id') {
  const out: Row[] = [];
  for (let at = 0; ; at += 1000) {
    let q = admin.from(table).select(cols).eq('org_id', org).order(order).range(at, at + 999);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw new Error(`Could not read ${table}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
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
    const org = sc.org_id;
    const [sites, invs] = await Promise.all([all(admin, 'sites', 'id,name,job_number,client_name', org), all(admin, 'fin_invoices', 'id,site_id,status,number,bill_name,due_date,issue_date,total,paid,net,notes', org, (q) => q.neq('status', 'draft'))]);
    let res: Result;
    if (sc.report_id === 'moneydue') {
      const [apps, jfs] = await Promise.all([all(admin, 'fin_applications', 'id,site_id,number,status,valuation_date,due_date,final_date,net_due,cert_net,cert_retention,cert_date,invoice_id,notes', org), all(admin, 'job_finance', 'site_id,pc_date,ret1_invoice_id,ret2_invoice_id', org, undefined, 'site_id')]);
      res = moneyDue(sites, invs, apps, jfs, uk.ymd);
    } else if (sc.report_id === 'debtors') res = debtors(sites, invs, uk.ymd);
    else throw new Error('This report can’t auto-run yet');
    const { data: o } = await admin.from('organizations').select('name').eq('id', org).maybeSingle();
    const bytes = await excel(res, o?.name || 'OpHUB', uk.ymd.split('-').reverse().join('/'));
    const { data: conn } = await admin.from('onedrive_connections').select('*').eq('org_id', org).maybeSingle();
    if (!conn?.access_token) throw new Error('OneDrive isn’t connected');
    const token = await tokenFor(admin, conn);
    const name = encodeURIComponent(`${res.title} ${uk.ymd}.xlsx`);
    const base = sc.drive_id ? `${GRAPH}/drives/${encodeURIComponent(sc.drive_id)}/items/${encodeURIComponent(sc.folder_id)}` : `${GRAPH}/me/drive/items/${encodeURIComponent(sc.folder_id)}`;
    const up = await fetch(`${base}:/${name}:/content?@microsoft.graph.conflictBehavior=rename`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: bytes as unknown as BodyInit });
    if (!up.ok) throw new Error(up.status === 401 ? 'OneDrive needs reconnecting' : up.status === 404 ? 'The OneDrive folder can’t be found' : 'OneDrive refused the file');
    const d = await up.json().catch(() => ({}));
    ok = true; message = `Saved ${d.name || `${res.title} ${uk.ymd}.xlsx`}`;
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
    if (given) {
      if (!secret || given !== secret) return reply(req, { error: 'Forbidden' }, 403);
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
    const body = await req.json().catch(() => ({}));
    const { data: sc } = await admin.from('fin_report_schedules').select('*').eq('id', body.schedule_id).eq('org_id', me.org_id).maybeSingle();
    if (!sc) return reply(req, { error: 'Not found' }, 404);
    return reply(req, await runOne(admin, sc));
  } catch (e) { console.error('finance-report-run', e); return reply(req, { error: 'Something went wrong' }, 500); }
});
