// H&S list ticked-documents bar (4 Nov 2026), fake database only: tick a RAMS → a bar at the bottom with the count, Export,
// Email and a bin (no Clear); untick → it goes; the bin asks first, then deletes.
// node hsbar-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*'];
  db.rams_docs = [1, 2].map((i) => ({id: 'rx' + i, site_id: S1, org_id: me.org_id, name: 'Risk Assessment ' + i + '.pdf', storage_path: 'x/r' + i + '.pdf', status: 'current', subcontractor_company_id: null, uploaded_at: '2026-11-0' + i + 'T08:00:00Z', created_at: '2026-11-0' + i + 'T08:00:00Z'}));
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(B + '/sites/' + S1 + '/hs/rams'); await page.waitForTimeout(4500);
  const n0 = (db.rams_docs || []).filter((d) => d.site_id === S1).length;
  check(n0 > 0, `the job has RAMS to tick (${n0})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'job', 'hsbar-before.png')});
  await page.getByText('Select All', {exact: true}).first().click({timeout: 8000}); await page.waitForTimeout(800);
  const t = await page.evaluate(() => document.body.innerText);
  check(/\d+ Selected/.test(t) && /📄 Export/.test(t) && /✉ Email/.test(t) && !/\bClear\b/.test(t), 'bar shows count, Export, Email, no Clear');
  check(await page.getByLabel('Delete selected').count() > 0, 'bar has the bin');
  await page.screenshot({path: path.join(__dirname, 'shots', 'job', 'hsbar-phone.png')});
  await page.getByLabel('Delete selected').click(); await page.waitForTimeout(600);
  check(await page.getByText(/and all (its|their) signatures\? This cannot be undone/).count() > 0, 'the bin asks first');
  await page.getByText('No', {exact: true}).last().click(); await page.waitForTimeout(600);
  check((db.rams_docs || []).filter((d) => d.site_id === S1).length === n0, 'No keeps them');
  await page.getByLabel('Delete selected').click(); await page.waitForTimeout(600);
  await page.getByText('Delete', {exact: true}).last().click(); await page.waitForTimeout(2500);
  check((db.rams_docs || []).filter((d) => d.site_id === S1).length < n0, `Delete removes them (${(db.rams_docs || []).filter((d) => d.site_id === S1).length} left of ${n0})`);
  check(await page.getByLabel('Delete selected').count() === 0, 'bar goes once nothing is ticked');
  check(!errs.length, `no errors ${errs.join(' | ')}`);
  await browser.close();
})();
