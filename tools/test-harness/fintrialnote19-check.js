// Finance trial per company (Andy, 19 Nov 2026: "i am in rtb construction finance and its still saying its a trial ... we
// need it to be completely seperate"). The 🔒 Finance trial note on Finance's overview shows only for a company still on
// trial, not for one put live. Fake database, laptop size. node fintrialnote19-check.js
const {chromium, makeContext} = require('./harness');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const live of [false, true]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.finance_enabled = true;
    db.organizations[0].has_finance = true; db.organizations[0].finance_live = live;
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto(B + '/fin'); await page.waitForTimeout(5000);
    const t = await page.locator('body').innerText();
    check(/Finance trial — nothing is sent from Finance/.test(t) === !live, live ? 'a live company has no Finance trial note' : 'a company on trial still has the note');
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
