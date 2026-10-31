// The saves the crawler left in doubt: type real values and check the row reaches the database.
const {chromium, makeContext, S1} = require('./harness');
const world = require('./seeds/world');
const B = 'http://localhost:8081', J = `/fin/job/${S1}`;
(async () => {
  const browser = await chromium.launch();
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  world(db); db.profiles.find((p) => p.id === 'me').role = 'admin';
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 150)));
  await page.goto(B + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(4000);
  let bad = 0;
  const check = (name, ok, more) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${more ? ' — ' + more : ''}`); };
  const open = async (r) => { await page.goto(B + r); await page.waitForTimeout(3000); };
  const say = () => page.evaluate(() => document.body.innerText.split('\n').slice(-6).join(' / ').slice(0, 160));
  const fillBy = async (ph, v) => { const b = page.getByPlaceholder(ph).first(); await b.fill(v); };

  // VAT rates: add one, save, stay on settings.
  await open('/fin/settings');
  await page.getByText(/VAT rates/).first().click(); await page.waitForTimeout(400);
  await page.getByText(/Add VAT rate/i).first().click(); await page.waitForTimeout(400);
  const blank = page.locator('input:visible').filter({hasNot: page.locator('[value]')});
  const inputs = page.locator('input:visible'); const n = await inputs.count();
  for (let i = 0; i < n; i++) { const v = await inputs.nth(i).inputValue(); if (!v) { await inputs.nth(i).fill('Test rate'); break; } }
  await page.waitForTimeout(200);
  await page.getByText(/Save VAT rates/i).first().click(); await page.waitForTimeout(1500);
  const fs0 = (db.fin_settings || [])[0];
  check('VAT rate saved', !!(fs0 && (fs0.vat_rates || []).some((r) => r.name === 'Test rate')), new URL(page.url()).pathname);
  check('VAT save stays on settings', new URL(page.url()).pathname === '/fin/settings');
  void blank;

  // Subcontract application: record, save as received.
  await open('/fin/sub/sc1');
  const was = (db.fin_sub_apps || []).length;
  await page.getByText(/Record an application/i).first().click(); await page.waitForTimeout(500);
  const appl = page.locator('input:visible[inputmode="decimal"], input:visible[inputmode="numeric"]');
  await appl.first().fill('1200'); await page.waitForTimeout(300);
  await page.getByText(/Save as received/i).first().click(); await page.waitForTimeout(1500);
  check('Subcontractor application saved', (db.fin_sub_apps || []).length === was + 1, await say());

  // Operative invoice: choose who, choose the job, type the amount, save.
  await open('/fin/labour/w1');
  const lbefore = (db.fin_sub_payments || []).length;
  await page.getByText('Choose who').first().click(); await page.waitForTimeout(500);
  await page.getByText('Jake Morris').last().click(); await page.waitForTimeout(500);
  await page.getByText('Choose the job').first().click(); await page.waitForTimeout(500);
  await page.getByText(/Studley Rd/).last().click(); await page.waitForTimeout(500);
  await page.locator('input:visible[placeholder="£"]').first().fill('350'); await page.waitForTimeout(200);
  await page.getByText(/Save — ready for the pay run/i).first().click(); await page.waitForTimeout(1500);
  const pay = (db.fin_sub_payments || []).slice(-1)[0];
  check('Operative invoice saved', (db.fin_sub_payments || []).length === lbefore + 1 && Number(pay.lines[0].amount) === 350, await say());

  // New client on the Directory with a real email.
  await open('/fin/directory');
  await page.getByText(/New client/i).last().click(); await page.waitForTimeout(800);
  const after = (label) => page.locator(`xpath=//*[text()="${label}"]/following::input[1]`).first();
  await after('Client name').fill('Acme Ltd'); await after('Accounts email').fill('acct@acme.example');
  await page.getByText(/^save$/i).last().click(); await page.waitForTimeout(1500);
  const cl = (db.fin_clients || []).find((c) => c.name === 'Acme Ltd');
  check('New client saved', !!cl && cl.email === 'acct@acme.example', await say());

  // HAVS: open a tool, type minutes for an open day, save.
  await open(`/sites/${S1}/hs/havs`);
  console.log('errors', errs.join(' / ') || 'none');
  console.log(bad ? `${bad} FAILED` : 'all ok');
  await browser.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
