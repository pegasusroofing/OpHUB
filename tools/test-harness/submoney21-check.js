// A subcontractor's money on the job (Andy, 21 Nov 2026: "with finance on, can when we click into the sub contractors from
// the project give a summary of the finances with them, order value, invoiced to date, remaining etc? All clickable tiles
// like the home finance page"). Fake database. node submoney21-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'submoney21'); require('fs').mkdirSync(SHOTS, {recursive: true});
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [w, h, tag] of [[1300, 900, 'laptop'], [390, 844, 'phone']]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: w, height: h}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*'], finance_enabled: true});
    const O = me.org_id; Object.assign(db.organizations.find((o) => o.id === O) || db.organizations[0], {has_finance: true});
    const now = new Date().toISOString();
    db.subcontractor_companies = [{id: 'sc1', org_id: O, site_id: S1, name: 'Slate & Tile Co', created_at: now}, {id: 'sc2', org_id: O, site_id: S1, name: 'Northside Scaffolding', created_at: now}];
    db.fin_subcontracts = [{id: 'fs1', org_id: O, site_id: S1, number: 'SC-001', name: 'Slate & Tile Co', order_value: 20000, retention_pct: 5, status: 'active', subcontractor_company_id: 'sc1', created_at: now}];
    db.fin_sub_apps = [
      {id: 'a1', org_id: O, site_id: S1, subcontract_id: 'fs1', number: 1, applied_gross: 8000, certified_gross: 7500, retention: 375, pay_amount: 5700, status: 'paid', created_at: now},
      {id: 'a2', org_id: O, site_id: S1, subcontract_id: 'fs1', number: 2, applied_gross: 12000, certified_gross: null, retention: null, pay_amount: null, status: 'applied', created_at: now},
    ];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto(`${B}/sites/${S1}/mc/subcontractors/sc1`); await page.waitForTimeout(6000);
    const t = await text();
    const has = (v, l) => new RegExp(`${v.replace(/[£,]/g, (c) => (c === '£' ? '£' : ','))}\\s*${l}`).test(t);
    check(has('£20,000', 'Order Value') && has('£12,000', 'Applied To Date') && has('£7,500', 'Certified To Date') && has('£5,700', 'Paid To Date \\(Net\\)') && has('£375', 'Retention Held') && has('£12,500', 'Remaining On Order'),
      `${tag}: the tiles: order £20,000, applied £12,000, certified £7,500, paid £5,700, retention £375, remaining £12,500`);
    await page.screenshot({path: path.join(SHOTS, `subcontractor-money-${tag}.png`)});
    if (tag === 'laptop') {
      const bg = await page.evaluate(() => { const e = [...document.querySelectorAll('div')].find((d) => d.childElementCount === 0 && d.textContent === 'Order Value'); const b = e && e.closest('[role="button"]'); return b ? getComputedStyle(b).backgroundColor : ''; });
      check(!!bg && bg !== 'rgb(255, 255, 255)', `the tiles are coloured, like Finance's (${bg})`);
      await page.getByText('Order Value', {exact: true}).first().click(); await page.waitForTimeout(3000);
      check(/\/fin\/sub\/fs1/.test(page.url()), `a tile opens the subcontract order (${page.url().replace(B, '')})`);
      await page.goto(`${B}/sites/${S1}/mc/subcontractors/sc2`); await page.waitForTimeout(6000);
      check(/No subcontract order with Northside Scaffolding on this job yet/.test(await text()), 'no order yet: it says so, with Subcontract Orders');
    }
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
