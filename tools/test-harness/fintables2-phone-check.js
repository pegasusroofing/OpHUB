// The rest of Finance as tables on a phone (Andy, 14 Nov 2026: "The whole finance where we haven't needs to be the table
// view"): Purchase Invoices (with ticks for Approve / Mark Paid), invoices received, Plant Hire, Statements, Subcontractor
// POs, their Applications, Pay Run, CIS, People & Rates, Cost Codes, and a project's Costs. Each is a table with no
// Filter / Sort buttons and no search bar above. Touch phone, fake database. node fintables2-phone-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const seed = require('./fresh/seed');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'rams14');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {shot: true});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id, S1 = db.sites[0].id;
  db.purchase_invoices.push({id: 'pi2', org_id: O, site_id: S1, supplier_name: 'Jewson', invoice_no: 'JW-12', invoice_date: '2026-10-20', net: 500, vat: 100, total: 600, status: 'to_approve', created_at: '2026-10-21T09:00:00Z'});
  db.fin_plant_hires = [{id: 'ph1', org_id: O, site_id: S1, item: 'Cherry Picker 12m', supplier_name: 'GAP Hire', on_hire: '2026-10-01', rate: 300, rate_per: 'week'}, {id: 'ph2', org_id: O, site_id: S1, item: 'Skip 8yd', supplier_name: 'Biffa', on_hire: '2026-09-01', off_hire: '2026-09-20', rate: 250, rate_per: 'week'}];
  db.fin_statements = [{id: 'st1', org_id: O, supplier_name: 'SIG Roofing', statement_date: '2026-10-31', closing_balance: 2160, status: 'open', lines: [{id: 'l1', type: 'invoice', ref: 'SIG-88231', amount: 2160, match: 'pi1'}, {id: 'l2', type: 'invoice', ref: 'SIG-9', amount: 40}]}];
  db.fin_sub_apps = [{id: 'sa1', org_id: O, site_id: S1, subcontract_id: 'sc1', number: 1, app_date: '2026-10-25', final_date: '2026-11-20', applied_gross: 2000, status: 'received'}];
  db.fin_cost_codes = [{id: 'cc1', org_id: O, name: 'Materials', code: '300', category: 'materials', grp: 'Direct Costs', active: true}, {id: 'cc2', org_id: O, name: 'Plant Hire', code: '310', category: 'plant', grp: 'Direct Costs', active: true}];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  const vis = (sel) => page.locator(`${sel} >> visible=true`).first();
  const noBars = async () => await page.locator('[aria-label="Filter"] >> visible=true').count() === 0 && await page.locator('[aria-label="Sort"] >> visible=true').count() === 0;
  const table = async (label, want, shot) => {
    const n = await page.locator(`[aria-label="${label}"] >> visible=true`).count();
    const t = n ? await vis(`[aria-label="${label}"]`).innerText() : '';
    const heads = n ? await page.locator(`[aria-label="${label}"] >> visible=true`).first().locator('[aria-label^="Sort by "]').count() : 0;
    check(n === 1 && heads >= 2 && want.every((w) => t.includes(w)) && await noBars(), `${label}: a table with headings to sort (${want.join(', ')}), no Filter / Sort`);
    if (shot) await page.screenshot({path: path.join(SHOTS, shot)});
    return t;
  };

  // Purchase Invoices: Needs Checking, with a tick on each row.
  await page.goto(B + '/fin/purchases?tab=invoices&f=approve'); await page.waitForTimeout(5000);
  await table('Purchase invoices', ['SIG Roofing', 'Jewson'], 'fin-pinv.png');
  const ticks = await vis('[aria-label="Purchase invoices"]').locator('[role="checkbox"]').count();
  check(ticks === 2, `Purchase invoices: a tick on each row (${ticks})`);
  await vis('[aria-label="Purchase invoices"]').locator('[role="checkbox"]').first().click(); await page.waitForTimeout(500);
  check(/1 Selected/.test(await page.locator('body').innerText()) && /Approve 1/.test(await page.locator('body').innerText()), 'Purchase invoices: ticking one shows the Approve bar');
  await vis('[aria-label="Purchase invoices"]').getByRole('button').filter({hasText: 'Jewson'}).first().click(); await page.waitForTimeout(2500);
  check(/\/fin\/pinv\/pi2/.test(page.url()), 'Purchase invoices: tapping a row opens it');
  // Received (no job yet).
  await page.goto(B + '/fin/purchases?tab=invoices&f=job'); await page.waitForTimeout(5000);
  await table('Invoices received', ['Travis Perkins', 'Needs A Job', '£240.00'], 'fin-inbox.png');
  // Plant Hire.
  await page.goto(B + '/fin/purchases?tab=plant'); await page.waitForTimeout(5000);
  let t = await table('Plant hire', ['Cherry Picker 12m', 'Skip 8yd'], 'fin-plant.png');
  await vis('[aria-label="Search On Hire"]').click(); await page.waitForTimeout(500);
  await page.getByText('On Hire', {exact: true}).last().click(); await page.waitForTimeout(500);
  t = await vis('[aria-label="Plant hire"]').innerText();
  check(/Cherry Picker/.test(t) && !/Skip 8yd/.test(t), 'Plant hire: ▾ On Hire hides the one off hire');
  // Statements.
  await page.goto(B + '/fin/statements'); await page.waitForTimeout(5000);
  t = await table('Statements', ['SIG Roofing', '1 Of 2'], 'fin-stmts.png');
  check(await page.locator('input[placeholder="Search supplier"] >> visible=true').count() === 0, 'Statements: no search bar above');
  // Subcontractors.
  await page.goto(B + '/fin/subs?tab=orders'); await page.waitForTimeout(5000);
  await table('Subcontractor POs', ['Lead Co', 'Active'], 'fin-subpos.png');
  await page.goto(B + '/fin/subs?tab=apps'); await page.waitForTimeout(5000);
  await table('Subcontractor applications', ['Lead Co', 'To Certify'], 'fin-subapps.png');
  await page.goto(B + '/fin/subs?tab=cis'); await page.waitForTimeout(5000);
  check(!errs.length, `CIS opens without errors ${errs.slice(0, 1).join('')}`);
  // People & Rates.
  await page.goto(B + '/fin/directory?kind=labour'); await page.waitForTimeout(5000);
  await table('People and rates', ['Dan Fixer'], 'fin-people.png');
  // Cost codes.
  await page.goto(B + '/fin/directory?kind=codes'); await page.waitForTimeout(5000);
  await table('Cost codes Direct Costs', ['Materials', 'Plant Hire', '300'], 'fin-codes.png');
  check(await page.locator('input[placeholder="Search cost codes"] >> visible=true').count() === 0, 'Cost codes: no search bar above');
  // A project's costs.
  await page.goto(B + `/fin/job/${S1}/costs`); await page.waitForTimeout(5000);
  const nCosts = await page.locator('[aria-label="Costs"] >> visible=true').count();
  check(nCosts === 1 && await noBars(), 'Project costs: a table, no Filter / Sort');
  await page.screenshot({path: path.join(SHOTS, 'fin-jobcosts.png')});

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
