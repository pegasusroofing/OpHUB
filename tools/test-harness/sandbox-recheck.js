// After a Sandbox run: rechecks named fixes and the buttons a pop-up blocked, each on a freshly opened screen. Same guard as crawl.js.
//   SB_STATE=... node sandbox-recheck.js
const fs = require('fs'), path = require('path');
const {chromium} = require('playwright');
const real = require('./sandbox-guard');
const B = 'http://localhost:8081', OUT = path.join(__dirname, 'shots', 'crawl');
const SANDBOX = '2eb072b7-2704-48c0-8110-62e45e621ded', API = 'https://dtrfupmcazoioubhwdml.supabase.co';
const logLines = () => fs.readFileSync(real.LOG, 'utf8').split('\n').filter(Boolean).length;
const logSince = (n) => fs.readFileSync(real.LOG, 'utf8').split('\n').filter(Boolean).slice(n).map((l) => JSON.parse(l));

(async () => {
  const browser = await chromium.launch();
  const {ctx} = await real.open(browser, {viewport: {width: 1300, height: 900}});
  await real.routes([]);
  const anon = (fs.readFileSync(path.join(__dirname, '../../app-native/src/lib/supabase.ts'), 'utf8').match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/) || [])[1];
  const get = async (p) => (await (await ctx.request.get(`${API}/rest/v1/${p}`, {headers: {apikey: anon, Authorization: `Bearer ${ctx.__token}`}})).json());
  const one = async (t, c = 'id', extra = '') => ((await get(`${t}?select=${c}&org_id=eq.${SANDBOX}${extra}&limit=1`))[0] || {})[c];
  const T = await one('sites', 'id', `&name=eq.${encodeURIComponent('ZZ TEST JOB - safe to delete')}`);
  const J = await one('fin_applications', 'site_id'), PI = await one('purchase_invoices'), SC = await one('fin_subcontracts');
  const RJ = ((await get(`repair_jobs?select=id&site_id=eq.${T}&limit=1`))[0] || {}).id;
  const page = await ctx.newPage();
  const results = [];
  // [what, screen, buttons to press in order]. The last is the one being checked.
  const checks = [
    ['Yard rates load', '/fin/yard', []],
    ['Repair photos load', `/sites/${T}/repairs/job/${RJ}`, []],
    ['Delete project check, job with Finance records', `/fin/job/${J}?tab=setup`, ['Delete this project']],
    ['Schedule: In Progress on the task', `/sites/${T}/schedule`, ['In Progress']],
    ['Schedule: section menu', `/sites/${T}/schedule`, ['⋮']],
    ['HAVS: Save and close confirmed', `/sites/${T}/hs/havs`, ['SAVE & CLOSE FOR THE WEEK', 'Save & Close']],
    ...['Unallocated Invoices', 'To Pay Suppliers', 'To Approve'].map((b) => [`Purchases: change dates, ${b}`, '/fin/purchases', [`Change dates: ${b}`]]),
    ['Sales: change dates, Overdue', '/fin/sales', ['Change dates: Overdue']],
    ...['Final Account', 'Day Works', 'Prelims'].map((b) => [`Job: ${b} options`, `/fin/job/${J}`, [`${b} options`]]),
    ['Company library: edit', '/pm/admin/companylibrary', ['✏️']],
    ['RAMS library: move up', '/pm/admin/ramslibrary', ['↑']],
    ['RAMS library: menu', '/pm/admin/ramslibrary', ['⋯']],
  ];
  for (const [what, route, presses] of checks) {
    const start = logLines(); const r = {what, pressed: [], missing: null, said: ''};
    await page.goto(B + route); await page.waitForTimeout(6000);
    for (const b of presses) {
      const byLabel = page.locator(`[aria-label^="${b}"]`).first(), exact = page.getByText(b, {exact: true}).last();
      const el = (await byLabel.isVisible().catch(() => false)) ? byLabel : (await exact.isVisible().catch(() => false)) ? exact : page.getByText(b, {exact: false}).first();
      if (!(await el.isVisible().catch(() => false))) { r.missing = b; break; }
      const before = await page.locator('body').innerText();
      await el.click({timeout: 5000}).then(() => r.pressed.push(b)).catch((e) => { r.missing = b + ' (blocked: ' + e.message.split('\n')[0].slice(0, 80) + ')'; });
      await page.waitForTimeout(3500);
      const now = await page.locator('body').innerText();
      r.changed = now !== before;
      r.said = now.split('\n').map((s) => s.trim()).filter((s) => s && !before.includes(s)).join(' / ').slice(0, 220);
    }
    await page.screenshot({path: path.join(OUT, 'recheck-' + results.length + '.png')});
    r.db = logSince(start).filter((x) => x.readFailed || x.writeFailed || x.wrote || x.held || (x.blocked && !/sow_photo_alerts|hr_ensure/.test(x.fn || ''))).map((x) => x.readFailed ? 'READ FAILED ' + x.readFailed : x.writeFailed ? 'WRITE FAILED ' + x.writeFailed + ' ' + x.message : x.wrote ? 'saved ' + x.method + ' ' + x.wrote : x.held ? 'held ' + x.table : 'blocked ' + x.blocked + ' ' + (x.fn || ''));
    results.push(r); console.log(JSON.stringify(r).slice(0, 460));
  }
  await browser.close();
})().catch((e) => { console.log('STOPPED', e.message.slice(0, 200)); process.exit(1); });
