// The Application's certificate on its own tab (Andy, 21 Nov 2026: "Yes build it"). An applied application: Overview and
// Line By Line stay as sent; the Certificate tab has the import, the certified figures, one total or line by line, the
// pay-less tick, Save Certificate and Raise Invoice. Once saved, Overview shows the net due with Open The Certificate.
// Fake database (Finance trial: nothing is emailed or posted). node certtab21-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const SHOTS = path.join(__dirname, 'shots', 'certtab21'); require('fs').mkdirSync(SHOTS, {recursive: true});
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [w, h, tag] of [[1300, 900, 'laptop'], [390, 844, 'phone']]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: w, height: h}});
    seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
    require('./seeds/ex4')(db);
    const ap = db.fin_applications.find((a) => a.site_id === S1);
    Object.assign(ap, {status: 'submitted', cert_net: null, retention_pct: 5, lines: [{kind: 'section', description: 'Main Roof'}, {kind: 'item', item_id: 'it1', description: 'Strip and re-slate main roof', qty: 1, rate: 10000, value: 10000, pct: 50}]});
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const tab = (n) => page.getByRole('tab', {name: n, exact: true}).last();
    await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto(`http://localhost:8081/fin/job/${S1}/application/${ap.id}`); await page.waitForTimeout(6000);
    check(await tab('Certificate').count() > 0 && await tab('Line By Line').count() > 0, `${tag}: an applied application has Overview / Line By Line / Certificate`);
    let t = await text();
    check(/Enter The Certificate ›/.test(t) && !/Save Certificate/.test(t), `${tag}: Overview says Enter The Certificate (no certificate boxes there)`);
    await tab('Line By Line').click(); await page.waitForTimeout(1200);
    t = await text();
    check(!/Save Certificate/.test(t) && /Next: Certificate ›/.test(t), `${tag}: Line By Line is the application as sent, with Next: Certificate`);
    await tab('Certificate').click(); await page.waitForTimeout(1500);
    t = await text();
    check(/Client's Certificate/.test(t) && /Did The Client Certify One Total\?/.test(t) && /Save Certificate/.test(t) && /Save & Raise Invoice/.test(t) && /This Is A Pay-Less Notice/.test(t), `${tag}: the Certificate tab has the certificate, one-total question, pay-less tick, Save and Raise Invoice`);
    // One total: £4,000 gross; retention worked out at 5%.
    await page.getByText('Yes, One Total', {exact: true}).click(); await page.waitForTimeout(500);
    await page.getByLabel('Gross certified to date').fill('4000'); await page.waitForTimeout(500);
    t = await text();
    check(/Net Due £3,800\.00/.test(t) && /(Due|Due This Time) £3,800\.00/.test(t.replace('Net Due £3,800.00', '')), `${tag}: one total of £4,000 less 5% retention: Net Due £3,800.00, and the totals bar agrees`);
    await page.screenshot({path: path.join(SHOTS, `certificate-tab-${tag}.png`), fullPage: true});
    await page.getByText('Save Certificate', {exact: true}).first().click(); await page.waitForTimeout(5000);
    const saved = db.fin_applications.find((a) => a.id === ap.id);
    check(Number(saved.cert_gross) === 4000 && Number(saved.cert_retention) === 200 && Number(saved.cert_net) === 3800, `${tag}: saved (gross ${saved.cert_gross}, retention ${saved.cert_retention}, net ${saved.cert_net})`);
    await tab('Overview').click(); await page.waitForTimeout(1500);
    t = await text();
    check(/Net Due £3,800\.00/.test(t) && /Open The Certificate ›/.test(t), `${tag}: Overview shows the certified net due, with Open The Certificate`);
    await page.getByText('Open The Certificate ›', {exact: true}).click(); await page.waitForTimeout(1500);
    t = await text();
    check(/Raise Invoice|Open Invoice/.test(t) && /Change The Certificate/.test(t), `${tag}: the Certificate tab keeps the saved certificate with Raise Invoice`);
    await page.screenshot({path: path.join(SHOTS, `certified-${tag}.png`), fullPage: true});
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
