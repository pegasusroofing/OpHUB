// A signed COSHH drops off the to-do lists straight away (Andy, 18 Nov 2026: "the hub bit to do isn't working as ive
// signed coshh but asking me to sign still as if outstanding"). An operative: To Sign / Do lists the COSHH; they open
// it, Sign All; back on To Sign / Do (no reload) it has gone. Also the Messages & tasks tabs are Finance-style
// (underlined). Phone. Fake database. node signedlist18-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  Object.assign(db.profiles.find((p) => p.id === 'me'), {howto_dismissed: ['*'], finance_enabled: false, signature_path: 'sig/me.png'});
  if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
  db.rams_docs = []; db.toolbox_talks = [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  await page.goto(B + '/inbox?tab=todo'); await page.waitForTimeout(5000);
  let t = await page.evaluate(() => document.body.innerText);
  check(/COSHH to sign \(1\)/.test(t), 'To Sign / Do lists the COSHH');
  const tabs = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  check(tabs.some((x) => /^To Sign \/ Do/.test(x)) && tabs.some((x) => /^Messages/.test(x)) && tabs.some((x) => /^Company Chat/.test(x)), `Finance-style tabs (${tabs.join(' | ')})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'signedlist18-before.png')});
  await page.getByText(/COSHH to sign \(1\)/).first().click(); await page.waitForTimeout(4500);
  await page.getByText(/^Sign All COSHH Documents/).first().click(); await page.waitForTimeout(800);
  const yes = page.getByText(/^(Sign|Yes, Sign|Yes)$/).filter({visible: true});
  if (await yes.count()) { await yes.last().click(); }
  await page.waitForTimeout(2500);
  check((db.coshh_signatures || []).some((s) => s.coshh_id === 'c1' && s.user_id === 'me'), 'signed');
  // Back to the list it was opened from, in the app (no reload).
  await page.evaluate(() => { const top = [...document.querySelectorAll('[aria-label="Back"]')].find((e) => { const r = e.getBoundingClientRect(); if (!r.width) return false; const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (e === h || e.contains(h)); }); if (top) top.click(); });
  await page.waitForTimeout(3500);
  t = await page.evaluate(() => document.body.innerText);
  check(new URL(page.url()).pathname === '/inbox' && !/COSHH to sign/.test(t), `back on To Sign / Do, the COSHH has gone (${new URL(page.url()).pathname})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'signedlist18-after.png')});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
