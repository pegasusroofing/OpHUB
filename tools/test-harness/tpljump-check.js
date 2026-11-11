// Choosing a saved email (Template) in the email pop-up on a phone doesn't jump the screen to the bottom, and nothing to
// type in gets selected (Andy, 11 Nov 2026). Invoice email on a touch phone, fake database.
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081', S1 = '11111111-1111-1111-1111-111111111111';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch();
  const {ctx, db} = await makeContext(browser, 'admin', [], {shot: true});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin';
  const O = db.organizations[0].id;
  db.fin_email_templates = [
    {id: 'et1', org_id: O, kind: 'invoice', name: 'Standard Invoice', subject: 'Invoice {number}', body: 'Hello,\n\nPlease find our invoice attached.\n\nThanks', is_default: true, show_logo: true, logos: []},
    {id: 'et2', org_id: O, kind: 'invoice', name: 'Final Account', subject: 'Final account {number}', body: 'Hello,\n\n' + 'Our final account is attached. '.repeat(30) + '\n\nThanks', is_default: false, show_logo: true, logos: []},
  ];
  const page = await ctx.newPage(); const errs = [];
  // Like an iPhone: tapping a button doesn't give it focus.
  await page.addInitScript(() => document.addEventListener('mousedown', (e) => { if (e.target.closest && e.target.closest('button,[role=button],[tabindex]') && !e.target.closest('input,textarea')) e.preventDefault(); }, true)); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(B + `/fin/job/${S1}/invoice/v8`); await page.waitForTimeout(5000);
  await page.getByText('Email Invoice', {exact: true}).first().click(); await page.waitForTimeout(1500);
  // Where everything is scrolled to, and what has focus.
  const where = () => page.evaluate(() => {
    const sc = [...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 5 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)).map((e) => Math.round(e.scrollTop));
    const a = document.activeElement;
    return {win: Math.round(window.scrollY), sc, active: a ? `${a.tagName}:${a.getAttribute('aria-label') || a.textContent.slice(0, 20)}` : ''};
  });
  const before = await where();
  await page.locator('[aria-label="Template"] >> visible=true').first().click(); await page.waitForTimeout(800);
  await page.getByText('Final Account', {exact: true}).last().click(); await page.waitForTimeout(1200);
  const after = await where();
  console.log('  before', JSON.stringify(before), '\n  after ', JSON.stringify(after));
  const subj = await page.locator('input >> visible=true').evaluateAll((els) => els.map((e) => e.value).join(' | '));
  check(/Final account/.test(subj), 'the saved email is chosen');
  check(after.win === before.win && after.sc.every((v, i) => v === (before.sc[i] ?? 0)), 'nothing scrolled');
  check(!/^(INPUT|TEXTAREA)/.test(after.active), 'nothing to type in is selected');
  await page.screenshot({path: path.join(__dirname, 'shots', 'andy11', 'tpl-after.png')});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
