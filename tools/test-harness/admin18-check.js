// The Admin Centre redone (Andy, 18 Nov 2026: "keep tab style but add into the main admin tabs for finance settings,
// then a project settings etc", then "can we make the admin centre more tab style please and sub tabs"). Tabs:
// People · Projects · Finance · H&S · Company; under them that tab's pages as sub tabs, and the page chosen straight
// under those. Finance's sub tabs group Finance's settings ("make less tabs": Sales, VAT & Overheads, Purchases, Cost
// Codes, Templates, Xero; Cost Codes and Templates without Finance's own tabs). Saving stays on the page. The 🔍 finds any page. Back leaves the Admin Centre. VAT rates one row each
// ("in use needs to be on the same row"). Someone without Finance has no Finance tab. Laptop and phone. Fake database.
// node admin18-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'admin18');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const MAIN = ['People', 'Projects', 'Finance', 'H&S', 'Company'];
const signIn = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
};
// Every visible tab, main row first, then the sub tabs; which is chosen (underlined).
const tabsOf = (page) => page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({t: e.innerText.trim(), on: getComputedStyle(e).borderBottomColor !== 'rgba(0, 0, 0, 0)'})));
const tab = (page, name) => page.getByRole('tab', {name, exact: true}).first();
const where = (page) => { const u = new URL(page.url()); return u.pathname + u.search; };
const setUp = async (browser, role, fin, viewport) => {
  const c = await makeContext(browser, role, [], {viewport});
  require('./seeds/world')(c.db);
  Object.assign(c.db.profiles.find((p) => p.id === 'me'), {role, finance_enabled: fin, howto_dismissed: ['*']});
  Object.assign(c.db.organizations[0], {has_pm: true, has_finance: true});
  c.db.fin_settings = [{org_id: c.db.organizations[0].id, invoice_prefix: 'INV-', next_invoice_number: 120, default_vat: 'standard', po_vat_default: '20'}];
  return c;
};

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = [];
  // ---- An admin with Finance, on a laptop ----
  const {ctx, db} = await setUp(browser, 'admin', true, {width: 1300, height: 900});
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const body = () => page.evaluate(() => document.body.innerText);
  await signIn(page);
  await page.goto(B + '/home'); await page.waitForTimeout(4000);
  await page.getByText('Admin', {exact: true}).filter({visible: true}).last().click(); await page.waitForTimeout(4000);
  let ts = await tabsOf(page);
  check(where(page) === '/pm/admin/invites', `Admin opens straight on People › Invites (${where(page)})`);
  check(JSON.stringify(ts.slice(0, 5).map((x) => x.t)) === JSON.stringify(MAIN) && ts[0].on, `tabs: ${MAIN.join(', ')}, People chosen (${ts.slice(0, 5).map((x) => x.t).join(', ')})`);
  const subs = ts.slice(5).map((x) => x.t);
  check(['Invites', 'Users', 'Roles', 'Material Costs For Operatives', 'Device Locks', 'Check-In Logs'].every((x) => subs.includes(x)) && !!ts.find((x) => x.t === 'Invites')?.on, `sub tabs: People's pages, Invites chosen (${subs.join(', ')})`);
  check(/Admin Centre/.test(await body()), 'the bar says Admin Centre');
  await page.screenshot({path: path.join(SHOTS, 'people-laptop.png')});

  // Finance: its first page opens under the tabs; the sub tabs are the parts of Finance's settings.
  await tab(page, 'Finance').click(); await page.waitForTimeout(3500);
  ts = await tabsOf(page);
  const fsubs = ts.slice(5).map((x) => x.t);
  const want = ['Sales', 'VAT & Overheads', 'Purchases', 'Cost Codes', 'Templates', 'Xero'];
  check(where(page) === '/pm/admin/finsettings?part=sales' && JSON.stringify(fsubs) === JSON.stringify(want), `Finance: six grouped sub tabs, Sales open (${where(page)}; missing ${want.filter((x) => !fsubs.includes(x)).join(', ') || 'none'})`);
  let t = await body();
  check(/INV-120/.test(t) && /On your invoices/i.test(t) && /Defaults for new projects/i.test(t) && !/Purchase orders/i.test(t), 'Sales: invoice numbers (INV-120), what goes on invoices, defaults; nothing from Purchases');
  await page.getByText('Edit', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(800);
  await page.getByLabel('Next invoice number').filter({visible: true}).first().fill('130');
  await page.getByText('Save', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(2000);
  check(Number(db.fin_settings[0].next_invoice_number) === 130 && where(page) === '/pm/admin/finsettings?part=sales', `it saves and stays (${db.fin_settings[0].next_invoice_number})`);
  await page.screenshot({path: path.join(SHOTS, 'invoice-numbers-laptop.png')});

  await tab(page, 'VAT & Overheads').click(); await page.waitForTimeout(3000);
  t = await body();
  check(where(page) === '/pm/admin/finsettings?part=vatohp' && /Company overheads/i.test(t) && /Default VAT On Sales/.test(t) && /\+ Add VAT rate/.test(t), 'VAT & Overheads: the VAT defaults and rates, and the overheads');
  await page.screenshot({path: path.join(SHOTS, 'vat-laptop.png'), fullPage: true});

  await tab(page, 'Cost Codes').click(); await page.waitForTimeout(4000);
  ts = await tabsOf(page);
  check(where(page) === '/pm/admin/fincodes?kind=codes' && !!ts.find((x) => x.t === 'Finance')?.on && !!ts.find((x) => x.t === 'Cost Codes')?.on && !ts.some((x) => x.t === 'Overview'), `Cost Codes under the Admin Centre's tabs, not Finance's (${where(page)})`);
  await page.screenshot({path: path.join(SHOTS, 'costcodes-laptop.png')});
  await tab(page, 'Templates').click(); await page.waitForTimeout(3500);
  check(where(page) === '/pm/admin/fintemplates' && !(await tabsOf(page)).some((x) => x.t === 'Overview'), `Templates likewise (${where(page)})`);

  // Projects › Job Numbers: Save stays, and says Saved.
  await tab(page, 'Projects').click(); await page.waitForTimeout(3500);
  check(where(page) === '/pm/admin/jobnumbers', `Projects opens on Job Numbers (${where(page)})`);
  await page.getByText('Yes', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(400);
  await page.getByPlaceholder('e.g. 2700').filter({visible: true}).first().fill('2701'); await page.waitForTimeout(300);
  await page.getByText('Save', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(2000);
  check(Number(db.organizations[0].next_job_number) === 2701 && where(page) === '/pm/admin/jobnumbers' && await page.getByText('Saved', {exact: true}).count() >= 1, `Job Numbers saves, stays, and says Saved (${db.organizations[0].next_job_number})`);
  await page.screenshot({path: path.join(SHOTS, 'projects-laptop.png')});

  // Back to Finance: the page you left there.
  await tab(page, 'Finance').click(); await page.waitForTimeout(3000);
  check(where(page) === '/pm/admin/fintemplates', `Finance opens on the page you left (${where(page)})`);

  await tab(page, 'H&S').click(); await page.waitForTimeout(3500);
  const hs = (await tabsOf(page)).slice(5).map((x) => x.t);
  check(['H&S Policy', 'RAMS Library', 'COSHH Library', 'Toolbox Talks Required', 'PPE Log'].every((x) => hs.includes(x)), `H&S sub tabs (${hs.join(', ')})`);
  await tab(page, 'Company').click(); await page.waitForTimeout(3500);
  const co = (await tabsOf(page)).slice(5).map((x) => x.t);
  check(['Company Logo & Theme', 'Expenses', 'OneDrive', 'Set-Up Guide'].every((x) => co.includes(x)) && !co.includes('OpHUB Finance'), `Company sub tabs (${co.join(', ')})`);

  // Back leaves the Admin Centre (the tabs don't pile up behind it).
  await page.getByLabel('Back', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(3000);
  check(new URL(page.url()).pathname === '/home', `Back goes to where you were before the Admin Centre (${where(page)})`);

  // 🔍
  await page.goto(B + '/pm/admin/users'); await page.waitForTimeout(4000);
  await page.getByLabel('Search the Admin Centre', {exact: true}).first().click(); await page.waitForTimeout(2500);
  await page.getByLabel('Search the Admin Centre').filter({visible: true}).last().fill('xero'); await page.waitForTimeout(600);
  check(/Finance › Settings/.test(await body()), 'search finds Xero under Finance');
  await page.getByText('Xero', {exact: true}).filter({visible: true}).last().click(); await page.waitForTimeout(3000);
  check(where(page) === '/pm/admin/finsettings?part=xero', `and opens it (${where(page)})`);
  // Old links.
  await page.goto(B + '/pm/admin?page=libraries'); await page.waitForTimeout(4000);
  check(where(page) === '/pm/admin/jobnumbers', `an old link to Libraries opens Projects (${where(page)})`);
  await page.goto(B + '/fin/settings'); await page.waitForTimeout(4500);
  t = await body();
  check(['Project numbers', 'Purchase orders', 'VAT rates', 'Invoice numbers', 'Xero', 'OneDrive'].every((x) => t.includes(x)), 'Finance › Settings keeps every part');
  await ctx.close();

  // ---- A phone ----
  const p = await setUp(browser, 'admin', true, {width: 390, height: 844});
  const pg = await p.ctx.newPage(); pg.on('pageerror', (e) => errs.push(e.message));
  await signIn(pg);
  await pg.goto(B + '/pm/admin'); await pg.waitForTimeout(4500);
  const fit = await pg.evaluate(() => [...document.querySelectorAll('[role="tab"]')].slice(0, 5).map((e) => [Math.round(e.getBoundingClientRect().left), Math.round(e.getBoundingClientRect().right), ((x) => x.scrollWidth <= x.clientWidth + 1)(e.querySelector('[dir="auto"]') || e)]));
  check(fit.length === 5 && fit[0][0] >= 0 && fit[4][1] <= 390 && fit.every((f) => f[2]), `phone: the five tabs across the screen, none cut (${JSON.stringify(fit)})`);
  await pg.screenshot({path: path.join(SHOTS, 'people-phone.png')});
  await tab(pg, 'Finance').click(); await pg.waitForTimeout(3000);
  await tab(pg, 'VAT & Overheads').click(); await pg.waitForTimeout(3000);
  // One row per rate: the name, its %, RC and In Use level.
  const rowY = await pg.evaluate(() => ['20% VAT name', '20% VAT is 20%', '20% VAT reverse charge: No', '20% VAT in use: Yes'].map((l) => { const e = document.querySelector(`[aria-label="${l}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }));
  check(rowY.every((y) => y !== null) && Math.max(...rowY) - Math.min(...rowY) <= 6, `phone: a VAT rate on one row, In Use too (${JSON.stringify(rowY)})`);
  await pg.screenshot({path: path.join(SHOTS, 'vat-phone.png'), fullPage: true});
  await p.ctx.close();

  // ---- A PM without Finance: no Finance tab ----
  const q = await setUp(browser, 'pm', false, {width: 1300, height: 900});
  const qp = await q.ctx.newPage(); qp.on('pageerror', (e) => errs.push(e.message));
  await signIn(qp);
  await qp.goto(B + '/pm/admin'); await qp.waitForTimeout(4500);
  const qt = (await tabsOf(qp)).map((x) => x.t);
  check(!qt.includes('Finance') && qt.includes('Projects') && qt.includes('H&S'), `a PM without Finance: no Finance tab (${qt.slice(0, 5).join(', ')})`);
  await q.ctx.close();

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
