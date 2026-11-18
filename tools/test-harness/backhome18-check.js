// Back on a project's home screen goes to Home (Andy, 18 Nov 2026: "When I'm in the Home Screen of projects and I click
// back it needs to take me to the Home Screen"), coming from the Projects list too; a page inside the project still steps
// back to the project's home. A manager on a phone and on a laptop. Fake database. node backhome18-check.js
const {chromium, makeContext, S1} = require('./harness');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [w, h, dev] of [[390, 844, 'phone'], [1300, 900, 'laptop']]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: w, height: h}});
    require('./seeds/world')(db);
    Object.assign(db.profiles.find((p) => p.id === 'me'), {role: 'admin', howto_dismissed: ['*']});
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
    const back = async () => { await page.getByLabel('Back', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(3000); return new URL(page.url()).pathname; };
    // In a project, a page inside it steps back to the project's home.
    await page.goto(`${B}/sites`); await page.waitForTimeout(4000);
    await page.goto(`${B}/sites/${S1}/hs`); await page.waitForTimeout(4000);
    let at = await back();
    check(at === `/sites/${S1}`, `${dev}: Back from Health & Safety goes to the project's home (${at})`);
    at = await back();
    check(at === '/home', `${dev}: Back from the project's home goes to Home (${at})`);
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
