// Runs the app against the REAL database, for Sandbox Roofing only, with a guard on every request.
//   node sandbox-guard.js login     → opens a window; Andy signs in himself. The session is kept outside the repo (SB_STATE).
//   REAL=1 SB_STATE=... node crawl.js admin 0 1
// The guard:
//   - refuses to start unless the signed-in person belongs to Sandbox Roofing;
//   - lets nothing go out: every server function (emails, Xero, pushes, OneDrive) gets a fake refusal;
//   - leaves existing records alone: a change or delete only reaches the database for a row this test created.
//     Anything else is answered as if it worked, and its column names are checked afterwards (sandbox-report);
//   - new rows only go in for the test job, or company lists. Messages, profiles, invites and the company itself are never written.
// Every write and every database refusal is logged to shots/crawl/sandbox-log.jsonl; rows it made to sandbox-created.jsonl.
const fs = require('fs'), path = require('path');
const {chromium} = require('playwright');
const SANDBOX = '2eb072b7-2704-48c0-8110-62e45e621ded';
const API = 'https://dtrfupmcazoioubhwdml.supabase.co';
const ANON = (fs.readFileSync(path.join(__dirname, '../../app-native/src/lib/supabase.ts'), 'utf8').match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/) || [])[1];
const STATE = process.env.SB_STATE;
const OUT = path.join(__dirname, 'shots', 'crawl');
const LOG = path.join(OUT, 'sandbox-log.jsonl'), CREATED = path.join(OUT, 'sandbox-created.jsonl');
const TEST_JOB = 'ZZ TEST JOB - safe to delete';
const READ_RPC = /^(check_device_lock_v2|get_invite_info|sow_photo_alerts|site_delivery_dates|onedrive_status|site_application_dates|site_office_orders)$/;
const NEVER_WRITE = /^(messages|profiles|invites|organizations|org_settings|device_locks|push_tokens|edge_email_log)$/;
const created = new Map();
let testSite = null;
const log = (o) => fs.appendFileSync(LOG, JSON.stringify(o) + '\n');
const remember = (table, id) => { if (!created.has(table)) created.set(table, new Set()); created.get(table).add(String(id)); fs.appendFileSync(CREATED, JSON.stringify({table, id}) + '\n'); };
const headers = (token) => ({apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation'});
const tokenOf = (state) => { const e = state.origins.flatMap((o) => o.localStorage).find((x) => x.name === 'ophub-native-session'); return e ? JSON.parse(e.value) : null; };
const json = (route, status, body) => route.fulfill({status, contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: JSON.stringify(body)});

async function guard(route) {
  const q = route.request(), url = q.url(), m = q.method();
  if (m === 'OPTIONS') return route.fallback();
  if (url.includes('/auth/v1/')) {
    if (/\/logout|\/invite|\/admin|\/signup|\/recover/.test(url) || (m === 'PUT' && /\/user/.test(url))) { log({blocked: 'auth', url: url.split('?')[0]}); return json(route, 403, {message: 'blocked in test'}); }
    return route.fallback();
  }
  if (url.includes('/functions/v1/')) { log({blocked: 'function', fn: url.split('/functions/v1/')[1].split('?')[0]}); return json(route, 403, {error: 'blocked in test'}); }
  if (url.includes('/storage/v1/')) { if (m === 'GET' || m === 'HEAD' || /\/sign\//.test(url)) return route.fallback(); log({blocked: 'file', method: m}); return json(route, 403, {message: 'blocked in test'}); }
  if (url.includes('/rest/v1/rpc/')) {
    const fn = url.split('/rpc/')[1].split('?')[0];
    if (READ_RPC.test(fn)) return route.fallback();
    log({blocked: 'rpc', fn}); return json(route, 200, null);
  }
  if (!url.includes('/rest/v1/')) return route.fallback();
  const table = url.split('/rest/v1/')[1].split('?')[0];
  if (m === 'GET' || m === 'HEAD') {
    const res = await route.fetch();
    if (res.status() >= 400) log({readFailed: table, status: res.status(), message: (await res.text()).slice(0, 240), url: url.split('/rest/v1/')[1].slice(0, 240)});
    return route.fulfill({response: res});
  }
  let body = null; try { body = q.postDataJSON(); } catch (e) { /* no body */ }
  const rows = Array.isArray(body) ? body : body ? [body] : [];
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r || {})))];
  const prefer = q.headers().prefer || '';
  const echo = () => (/representation/.test(prefer) ? json(route, m === 'POST' ? 201 : 200, rows.length ? rows.map((r) => ({id: crypto.randomUUID(), ...r})) : [{id: (url.match(/id=eq\.([^&]+)/) || [])[1]}]) : route.fulfill({status: 204, headers: {'access-control-allow-origin': '*'}}));
  const held = (why) => { log({held: why, table, method: m, keys}); return echo(); };
  if (NEVER_WRITE.test(table)) return held('never written');
  if (m === 'POST') {
    if (/resolution=merge|on_conflict/.test(prefer + url)) return held('upsert');
    if (rows.some((r) => r.site_id && r.site_id !== testSite)) return held('other job');
    if (rows.some((r) => r.org_id && r.org_id !== SANDBOX)) return held('other company');
    // A new row hung on an existing record (a payment on a real invoice, say) would change that record's figures.
    const mine = (v) => v === testSite || [...created.values()].some((set) => set.has(String(v)));
    if (rows.some((r) => Object.entries(r).some(([k, v]) => /_id$/.test(k) && !/^(org_id|site_id|sub_site_id)$/.test(k) && typeof v === 'string' && !mine(v)))) return held('linked to existing');
    // Keep each new row's id for the tidy-up. Asking for the row back can be refused by some policies, so fall back to what the app asked for.
    const haveIds = rows.length && rows.every((r) => r.id);
    let res = await route.fetch(haveIds || /representation/.test(prefer) ? {} : {headers: {...q.headers(), prefer: 'return=representation'}});
    let text = await res.text(), asked = haveIds || /representation/.test(prefer);
    if (res.status() >= 400 && !asked && /row-level security/.test(text)) { res = await route.fetch(); text = await res.text(); asked = true; if (res.status() < 400) log({untracked: table}); }
    if (res.status() >= 400) log({writeFailed: table, method: m, status: res.status(), keys, message: text.slice(0, 240)});
    else {
      log({wrote: table, method: m, keys});
      if (haveIds) rows.forEach((r) => remember(table, r.id));
      else try { JSON.parse(text).forEach((r) => r.id && remember(table, r.id)); } catch (e) { log({untracked: table}); }
    }
    return route.fulfill({response: res, body: text});
  }
  const id = (url.match(/[?&]id=eq\.([^&]+)/) || [])[1];
  if (id && created.get(table)?.has(id) && !(table === 'sites' && id === testSite)) {
    const res = await route.fetch(), text = await res.text();
    if (res.status() >= 400) log({writeFailed: table, method: m, status: res.status(), keys, message: text.slice(0, 240)}); else log({wrote: table, method: m, keys});
    return route.fulfill({response: res, body: text});
  }
  return held('existing record');
}

async function check(ctx) {
  const state = await ctx.storageState(), s = tokenOf(state);
  if (!s) throw new Error('Not signed in');
  const r = await ctx.request.get(`${API}/rest/v1/profiles?select=org_id,view_as_org_id,role&id=eq.${s.user.id}`, {headers: headers(s.access_token)});
  const me = (await r.json())[0];
  if (!me || me.org_id !== SANDBOX || me.view_as_org_id) throw new Error('This login is not Sandbox Roofing. Stopping.');
  return {me, token: s.access_token};
}

async function open(browser, opts) {
  fs.mkdirSync(OUT, {recursive: true});
  if (fs.existsSync(CREATED)) fs.readFileSync(CREATED, 'utf8').split('\n').filter(Boolean).forEach((l) => { const {table, id} = JSON.parse(l); if (!created.has(table)) created.set(table, new Set()); created.get(table).add(String(id)); });
  const ctx = await browser.newContext({...opts, storageState: STATE});
  ctx.__token = (await check(ctx)).token;
  await ctx.route(/supabase\.co/, guard);
  open.ctx = ctx;
  return {ctx, db: {}};
}

// The fake data's ids → real Sandbox records. Screens with nothing to open are dropped and listed in the log.
async function routes(list) {
  const ctx = open.ctx, h = headers(ctx.__token);
  const get = async (p) => (await (await ctx.request.get(`${API}/rest/v1/${p}`, {headers: h})).json());
  const one = async (t, extra = '') => ((await get(`${t}?select=id&org_id=eq.${SANDBOX}${extra}&limit=1`))[0] || {}).id;
  let site = (await get(`sites?select=id&org_id=eq.${SANDBOX}&name=eq.${encodeURIComponent(TEST_JOB)}`))[0];
  if (!site) {
    site = {id: crypto.randomUUID()};
    const res = await ctx.request.post(`${API}/rest/v1/sites`, {headers: {...h, Prefer: 'return=minimal'}, data: {id: site.id, name: TEST_JOB, org_id: SANDBOX}});
    if (!res.ok()) throw new Error('Could not add the test job: ' + (await res.text()).slice(0, 200));
    remember('sites', site.id); log({wrote: 'sites', method: 'POST', keys: ['id', 'name', 'org_id']});
  }
  testSite = site.id;
  // The main-contractor pages only open on a job flagged as such.
  await ctx.request.patch(`${API}/rest/v1/sites?id=eq.${testSite}`, {headers: {...h, Prefer: 'return=minimal'}, data: {acting_as_main_contractor: true}});
  const job = ((await get(`fin_applications?select=site_id&org_id=eq.${SANDBOX}&limit=1`))[0] || {}).site_id;
  const inJob = job ? `&site_id=eq.${job}` : '';
  const ids = {po1: await one('purchase_orders'), pi1: await one('purchase_invoices'), h1: await one('fin_plant_hires'), sc1: await one('fin_subcontracts'), ap2: await one('fin_applications', inJob), v1: await one('fin_invoices', inJob)};
  const out = [];
  for (const r of list) {
    let x = r.replace('/fin/job/11111111-1111-1111-1111-111111111111', `/fin/job/${job}`).replace('/sites/11111111-1111-1111-1111-111111111111', `/sites/${testSite}`);
    if (/^\/fin\/(po|pinv|plant|sub)\/|^\/fin\/job\/[^/]+\/(application|invoice)\//.test(x)) x = x.replace(/[a-z]+\d+$/, (t) => ids[t] || t);
    if (/(^|\/)(?!om-)[a-z]{1,3}\d+(\/|$)/.test(x.replace(/[0-9a-f-]{36}/g, ''))) { log({skipped: r}); continue; }
    out.push(x);
  }
  return out;
}

module.exports = {open, routes, LOG, CREATED};

if (require.main === module && process.argv[2] === 'login') (async () => {
  if (!STATE) throw new Error('SB_STATE not set');
  const browser = await chromium.launch({headless: false, channel: 'msedge'});
  const ctx = await browser.newContext({viewport: {width: 1100, height: 800}});
  await ctx.route(/supabase\.co/, guard);
  const page = await ctx.newPage(); await page.goto('http://localhost:8081/login');
  const until = Date.now() + 45 * 60000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 2000));
    const has = await page.evaluate(() => !!localStorage.getItem('ophub-native-session')).catch(() => false);
    if (has) { await new Promise((r) => setTimeout(r, 3000)); await check(ctx); await ctx.storageState({path: STATE}); console.log('signed in to Sandbox'); await browser.close(); process.exit(0); }
  }
  console.log('timed out'); await browser.close(); process.exit(1);
})().catch((e) => { console.log(e.message); process.exit(1); });
