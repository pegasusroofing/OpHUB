// Works Orders (Andy, 9 Nov 2026): tabs in place of the boxes, All first, with Filter ▼ (stage, priority, operative,
// due) and Sort; a full-width search under + New Job (address, postcode with or without the space, works order number,
// resident) that narrows every tab, its counts too; ✕ to clear; the footer bar (jobs, Export Excel) at the bottom of
// the page. Laptop and phone, fake database. node works-orders-search-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const BASE = 'http://localhost:8081';
const login = async (page) => {
  await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
};
const rows = async (page) => (await page.getByLabel('Jobs table').count()) ? (await page.getByLabel('Jobs table').innerText()) : '';
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [name, vp] of [['laptop', {width: 1600, height: 1000}], ['phone', {width: 390, height: 844}]]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: vp});
    seed(db); db.profiles[0].howto_dismissed = ['*'];
    const O = db.organizations[0].id;
    Object.assign(db.sites.find((x) => x.id === S1), {repair_contract: true, name: 'Sovereign Repairs'});
    db.repair_jobs = [
      {id: 'j1', org_id: O, site_id: S1, job_number: 'WO-1001', address: 'Flat 4, Oak House, OX16 1AA', description: 'Gutter overflowing', priority: 'Emergency', job_status: 'To Survey', survey_required: 'N', created_at: '2026-11-06T09:00:00Z'},
      {id: 'j2', org_id: O, site_id: S1, job_number: 'WO-1002', address: '3 Mill Lane, BN1 4GH', tenant_name: 'Mr K Hughes', description: 'Leak to porch roof', priority: '7 Days', job_status: 'To Survey', survey_required: 'N', created_at: '2026-11-05T09:00:00Z'},
      {id: 'j3', org_id: O, site_id: S1, job_number: 'WO-1003', address: '14 Elm Close, OX16 9ZZ', description: 'Leak above bedroom', job_status: 'Surveyed - Awaiting Cost', survey_required: 'Y', survey_date: '2026-11-04T10:00:00Z', completed_in_visit: false, created_at: '2026-11-03T09:00:00Z'},
    ];
    db.repair_job_photos = []; db.repair_job_notes = [];
    db.site_assignments = (db.site_assignments || []).concat([{site_id: S1, user_id: 'x'}]);
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
    await login(page);
    await page.goto(`${BASE}/sites/${S1}/repairs`); await page.waitForTimeout(5000);
    // The layout: + New Job, the search, then the tabs (All first and on), Filter, the jobs.
    const nj = await page.getByRole('button', {name: '+ New Job (Read Works Order)'}).boundingBox(), sb = await page.getByLabel('Search jobs').boundingBox(), allTab = page.getByRole('tab', {name: /^All/});
    const at = await allTab.boundingBox();
    check(!!nj && !!sb && !!at && sb.y > nj.y && at.y > sb.y && sb.width > nj.width * 0.8, `${name}: + New Job, a full-width search, then the tabs`);
    check(/^All/.test((await page.getByRole('tab').first().innerText()).trim()) && await page.getByRole('tab').count() >= 9 && await page.getByLabel(/^To Schedule, /).count() === 0, `${name}: tabs in place of the boxes, All first and open`);
    let r = await rows(page);
    check(/WO-1001/.test(r) && /WO-1002/.test(r) && /WO-1003/.test(r), `${name}: All lists every job`);
    const foot = await page.getByLabel('Export Excel').boundingBox();
    check(!!foot && foot.y > vp.height - (vp.width < 800 ? 130 : 90), `${name}: the footer bar sits at the bottom of the page (${foot ? Math.round(foot.y) : '?'} of ${vp.height})`);
    await page.screenshot({path: `shots/works-orders-${name}.png`});
    // A tab.
    await page.getByRole('tab', {name: /^To Schedule/}).click(); await page.waitForTimeout(1000);
    r = await rows(page);
    check(/box=to_book/.test(page.url()) && /WO-1001/.test(r) && /WO-1002/.test(r) && !/WO-1003/.test(r), `${name}: the To Schedule tab, its jobs only`);
    await allTab.click(); await page.waitForTimeout(800);
    // Filter on All: by stage, then priority.
    const pick = async (part, option) => { await page.getByLabel('Filter', {exact: true}).click(); await page.waitForTimeout(400); await page.getByLabel(part, {exact: true}).click(); await page.waitForTimeout(400); await page.getByLabel(option).first().click(); await page.waitForTimeout(300); await page.getByText('Done', {exact: true}).last().click(); await page.waitForTimeout(600); };
    await pick('Stage', /^Quotation Required/);
    r = await rows(page);
    check(/WO-1003/.test(r) && !/WO-1001/.test(r) && !/WO-1002/.test(r), `${name}: All › Filter › Stage › Quotation Required`);
    await page.screenshot({path: `shots/works-orders-filter-${name}.png`});
    await page.getByLabel('Filter', {exact: true}).click(); await page.waitForTimeout(400); await page.getByText('Show everything', {exact: true}).click(); await page.waitForTimeout(300); await page.getByText('Done', {exact: true}).last().click(); await page.waitForTimeout(500);
    await pick('Priority', /^Emergency/);
    r = await rows(page);
    check(/WO-1001/.test(r) && !/WO-1002/.test(r) && !/WO-1003/.test(r), `${name}: Filter › Priority › Emergency`);
    await page.getByLabel('Filter', {exact: true}).click(); await page.waitForTimeout(400); await page.getByText('Show everything', {exact: true}).click(); await page.waitForTimeout(300); await page.getByText('Done', {exact: true}).last().click(); await page.waitForTimeout(500);
    // Search narrows the tab and the counts.
    const search = async (q) => { await page.getByLabel('Search jobs').fill(q); await page.waitForTimeout(700); return rows(page); };
    r = await search('ox161aa');
    check(/WO-1001/.test(r) && !/WO-1002/.test(r) && !/WO-1003/.test(r), `${name}: a postcode typed without the space finds the job`);
    check(/1 Job\b/.test(await page.locator('body').innerText()) && /^Quotation Required$/.test((await page.getByRole('tab', {name: /^Quotation Required/}).innerText()).trim()), `${name}: the footer and the tab counts follow the search`);
    r = await search('OX16');
    check(/WO-1001/.test(r) && /WO-1003/.test(r) && !/WO-1002/.test(r), `${name}: part of a postcode finds both jobs there`);
    r = await search('wo-1002');
    check(/WO-1002/.test(r) && !/WO-1001/.test(r), `${name}: the works order number`);
    r = await search('hughes');
    check(/WO-1002/.test(r) && !/WO-1003/.test(r), `${name}: the resident's name`);
    await page.screenshot({path: `shots/works-orders-search-${name}.png`});
    await search('nowhere');
    check(/No jobs match/.test(await page.locator('body').innerText()), `${name}: nothing found says so`);
    await page.getByLabel('Clear search').click(); await page.waitForTimeout(600);
    check(/WO-1003/.test(await rows(page)) && await page.getByLabel('Search jobs').inputValue() === '', `${name}: ✕ clears the search`);
    await page.getByRole('button', {name: /^WO-1003 /}).click(); await page.waitForTimeout(3000);
    check(new URL(page.url()).pathname === `/sites/${S1}/repairs/job/j3`, `${name}: a job opens`);
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
})();
