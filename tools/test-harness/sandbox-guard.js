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
//
// FULL=1 (the job test, jobtest.js): the test works a real job start to finish, so jobs it adds (named "ZZ JOB ...") are
// really written to, files go into storage under those jobs, and the functions in SEND are let through only when every
// address in the request is Andy's own and the job is one of the test's. Xero is never called. Everything else is as above.
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
// Records added to Sandbox for the screens that need one (the fake data's ids → real ones). The tidy-up SQL removes them.
const SEEDED = {fi1: 'a0000000-0000-4000-8000-00000000000f', w1: 'a0000000-0000-4000-8000-00000000000c', cp1: 'f4f0ab4e-f557-411d-a3cd-6fa7365bfcd2', c1: 'a0000000-0000-4000-8000-000000000011', lt1: 'a0000000-0000-4000-8000-000000000010', ap1: 'a0000000-0000-4000-8000-00000000000d', tp1: '3e84cc77-37c2-42f7-ae39-096905920957', dt1: 'a0000000-0000-4000-8000-00000000000e', o1: '5d8deb4e-510b-4d84-a142-a6cb5ce1ea90', pi1: 'dea7a96a-85d1-44c7-ba06-4e595dc691bf', rs1: 'a0000000-0000-4000-8000-000000000001', rs2: 'a0000000-0000-4000-8000-000000000002', rs3: 'a0000000-0000-4000-8000-000000000003', rs4: 'a0000000-0000-4000-8000-000000000004', df1: '42b8f02d-c80e-409c-b339-4af143569af1', om1: '24c513be-b63d-483a-ae60-50d9525e9f77', i1: 'a0000000-0000-4000-8000-000000000005', rd1: 'a0000000-0000-4000-8000-000000000008', b1: '178b82a6-a97b-448b-a906-849fde86ddc3', tb1: 'a0000000-0000-4000-8000-000000000007', mf1: 'a0000000-0000-4000-8000-000000000009', pm1: 'a0000000-0000-4000-8000-000000000006', sc1: 'a0000000-0000-4000-8000-00000000000a', e1: 'a0000000-0000-4000-8000-00000000000b', ps1: '10a779aa-1718-4b47-b642-b012ba9a4e9a', rj1: '4c527a24-b353-4f84-aaa9-d0ddc7a8cfc6'};
const SEEDED_TABLES = {fin_inbox: ['fi1'], fin_labour_rates: ['w1'], rams_library_items: ['c1'], sign_layout_templates: ['lt1'], subcontractor_applications: ['ap1'], report_templates: ['tp1'], delivery_tasks: ['dt1'], report_submissions: ['rs1', 'rs2', 'rs3', 'rs4'], handover_om_manuals: ['om1'], incident_reports: ['i1'], rams_docs: ['rd1'], rams_builds: ['b1'], toolbox_talks: ['tb1'], material_order_folders: ['mf1'], permits: ['pm1'], subcontractor_companies: ['sc1'], pricing_elements: ['e1'], price_builder_sheets: ['ps1'], repair_jobs: ['rj1'], drawing_folders: ['df1']};
const created = new Map();
const FULL = process.env.FULL === '1';
const ANDY = 'andy.cramp@rtbroofinglimited.com';
const testSites = () => new Set([...(created.get('sites') || [])]);
// Reads only: the folder list and the file link. onedrive-upload is checked for its job below.
const FN_READ = /^(onedrive-list-folders|onedrive-download-file|onedrive-status|certification-file-access|operative-certification-file-access|material-order-file-access|price-file-access|todo-attachment-access|labour-invoice-access)$/;
// Functions that send only to the addresses in the request, with nothing added by the server (read in full, 31 Oct 2026), and
// the field that must name Andy. Others copy in the sender, or pick people from the database, so they stay blocked.
const FN_SEND = {'send-schedule-email': 'recipients', 'send-document-email': 'recipient_email', 'send-snags-email': 'to_email'};
// Phone notifications only, no email. The test people have no phones registered.
const FN_PUSH = /^(send-sign-reminder|notify-variation-decision|notify-material-pickup)$/;
function fnAllowed(fn, body) {
  if (FN_READ.test(fn)) return true;
  const text = JSON.stringify(body || {});
  if (fn === 'onedrive-upload') return !!body && !body.subfolder && testSites().has(body.site_id);
  if (FN_PUSH.test(fn)) return !body?.site_id || testSites().has(body.site_id);
  if (!FN_SEND[fn] || !body || !body[FN_SEND[fn]]) return false;
  if (body.site_id && !testSites().has(body.site_id)) return false;
  if (body.client_cc_email) return false;
  const emails = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]+/gi) || [];
  return emails.every((e) => e.toLowerCase() === ANDY);
}
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
  if (url.includes('/functions/v1/')) {
    const fn = url.split('/functions/v1/')[1].split('?')[0];
    let fb = null; try { fb = q.postDataJSON(); } catch (e) { /* no body */ }
    if (FULL && fnAllowed(fn, fb)) { log({sent: fn}); const res = await route.fetch(); const text = await res.text(); if (res.status() >= 400) log({fnFailed: fn, status: res.status(), message: text.slice(0, 240)}); return route.fulfill({response: res, body: text}); }
    log({blocked: 'function', fn}); return json(route, 403, {error: 'blocked in test'});
  }
  if (FULL && url.includes('/storage/v1/') && m !== 'GET' && m !== 'HEAD' && !/\/sign\//.test(url)) {
    const mineFile = [...testSites()].some((s) => url.includes(s)) || url.includes(SANDBOX) || /\/object\/signatures\//.test(url);
    const prefixes = m === 'DELETE' ? (() => { try { return q.postDataJSON().prefixes || []; } catch (e) { return []; } })() : [];
    if (mineFile || (prefixes.length && prefixes.every((p) => [...testSites()].some((s) => p.includes(s)) || p.includes(SANDBOX)))) {
      const res = await route.fetch(); const text = await res.text();
      if (res.status() >= 400) log({fileFailed: url.split('/storage/v1/')[1].split('?')[0].slice(0, 160), status: res.status(), message: text.slice(0, 200)}); else log({file: m});
      return route.fulfill({response: res, body: text});
    }
    log({blocked: 'file', method: m, url: url.split('/storage/v1/')[1].split('?')[0].slice(0, 160)}); return json(route, 403, {message: 'blocked in test'});
  }
  if (url.includes('/storage/v1/')) { if (m === 'GET' || m === 'HEAD' || /\/sign\//.test(url)) return route.fallback(); log({blocked: 'file', method: m}); return json(route, 403, {message: 'blocked in test'}); }
  if (url.includes('/rest/v1/rpc/')) {
    const fn = url.split('/rpc/')[1].split('?')[0];
    if (READ_RPC.test(fn)) return route.fallback();
    if (FULL && !/xero|invite|delete_org|remove_member/i.test(fn)) { log({rpc: fn}); const res = await route.fetch(); const text = await res.text(); if (res.status() >= 400) log({rpcFailed: fn, status: res.status(), message: text.slice(0, 240)}); return route.fulfill({response: res, body: text}); }
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
  if (FULL) return fullWrite(route, {q, url, m, table, rows, keys, prefer, held});
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
  // The records added for the screens stay, so buttons after a Delete can still be pressed.
  if (m === 'DELETE' && Object.values(SEEDED).includes(id)) return held('kept for later screens');
  if (id && created.get(table)?.has(id) && !(table === 'sites' && id === testSite)) {
    const res = await route.fetch(), text = await res.text();
    if (res.status() >= 400) log({writeFailed: table, method: m, status: res.status(), keys, message: text.slice(0, 240)}); else log({wrote: table, method: m, keys});
    return route.fulfill({response: res, body: text});
  }
  return held('existing record');
}

// The job test's writes: its own jobs and what hangs off them. Existing records stay held back.
const FULL_NEVER = /^(profiles|invites|organizations|org_settings|push_tokens|edge_email_log|onedrive_connections)$/;
async function fullWrite(route, {q, url, m, table, rows, keys, prefer, held}) {
  // The test people's own profile (a signature, say). Their logins exist only for this test.
  if (table === 'profiles' && m === 'PATCH') {
    const pid = (url.match(/[?&]id=eq\.([^&]+)/) || [])[1];
    const look = await fetch(`${API}/rest/v1/profiles?id=eq.${pid}&select=email`, {headers: {apikey: ANON, Authorization: q.headers().authorization}}).catch(() => null);
    const em = look && look.ok ? ((await look.json().catch(() => []))[0] || {}).email : '';
    if (/^andy\.cramp\+(pm|sm|op|driver|client|sub)@/.test(em || '')) { const res = await route.fetch(); const text = await res.text(); log({wrote: table, method: m, keys}); return route.fulfill({response: res, body: text}); }
    return held('never written');
  }
  if (FULL_NEVER.test(table)) return held('never written');
  const pass = async (rememberRows) => {
    const res = await route.fetch(); const text = await res.text();
    if (res.status() >= 400) log({writeFailed: table, method: m, status: res.status(), keys, message: text.slice(0, 240)});
    else {
      log({wrote: table, method: m, keys});
      if (rememberRows) { try { JSON.parse(text).forEach((r) => r.id && remember(table, r.id)); } catch (e) { rows.forEach((r) => r.id && remember(table, r.id)); } if (!/representation/.test(prefer)) rows.forEach((r) => r.id && remember(table, r.id)); }
    }
    return route.fulfill({response: res, body: text});
  };
  const sites = testSites();
  if (m === 'POST') {
    if (table === 'sites') return rows.every((r) => /^ZZ JOB/.test(r.name || '')) ? pass(true) : held('not a test job');
    if (rows.some((r) => r.org_id && r.org_id !== SANDBOX)) return held('other company');
    if (rows.some((r) => r.site_id && !sites.has(r.site_id))) return held('other job');
    if (table === 'messages' && rows.some((r) => !r.site_id)) return held('company-wide message');
    return pass(true);
  }
  const id = (url.match(/[?&]id=eq\.([^&]+)/) || [])[1], ids = (url.match(/[?&]id=in\.\(([^)]+)\)/) || [])[1];
  const site = (url.match(/[?&]site_id=eq\.([^&]+)/) || [])[1];
  if (table === 'sites') return sites.has(id) ? pass(false) : held('existing record');
  if (site) return sites.has(site) ? pass(false) : held('other job');
  const list = id ? [id] : ids ? ids.split(',').map((x) => x.replace(/"/g, '')) : [];
  if (!list.length) return held('no id');
  if (list.every((x) => created.get(table)?.has(x))) return pass(false);
  // Made by a trigger or by someone else on a test job: look at the row itself.
  const h = {apikey: ANON, Authorization: q.headers().authorization};
  const res = await fetch(`${API}/rest/v1/${table}?id=in.(${list.join(',')})&select=site_id`, {headers: h}).catch(() => null);
  const found = res && res.ok ? await res.json().catch(() => []) : [];
  return found.length && found.every((r) => sites.has(r.site_id)) ? pass(false) : held('existing record');
}

async function check(ctx) {
  const state = await ctx.storageState(), s = tokenOf(state);
  if (!s) throw new Error('Not signed in');
  const r = await ctx.request.get(`${API}/rest/v1/profiles?select=org_id,view_as_org_id,role&id=eq.${s.user.id}`, {headers: headers(s.access_token)});
  const me = (await r.json())[0];
  if (!me || me.org_id !== SANDBOX || me.view_as_org_id) throw new Error('This login is not Sandbox Roofing. Stopping.');
  return {me, token: s.access_token};
}

async function refreshIfOld(file = STATE) {
  const state = JSON.parse(fs.readFileSync(file, 'utf8')), s = tokenOf(state);
  if (!s || s.expires_at * 1000 > Date.now() + 600000) return;
  const res = await fetch(`${API}/auth/v1/token?grant_type=refresh_token`, {method: 'POST', headers: {apikey: ANON, 'Content-Type': 'application/json'}, body: JSON.stringify({refresh_token: s.refresh_token})});
  if (!res.ok) throw new Error('Sandbox sign-in has run out. Andy needs to sign in again.');
  const fresh = await res.json();
  state.origins.flatMap((o) => o.localStorage).find((x) => x.name === 'ophub-native-session').value = JSON.stringify({...s, ...fresh});
  fs.writeFileSync(file, JSON.stringify(state));
}

async function open(browser, opts, file = STATE) {
  fs.mkdirSync(OUT, {recursive: true});
  if (fs.existsSync(CREATED)) fs.readFileSync(CREATED, 'utf8').split('\n').filter(Boolean).forEach((l) => { const {table, id} = JSON.parse(l); if (!created.has(table)) created.set(table, new Set()); created.get(table).add(String(id)); });
  Object.entries(SEEDED_TABLES).forEach(([t, toks]) => { if (!created.has(t)) created.set(t, new Set()); toks.forEach((k) => created.get(t).add(SEEDED[k])); });
  await refreshIfOld(file);
  const ctx = await browser.newContext({...opts, storageState: file});
  ctx.__token = (await check(ctx)).token;
  await ctx.route(/supabase\.co/, guard);
  // The app swaps its sign-in token while it runs; keep the file current so the next run can still start.
  setInterval(() => { ctx.storageState({path: file}).catch(() => {}); }, 60000).unref();
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
    x = x.replace(/\/([a-z]{1,3}\d+)(?=\/|$)/g, (m, t) => (SEEDED[t] ? '/' + SEEDED[t] : m));
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
  // Whose window this is, when several people are being signed in one after another. Andy types the password.
  if (process.env.SB_EMAIL) await page.fill('input[placeholder="you@yourcompany.co.uk"]', process.env.SB_EMAIL, {timeout: 60000}).catch(() => {});
  const until = Date.now() + 45 * 60000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 2000));
    const has = await page.evaluate(() => !!localStorage.getItem('ophub-native-session')).catch(() => false);
    if (has) { await new Promise((r) => setTimeout(r, 3000)); await check(ctx); await ctx.storageState({path: STATE}); console.log('signed in to Sandbox'); await browser.close(); process.exit(0); }
  }
  console.log('timed out'); await browser.close(); process.exit(1);
})().catch((e) => { console.log(e.message); process.exit(1); });
