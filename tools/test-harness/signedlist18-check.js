// To Do (was "To Sign / Do"), Andy 18–19 Nov 2026:
// - "the hub bit to do isn't working as ive signed coshh but asking me to sign still as if outstanding": a signed COSHH
//   drops off the list straight away (no reload);
// - "give some context in the to sign / do (change to to do) ie what rams need signing, if superseeeded rams been
//   issued": each document by name, with why (new, new version replacing X, yearly re-sign);
// - "I don't need messages to the operatives as there is now for new rams": no "needs signing" notices in Messages.
// The tabs are Finance-style (underlined). An operative on a phone. Fake database. node signedlist18-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me');
  Object.assign(me, {howto_dismissed: ['*'], finance_enabled: false, signature_path: 'sig/me.png'});
  if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
  const now = new Date().toISOString();
  // A RAMS replaced by a new version.
  db.rams_docs = [
    {id: 'r0', site_id: S1, org_id: me.org_id, name: 'Roof Strip RAMS v1', storage_path: 'x/r0.pdf', status: 'superseded', created_at: now, uploaded_at: now, subcontractor_company_id: null},
    {id: 'r1', site_id: S1, org_id: me.org_id, name: 'Roof Strip RAMS v2', storage_path: 'x/r1.pdf', status: 'current', supersedes: 'r0', created_at: now, uploaded_at: now, subcontractor_company_id: null},
  ];
  db.toolbox_talks = [];
  db.messages = [
    {id: 'm1', org_id: me.org_id, site_id: S1, audience: 'operatives', kind: 'doc_needs_signing', parent_id: null, sender_id: 'p1', body: 'New RAMS published and needs signing: "Roof Strip RAMS v2"', created_at: now},
    {id: 'm2', org_id: me.org_id, site_id: S1, audience: 'operatives', kind: 'message', parent_id: null, sender_id: 'p1', body: 'Morning all, scaffold is up', created_at: now},
  ];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  await page.goto(B + '/inbox?tab=todo'); await page.waitForTimeout(5000);
  let t = await page.evaluate(() => document.body.innerText);
  check(/Sign COSHH: Paint/.test(t) && /New — not signed yet/.test(t), 'To Do names the COSHH, and says it is new');
  check(/Sign RAMS: Roof Strip RAMS v2/.test(t) && /New version — replaces "Roof Strip RAMS v1"/.test(t), 'and the new RAMS, saying which one it replaces');
  const tabs = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  check(tabs.some((x) => /^To Do/.test(x)) && !tabs.some((x) => /To Sign/.test(x)) && tabs.some((x) => /^Messages/.test(x)) && tabs.some((x) => /^Company Chat/.test(x)), `Finance-style tabs, To Do (${tabs.join(' | ')})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'signedlist18-before.png')});
  // Messages: the team message, not the "needs signing" notice.
  await page.getByRole('tab').filter({hasText: /^Messages/}).first().click(); await page.waitForTimeout(2500);
  t = await page.evaluate(() => document.body.innerText);
  check(/Morning all, scaffold is up/.test(t) && !/needs signing/.test(t), 'Messages: no "needs signing" notice, the team message still there');
  await page.screenshot({path: path.join(__dirname, 'shots', 'signedlist18-messages.png')});
  await page.getByRole('tab').filter({hasText: /^To Do/}).first().click(); await page.waitForTimeout(2000);
  await page.getByText(/Sign COSHH: Paint/).first().click(); await page.waitForTimeout(4500);
  await page.getByText(/^Sign All COSHH Documents/).first().click(); await page.waitForTimeout(800);
  const yes = page.getByText(/^(Sign|Yes, Sign|Yes)$/).filter({visible: true});
  if (await yes.count()) { await yes.last().click(); }
  await page.waitForTimeout(2500);
  check((db.coshh_signatures || []).some((s) => s.coshh_id === 'c1' && s.user_id === 'me'), 'signed');
  // Back to the list it was opened from, in the app (no reload).
  await page.evaluate(() => { const top = [...document.querySelectorAll('[aria-label="Back"]')].find((e) => { const r = e.getBoundingClientRect(); if (!r.width) return false; const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (e === h || e.contains(h)); }); if (top) top.click(); });
  await page.waitForTimeout(3500);
  t = await page.evaluate(() => document.body.innerText);
  check(new URL(page.url()).pathname === '/inbox' && !/Sign COSHH/.test(t) && /Sign RAMS: Roof Strip RAMS v2/.test(t), `back on To Do, the COSHH has gone and the RAMS is still there (${new URL(page.url()).pathname})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'signedlist18-after.png')});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
