// Finance › Settings › Xero › Connect Xero (Andy, 20 Nov 2026: "when trying to connect with xero it just pops up
// not_configured"). Without the server's Xero keys it says so in plain words; with them, Xero opens in a new tab and
// OpHUB stays open (Xero's last page says "go back to OpHUB"). Fake database and server; nothing is sent.
// node xeroconnect20-check.js
const {chromium, makeContext} = require('./harness');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const XERO_URL = 'https://login.xero.com/identity/connect/authorize?response_type=code&client_id=TEST';
(async () => {
  const browser = await chromium.launch(); const errs = [];
  let configured = false;
  global.__fn = (name, body) => {
    if (name !== 'xero') return null;
    if (body.action === 'status') return {configured, connected: false, tenant_name: null};
    if (body.action === 'connect') return configured ? {url: XERO_URL} : {error: 'not_configured'};
    return null;
  };
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  db.profiles[0].howto_dismissed = ['*']; db.profiles[0].finance_enabled = true;
  await ctx.route(/login\.xero\.com/, (r) => r.fulfill({status: 200, contentType: 'text/html', body: '<html><body>Xero sign-in (test)</body></html>'}));
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  const open = async () => {
    await page.goto('http://localhost:8081/fin/settings'); await page.waitForTimeout(5000);
    if (!(await page.getByText('Connect Xero', {exact: true}).count())) { await page.getByText('Xero', {exact: true}).first().click(); await page.waitForTimeout(1200); }
  };
  // 1. No keys on the server: a plain message, and no stray tab left open.
  await open();
  const tabs0 = ctx.pages().length;
  await page.getByText('Connect Xero', {exact: true}).first().click(); await page.waitForTimeout(2500);
  const t = await page.locator('body').innerText();
  check(/Xero isn’t set up on the OpHUB server yet/.test(t) && !/not_configured/.test(t), 'without the server keys: says so in plain words, not "not_configured"');
  check(ctx.pages().length === tabs0, `no empty tab is left open (${ctx.pages().length} tabs)`);
  // 2. Keys set: Xero opens in a new tab and OpHUB stays where it was.
  configured = true;
  await open();
  const [xeroTab] = await Promise.all([ctx.waitForEvent('page', {timeout: 10000}), page.getByText('Connect Xero', {exact: true}).first().click()]);
  await xeroTab.waitForLoadState().catch(() => {}); await page.waitForTimeout(2000);
  check(xeroTab.url().startsWith('https://login.xero.com/'), `Xero's sign-in opens in a new tab (${xeroTab.url().slice(0, 60)})`);
  check(page.url().includes('/fin/settings'), `OpHUB stays open on Finance › Settings (${page.url().replace('http://localhost:8081', '')})`);
  await page.screenshot({path: 'shots/xeroconnect20.png'});
  check(!errs.length, `no page errors ${errs.join(' / ').slice(0, 300)}`);
  global.__fn = undefined;
  await browser.close();
})();
