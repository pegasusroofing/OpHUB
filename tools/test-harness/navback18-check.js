// The back arrow, one rule (Andy, 18 Nov 2026): "it needs to take me up a folder, unless I have clicked into it from
// somewhere else then take me back to where I clicked from then up a folder (ie if I click a finance tile in a project
// screen, then go back it needs to take me back to project screen then when I click back just up a folder)".
// Laptop, an admin with Finance; then an operative on a phone. Fake database. node navback18-check.js
const {chromium, makeContext, S1} = require('./harness');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const signIn = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
};
const at = (page) => { const u = new URL(page.url()); return u.pathname + u.search; };
// The Back arrow on top: pages kept open underneath have their own, covered by this one.
const back = async (page) => {
  await page.evaluate(() => {
    const top = [...document.querySelectorAll('[aria-label="Back"]')].find((e) => { const r = e.getBoundingClientRect(); if (!r.width) return false; const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && (e === hit || e.contains(hit)); });
    if (top) top.click();
  });
  await page.waitForTimeout(3000); return at(page);
};

(async () => {
  const browser = await chromium.launch(); const errs = [];
  // ---- An admin with Finance, on a laptop ----
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  Object.assign(db.profiles.find((p) => p.id === 'me'), {role: 'admin', finance_enabled: true, howto_dismissed: ['*']});
  Object.assign(db.organizations[0], {has_pm: true, has_finance: true});
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await signIn(page);
  // Andy's example: the finance tile on a project, back to the project, then up (Home).
  await page.goto(`${B}/sites/${S1}`); await page.waitForTimeout(5000);
  await page.getByLabel('Open project finance').first().click(); await page.waitForTimeout(4000);
  check(at(page).startsWith(`/fin/job/${S1}`), `the finance tile opens the project's finance (${at(page)})`);
  let w = await back(page);
  check(w === `/sites/${S1}`, `back: to the project screen it was clicked from (${w})`);
  w = await back(page);
  check(w === '/sites', `back again: up a level, to Projects (${w})`);
  w = await back(page);
  check(w === '/home', `and from Projects, up to Home (${w})`);
  // Inside Finance: tabs don't stack up; back goes up a level.
  await page.goto(`${B}/fin`); await page.waitForTimeout(4500);
  await page.getByRole('tab', {name: 'Purchases'}).first().click(); await page.waitForTimeout(2500);
  await page.getByRole('tab', {name: 'Sales'}).first().click(); await page.waitForTimeout(2500);
  w = await back(page);
  check(w === '/fin', `Finance › Sales after Purchases: back goes up to the Overview, not to Purchases (${w})`);
  // Deep in a project: one level at a time.
  await page.goto(`${B}/sites/${S1}/hs/rams`); await page.waitForTimeout(4500);
  w = await back(page);
  check(w === `/sites/${S1}/hs`, `RAMS: back to Health & Safety (${w})`);
  w = await back(page);
  check(w === `/sites/${S1}`, `Health & Safety: back to the project (${w})`);
  await ctx.close();

  // ---- An operative on a phone ----
  const o = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(o.db);
  Object.assign(o.db.profiles.find((p) => p.id === 'me'), {howto_dismissed: ['*'], finance_enabled: false});
  if (!o.db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) o.db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
  const op = await o.ctx.newPage(); op.on('pageerror', (e) => errs.push(e.message));
  await signIn(op);
  await op.goto(`${B}/sites/${S1}/hs/rams`); await op.waitForTimeout(4500);
  w = await back(op);
  check(w === `/sites/${S1}/hs`, `operative, RAMS: back to Health & Safety (${w})`);
  w = await back(op);
  check(w === `/sites/${S1}`, `operative: back to the project (${w})`);
  // The project asks for signatures first: Not now.
  await op.getByText('Not now', {exact: true}).first().click({timeout: 3000}).catch(() => {}); await op.waitForTimeout(600);
  w = await back(op);
  check(w === '/sites', `operative: back from the project up to Projects (${w})`);
  await o.ctx.close();

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
