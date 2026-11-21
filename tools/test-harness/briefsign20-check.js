// Subcontractors' daily briefings signed by the operatives chosen (Andy, 20 Nov 2026: "sub contractors for a company need to
// sign daily breifings should they be selected"). On a phone: their admin logs a briefing and picks who must sign; each
// briefing shows who has signed; a chosen operative taps to sign; an unsigned one is on their To Do. Fake database.
// node briefsign20-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {name: 'Dan Price', howto_dismissed: ['*'], finance_enabled: false, signature_path: 'sig/me.png'});
  const O = me.org_id;
  if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
  db.subcontractor_companies = [{id: 'co1', org_id: O, site_id: S1, name: 'Pro Finish Decorators Ltd', created_at: '2026-11-01T09:00:00Z'}];
  db.subcontractor_operatives = [{id: 'so1', site_id: S1, subcontractor_company_id: 'co1', user_id: 'me', is_admin: true}, {id: 'so2', site_id: S1, subcontractor_company_id: 'co1', user_id: 'o1', is_admin: false}];
  db.subcontractor_briefings = []; db.subcontractor_briefing_signatures = [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1/briefings`); await page.waitForTimeout(5000);
  let t = await text();
  check(/Who Must Sign/.test(t) && /Dan Price/.test(t) && /Jake Morris/.test(t), 'Log A Briefing: Who Must Sign lists their operatives, ticked');
  await page.getByPlaceholder('e.g. Monday morning briefing').fill('Monday briefing — scaffold changes');
  await page.getByText('Jake Morris', {exact: true}).last().click(); await page.waitForTimeout(300);
  await page.getByText('Log Briefing', {exact: true}).click(); await page.waitForTimeout(3000);
  const b = db.subcontractor_briefings[0];
  check(!!b && JSON.stringify(b.signers) === '["me"]', `logged with who must sign (${JSON.stringify(b && b.signers)})`);
  t = await text();
  check(/SIGNED \(0\)/i.test(t) && /OUTSTANDING \(1\)/i.test(t) && /✍ Tap To Sign/.test(t), 'the briefing shows who’s still to sign, and Tap To Sign for me');
  // On my To Do.
  await page.goto(`${B}/inbox?tab=todo`); await page.waitForTimeout(6000);
  check(/Sign Daily Briefing: Monday briefing — scaffold changes/.test(await text()), 'it’s on my To Do');
  await page.getByText(/Sign Daily Briefing: Monday briefing/).first().click(); await page.waitForTimeout(4000);
  check(/\/mc\/subcontractors\/co1\/briefings/.test(page.url()), 'tapping it opens the briefings');
  await page.getByText('✍ Tap To Sign', {exact: true}).first().click(); await page.waitForTimeout(3000);
  check(db.subcontractor_briefing_signatures.some((x) => x.briefing_id === b.id && x.user_id === 'me' && x.signature_image_path === 'sig/me.png'), 'signed with my signature');
  t = await text();
  check(/SIGNED \(1\)/i.test(t) && /Everyone has signed/.test(t) && !/✍ Tap To Sign/.test(t), 'now it shows signed');
  await page.screenshot({path: path.join(__dirname, 'shots', 'briefsign20.png'), fullPage: true});
  await page.goto(`${B}/inbox?tab=todo`); await page.waitForTimeout(6000);
  check(!/Sign Daily Briefing/.test(await text()), 'and it’s gone from my To Do');
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
