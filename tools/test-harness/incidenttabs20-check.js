// The incident report in tabs (Andy, 20 Nov 2026: "change the 7 items into tab style please"): Details · Injury · Damage ·
// Analysis, Next at the bottom, Sign & Submit on Analysis; a missing answer takes you to its tab. A phone; fake database.
// node incidenttabs20-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {howto_dismissed: ['*'], signature_path: 'sig/me.png'});
  db.incident_reports = [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const vis = (l) => page.locator(`text="${l}" >> visible=true`);
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(`${B}/sites/${S1}/hs/incidents/new`); await page.waitForTimeout(5000);
  let t = await text();
  const tabs = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((e) => e.innerText.trim()));
  check(JSON.stringify(tabs) === '["Details","Injury","Damage","Analysis"]', `tabs: ${tabs.join(' | ')}`);
  check(/What type of report is this/.test(t) && /Next: Injury ›/.test(t) && !/Sign & Submit Report/.test(t) && !/RIDDOR/.test(t), 'Details first, with Next: Injury ›; Sign & Submit waits for Analysis');
  await page.screenshot({path: path.join(__dirname, 'shots', 'incidenttabs20.png'), fullPage: true});
  await vis('Next: Injury ›').first().click(); await page.waitForTimeout(600);
  check(/Any injuries occurred/.test(await text()), 'Injury tab');
  await vis('Next: Damage ›').first().click(); await page.waitForTimeout(600);
  await vis('Next: Analysis ›').first().click(); await page.waitForTimeout(600);
  t = await text();
  check(/RIDDOR reportable/.test(t) && /Sign & Submit Report/.test(t), 'Analysis tab: RIDDOR and Sign & Submit Report');
  await vis('Sign & Submit Report').first().click(); await page.waitForTimeout(1200);
  t = await text();
  check(/Please choose whether this is an Incident, Accident or Near Miss/.test(t) && /What type of report is this/.test(t), 'a missing answer takes you back to Details, and says what');
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
