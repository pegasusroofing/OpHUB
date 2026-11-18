// The beta's sign-up links (Andy, 18 Nov 2026: "The sign up link in the beta is still a html, can we change that for beta
// but keep the html link live for old original app?"). In the new app on the web: Admin › Subcontractor Sign-Up gives
// <this address>/subcontractor?org=…, and invite links <this address>/join/…, not the .html pages. The new sign-up page
// works signed out: it asks the same questions, flags what's missing, uploads the documents and sends the application to
// the same server function (caught here: nothing is sent). Fake database. node subsignup18-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'subsignup18');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = [];
  // ---- The links, for an admin on a laptop ----
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
  const O = me.org_id;
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const body = () => page.evaluate(() => document.body.innerText);
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  await page.goto(B + '/pm/admin/subapps'); await page.waitForTimeout(4000);
  let t = await body();
  check(t.includes(`${B}/subcontractor?org=${O}`) && !t.includes('subcontractor.html'), 'Subcontractor Sign-Up: the link is the new app\'s page, not subcontractor.html');
  db.invites.push({id: 'perm1', org_id: O, role: 'operative', is_reusable: true, use_count: 0, created_by: 'me', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 864e8).toISOString()});
  await page.goto(B + '/pm/admin/invites'); await page.waitForTimeout(4000);
  t = await page.evaluate(() => [...document.querySelectorAll('input, textarea')].map((i) => i.value).join(' ')); // the link sits in a box
  check(t.includes(`${B}/join/`) && !t.includes('app.html#'), `invite links open the new app's join page (${(t.match(/\S*\/join\/\S*/) || [''])[0]})`);
  // Room above One-Time Invite, and Copy Link says it's copied ("it doesn't animate that anything has been copied").
  const gap = await page.evaluate(() => {
    const h = [...document.querySelectorAll('div[dir="auto"]')].find((e) => /^One-Time Invite$/i.test(e.textContent.trim()));
    const btns = [...document.querySelectorAll('[role="button"]')].filter((b) => b.getBoundingClientRect().bottom <= (h?.getBoundingClientRect().top ?? 0));
    return h && btns.length ? Math.round(h.getBoundingClientRect().top - Math.max(...btns.map((b) => b.getBoundingClientRect().bottom))) : null;
  });
  check(gap !== null && gap >= 18, `room above One-Time Invite (${gap}px)`);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: B});
  await page.getByText('Copy Link', {exact: true}).first().click(); await page.waitForTimeout(400);
  check(await page.getByText('Copied ✓', {exact: true}).count() === 1, 'Copy Link changes to Copied ✓');
  await page.screenshot({path: path.join(SHOTS, 'invites-copied-laptop.png')});
  await page.waitForTimeout(2200);
  check(await page.getByText('Copied ✓', {exact: true}).count() === 0, 'and back to Copy Link after a moment');
  await ctx.close();

  // ---- The form, signed out, on a phone ----
  const p = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(p.db);
  const sent = [];
  await p.ctx.route(/functions\/v1\/subcontractor-apply/, (r) => {
    const b = JSON.parse(r.request().postData() || '{}'); sent.push(b);
    const out = b.action === 'org' ? {name: 'RTB Roofing', colour: '#E3262B'} : b.action === 'upload' ? {uploads: b.files.map((f, i) => ({signedUrl: `https://upload.example/u${i}`, path: `apps/${b.key}/${f.name}`}))} : {ok: true};
    r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(out)});
  });
  let puts = 0;
  await p.ctx.route(/upload\.example/, (r) => { puts += 1; r.fulfill({status: 200, body: '{}'}); });
  const pg = await p.ctx.newPage(); pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(`${B}/subcontractor?org=${O}`); await pg.waitForTimeout(5000);
  t = await pg.evaluate(() => document.body.innerText);
  check(/RTB Roofing — Subcontractor Sign-Up/.test(t) && /1\. Your Company/.test(t) && /Declaration/.test(t), 'signed out, the form opens with the company\'s name');
  await pg.screenshot({path: path.join(SHOTS, 'form-phone.png')});
  await pg.getByText('Submit', {exact: true}).click(); await pg.waitForTimeout(600);
  check(/Please fill in the questions marked in red/.test(await pg.evaluate(() => document.body.innerText)) && !sent.some((s) => s.action === 'submit'), 'Submit with nothing filled in: asks for the questions in red, sends nothing');
  const fill = (l, v) => pg.getByLabel(l, {exact: true}).fill(v);
  const pick = async (l, v) => { await pg.getByLabel(l, {exact: true}).first().click(); await pg.waitForTimeout(400); await pg.getByText(v, {exact: true}).last().click(); await pg.waitForTimeout(300); };
  await fill('Company Name', 'Acme Roofing Ltd');
  await pick('Business Type', 'Limited company');
  await pick('CIS Status', 'Gross payment');
  await fill('Business Address', '1 High Street, Leeds');
  await fill('Postcode', 'LS1 1AA');
  await fill('Your Name', 'Sam Acme'); await fill('Email', 'sam@acme.example'); await fill('Mobile', '07700 900333');
  await pg.getByLabel('Leadwork', {exact: true}).click();
  await pick('Public Liability Cover', '£2 million');
  await pg.getByLabel('Public Liability Expiry', {exact: true}).click(); await pg.waitForTimeout(500);
  await pg.getByLabel('Next month', {exact: true}).last().click(); await pg.waitForTimeout(300);
  const day = await pg.evaluate(() => [...document.querySelectorAll('[role="button"][aria-label]')].map((e) => e.getAttribute('aria-label')).find((l) => /\b15\b/.test(l) && /\d{4}/.test(l)));
  await pg.getByLabel(day, {exact: true}).click(); await pg.waitForTimeout(400);
  for (const [l, a] of [['Do You Have A Written Health & Safety Policy?', 'Yes'], ['Can You Produce Your Own RAMS?', 'Yes'], ['Any RIDDOR-Reportable Incidents In The Last 3 Years?', 'No'], ['Any HSE Improvement / Prohibition Notices In The Last 3 Years?', 'No']]) await pg.getByLabel(`${l}: ${a}`, {exact: true}).click();
  const [chooser] = await Promise.all([pg.waitForEvent('filechooser'), pg.getByLabel('Choose Public Liability Certificate', {exact: true}).click()]);
  await chooser.setFiles({name: 'pl-cert.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test')}); await pg.waitForTimeout(600);
  check(/pl-cert\.pdf/.test(await pg.evaluate(() => document.body.innerText)), 'the chosen certificate shows by its name');
  await fill('Operative 1 name', 'Joe Bloggs');
  await pg.getByLabel('I confirm the declaration', {exact: true}).click();
  await fill('Type your full name to sign', 'Sam Acme');
  await pg.getByText('Submit', {exact: true}).click(); await pg.waitForTimeout(3000);
  t = await pg.evaluate(() => document.body.innerText);
  const sub = sent.find((s) => s.action === 'submit');
  check(/Thanks — That's Sent/.test(t) && /sam@acme\.example/.test(t), 'sent: the thank-you, with where the copy went');
  check(!!sub && sub.org === O && sub.data.company_name === 'Acme Roofing Ltd' && sub.data.trades.includes('Leadwork') && sub.data.pl_cover === '£2 million' && /^\d{4}-\d{2}-15$/.test(sub.data.pl_expiry || '') && sub.data.operatives.length === 1 && sub.data.operatives[0].name === 'Joe Bloggs' && sub.signed_name === 'Sam Acme' && sub.agree === true,
    `the application as the old form sends it (${sub ? JSON.stringify({c: sub.data.company_name, t: sub.data.trades, e: sub.data.pl_expiry, o: sub.data.operatives.length}) : 'nothing sent'})`);
  check(puts === 1 && sub?.files?.length === 1 && sub.files[0].label === 'Public liability certificate' && sub.files[0].path.endsWith('pl-cert.pdf'), `the certificate uploaded, and listed on the application (${puts} upload)`);
  await pg.screenshot({path: path.join(SHOTS, 'sent-phone.png')});
  await p.ctx.close();

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
