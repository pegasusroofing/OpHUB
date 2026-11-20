// Andy's list of 18 Nov 2026, on a phone (375 wide, an iPhone): Home's calendar items in smaller words; Settings in
// plain rows with the phone number closed (tap to edit), no My Employee Record for a manager (it's in HR), Sign Out on
// its own; the Admin Centre as Finance (People · Libraries · Company tabs, plain rows, no footer of links); Job Numbers
// (automatic, optional prefix, the same setting as Finance); a new project's Client Name and Client Number side by side,
// a job number another job has refused with the job's name, what's missing said in a pop-up; amending a job's number
// to another job's says so; the job home's weather inside its box. Fake database. node day18-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'day18');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 375, height: 812}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me');
  Object.assign(me, {role: 'admin', finance_enabled: true, howto_dismissed: ['*'], phone: '07700 900111'});
  Object.assign(db.organizations[0], {has_pm: true, has_finance: true, auto_job_numbers: false, job_number_prefix: null, next_job_number: null});
  db.fin_clients = [{id: 'fc1', org_id: db.organizations[0].id, name: 'Bellway Homes', email: 'accounts@bellway.example', phone: '0191 000 0000', estimator_name: 'Sam Price', estimator_email: 'sam@bellway.example', estimator_phone: '07700 111111'}];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const vis = (sel) => page.locator(`${sel} >> visible=true`).first();
  const body = () => page.evaluate(() => document.body.innerText);
  const fillBy = async (label, v) => { await page.locator(`text="${label}"`).first().locator('xpath=following::input[1]').fill(v); };
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);

  // ---- Home's calendar: smaller words ----
  await page.goto(B + '/home'); await page.waitForTimeout(5000);
  const fsz = await page.evaluate(() => { const b = document.querySelector('[data-testid="home-week"] [aria-label^="Open "]'); const t = b && b.querySelector('div[dir="auto"]'); return t ? getComputedStyle(t).fontSize : ''; });
  check(fsz === '10.5px', `Home calendar: an item's words are smaller (${fsz}, was 12px)`);

  // ---- Settings ----
  await page.goto(B + '/account'); await page.waitForTimeout(4500);
  let t = await body();
  check(/Phone Number/.test(t) && /07700 900111/.test(t) && await page.locator('input[type="tel"] >> visible=true').count() === 0 && await page.locator('input >> visible=true').count() === 0, 'Settings: the phone number shows as a row, not an open box');
  check(!/My Employee Record/.test(t), 'Settings: no My Employee Record for a manager (it\'s in HR)');
  await page.screenshot({path: path.join(SHOTS, 'settings-phone.png'), fullPage: true});
  const so = await page.evaluate(() => { const s = [...document.querySelectorAll('[role="button"]')].find((b) => b.innerText.trim() === 'Sign Out'); const card = [...document.querySelectorAll('div')].find((d) => d.innerText.startsWith('Phone Number') && d.getBoundingClientRect().height < 80); let g = card; while (g && getComputedStyle(g).borderTopWidth === '0px') g = g.parentElement; return s && g ? {inCard: g.contains(s), gap: Math.round(s.getBoundingClientRect().top - g.getBoundingClientRect().bottom)} : null; });
  check(!!so && !so.inCard && so.gap > 8, `Settings: Sign Out on its own, under the card (${JSON.stringify(so)})`);
  await vis('[aria-label="Edit phone number"]').click(); await page.waitForTimeout(600);
  const box = vis('input[type="tel"]');
  check(await box.count() === 1, 'tapping Phone Number opens it to edit');
  await box.fill('07700 900222'); await page.getByText('Save', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(1500);
  check(me.phone === '07700 900222' && /07700 900222/.test(await body()) && await page.locator('input >> visible=true').count() === 0, 'saving closes it, the new number saved and shown');

  // ---- Admin Centre ----
  await page.goto(B + '/pm/admin'); await page.waitForTimeout(4500);
  t = await body();
  const tabs = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText.trim()));
  // The tabs since the later 18 Nov redo: People · Projects · (Finance) · H&S · Company.
  // (Then sub tabs: that tab's pages follow the main row.)
  check(tabs[0] === 'People' && tabs[1] === 'Projects' && tabs.includes('H&S') && tabs.includes('Company') && !tabs.includes('Libraries'),`Admin Centre: People, Projects, H&S and Company tabs, as Finance (${tabs.join(', ')})`);
  check(/Users\n/.test(t) && /Invites\n/.test(t) && /Roles\n/.test(t) && !/Users & invites/.test(t), 'People shows its rows straight away (Users, Invites, Roles)');
  check(!/Sign Out/.test(t) && !/My Signature/.test(t) && !/Finance \(Trial\)/.test(t), 'no footer of links (they\'re in Settings)');
  check(await page.evaluate(() => [...document.querySelectorAll('[role="button"]')].filter((b) => /^Users/.test(b.innerText.trim())).every((b) => !b.querySelector('svg') || b.querySelectorAll('svg').length === 1)), 'plain rows: no icon squares');
  await page.screenshot({path: path.join(SHOTS, 'admin-phone.png'), fullPage: true});
  await page.getByRole('tab', {name: 'Company'}).click(); await page.waitForTimeout(800);
  t = await body();
  check(/Set-Up Guide/.test(t), 'Company: the Set-Up Guide');
  await page.screenshot({path: path.join(SHOTS, 'admin-company-phone.png'), fullPage: true});
  await page.getByRole('tab', {name: 'Projects'}).click(); await page.waitForTimeout(800);
  check(/Job Numbers/.test(await body()), 'Projects: Job Numbers');
  await page.getByText('Job Numbers', {exact: true}).first().click(); await page.waitForTimeout(3000);
  check(new URL(page.url()).pathname === '/pm/admin/jobnumbers', 'Job Numbers opens');
  await page.getByLabel('Number new jobs automatically: Yes').or(page.getByText('Yes', {exact: true})).first().click(); await page.waitForTimeout(500);
  await fillBy('Prefix (Optional)', 'RTB-'); await fillBy('Next Number', '2700'); await page.waitForTimeout(300);
  check(/The next new job will be RTB-2700/.test(await body()), 'it says what the next job number will be');
  await page.screenshot({path: path.join(SHOTS, 'jobnumbers-phone.png')});
  await page.getByText('Save', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(2000);
  const o = db.organizations[0];
  check(o.auto_job_numbers === true && o.job_number_prefix === 'RTB-' && Number(o.next_job_number) === 2700, `saved on the company (${o.auto_job_numbers}, ${o.job_number_prefix}, ${o.next_job_number})`);
  await page.goto(B + '/fin/settings'); await page.waitForTimeout(4500);
  await page.getByText('Project numbers', {exact: true}).first().click(); await page.waitForTimeout(600);
  check(/Automatic · next RTB-2700/.test(await body()), 'Finance › Settings › Project numbers shows the same setting');
  // VAT rates: a built-in rate's % is words, not a box that won't type ("trying to edit vat rates ... it wouldn't let me").
  await page.getByText('VAT rates', {exact: true}).first().click(); await page.waitForTimeout(700);
  const vat = await page.evaluate(() => ({boxes: [...document.querySelectorAll('input')].filter((e) => e.getBoundingClientRect().width > 0 && /^\d+(\.\d+)?$/.test(e.value)).length, words: !!document.querySelector('[aria-label="20% VAT is 20%"]')}));
  check(vat.boxes === 0 && vat.words, `VAT rates: the built-in rates' % shown as words, no dead boxes (${JSON.stringify(vat)})`);
  await page.screenshot({path: path.join(SHOTS, 'vat-phone.png'), fullPage: true});
  // Automatic numbers: the Job Number box is blocked out, phone and laptop ("if job numbers are automatic, block out
  // manual entry in the cell ... same for laptop").
  const jobBox = () => page.evaluate(() => { const l = [...document.querySelectorAll('div[dir="auto"]')].find((x) => /^Job Number$|^Project number \*$/.test(x.textContent.trim()) && x.getBoundingClientRect().width > 0); const i = l && l.parentElement.querySelector('input'); return i ? {value: i.value, bg: getComputedStyle(i).backgroundColor, ro: i.readOnly, blocked: getComputedStyle(i.parentElement).pointerEvents === 'none' || getComputedStyle(i).pointerEvents === 'none'} : null; });
  for (const vp of [{width: 375, height: 812}, {width: 1300, height: 900}]) {
    await page.setViewportSize(vp);
    await page.goto(B + '/sites/new'); await page.waitForTimeout(4500);
    const jb = await jobBox();
    check(!!jb && /RTB-2700 \(given automatically\)/.test(jb.value) && jb.ro && jb.blocked && jb.bg === 'rgb(238, 240, 243)', `${vp.width < 800 ? 'phone' : 'laptop'}: automatic numbers, the Job Number box is greyed out and can't be typed in (${JSON.stringify(jb)})`);
    if (vp.width > 800) await page.screenshot({path: path.join(SHOTS, 'newjob-auto-laptop.png'), clip: {x: 0, y: 0, width: 1300, height: 600}});
    else await page.screenshot({path: path.join(SHOTS, 'newjob-auto-phone.png')});
  }
  await page.setViewportSize({width: 375, height: 812});
  // Back to typed numbers for the new-project checks.
  Object.assign(o, {auto_job_numbers: false});

  // ---- New project ----
  await page.goto(B + '/sites/new'); await page.waitForTimeout(4500);
  // Client on its own row; Contact Name and Contact Number half each; Contact Email under them (Andy, 18 Nov 2026).
  const lay = await page.evaluate(() => { const at = (l) => { const e = [...document.querySelectorAll('div[dir="auto"]')].find((x) => x.textContent.trim() === l && x.getBoundingClientRect().width > 0); return e ? e.getBoundingClientRect() : null; }; const c = at('Client Name *'), n = at('Contact Name'), p = at('Contact Number'), e = at('Contact Email'); return c && n && p && e ? {clientOwnRow: c.top < n.top - 20, split: Math.abs(n.top - p.top) < 3 && p.left > 160, emailUnder: e.top > n.top + 20} : null; });
  check(!!lay && lay.clientOwnRow && lay.split && lay.emailUnder, `Client on its own row, Contact Name and Contact Number side by side, Contact Email under (${JSON.stringify(lay)})`);
  await page.screenshot({path: path.join(SHOTS, 'newjob-phone.png'), fullPage: true});
  await fillBy('Site Name *', 'Flight House'); await fillBy('Address *', '1 Test Road'); await fillBy('Job Number', 'J101');
  // A client with several contacts (the Directory's main and estimating contacts, and a past project's): offered under
  // Contact Name, and picking one fills the number and email.
  await page.getByPlaceholder(/^Start typing/).fill('Bellway Homes'); await page.waitForTimeout(500); await page.mouse.click(5, 5); await page.waitForTimeout(500);
  check(/\d contacts on file for Bellway Homes/.test(await body()), 'a client with several contacts: it says so');
  await page.getByPlaceholder('Tap To Choose').click(); await page.waitForTimeout(600);
  t = await body();
  check(/Sam Price/.test(t) && /Main Contact/.test(t), `Contact Name lists the client's contacts (${t.split('\n').filter((x) => /Sam Price|Main Contact|Jo Site/.test(x)).join(' | ')})`);
  await page.screenshot({path: path.join(SHOTS, 'newjob-contacts-phone.png')});
  await page.getByText('Sam Price', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(600);
  const filled = await page.evaluate(() => [...document.querySelectorAll('input')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.value));
  check(filled.includes('Sam Price') && filled.includes('07700 111111') && filled.includes('sam@bellway.example'), `picking a contact fills the name, number and email (${filled.slice(4, 8).join(' | ')})`);
  await page.getByText('Create Project', {exact: true}).click(); await page.waitForTimeout(1200);
  t = await body();
  check(/Job number J101 is already used on Studley Rd/.test(t), 'a job number another job has is refused, with the job\'s name, in a pop-up');
  await page.screenshot({path: path.join(SHOTS, 'newjob-duplicate-phone.png')});
  await page.getByText('OK', {exact: true}).filter({visible: true}).first().click().catch(() => {}); await page.waitForTimeout(500);
  await fillBy('Job Number', 'J901');
  await page.getByText('Create Project', {exact: true}).click(); await page.waitForTimeout(1200);
  check(/Choose whether the job is Active or Upcoming/.test(await body()), 'what\'s missing (Active or Upcoming) in a pop-up');

  // ---- A job's settings: amending to another job's number ----
  await page.goto(B + '/sites/' + S1 + '/admin'); await page.waitForTimeout(4500);
  const setup = page.getByText(/^⚙ Site set up/i).first(); if (await setup.count()) { await setup.click(); await page.waitForTimeout(600); }
  const amend = page.getByText('Amend Site Name, Address & Job Number', {exact: true}).first();
  if (await amend.count()) {
    await amend.click(); await page.waitForTimeout(600);
    await page.locator('text="Job Number" >> xpath=following::input[1]').first().fill('J102');
    await page.getByText('Save', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(1200);
    check(/Job number J102 is already used on Cleveland Primary School/.test(await body()), 'amending a job\'s number to another job\'s says which job has it');
  } else check(false, 'found Amend Site Name, Address & Job Number');

  // ---- Job home: the weather stays in its box ----
  await page.goto(B + '/sites/' + S1); await page.waitForTimeout(6000);
  const wx = await page.evaluate(() => { const b = document.querySelector('[aria-label^="Weather:"]'); if (!b) return null; let card = b; while (card && getComputedStyle(card).borderTopWidth === '0px') card = card.parentElement; const r = b.getBoundingClientRect(), c = card.getBoundingClientRect(); return {right: Math.round(r.right), cardRight: Math.round(c.right), vw: innerWidth, text: b.innerText}; });
  check(!!wx && wx.right <= wx.cardRight && wx.right <= wx.vw, `job home: the weather stays inside its box (${JSON.stringify(wx)})`);
  await page.screenshot({path: path.join(SHOTS, 'jobhome-phone.png')});

  // ---- Laptop: the Admin Centre's tabs ----
  await page.setViewportSize({width: 1300, height: 900});
  await page.goto(B + '/pm/admin'); await page.waitForTimeout(4500);
  await page.screenshot({path: path.join(SHOTS, 'admin-laptop.png'), clip: {x: 0, y: 0, width: 1300, height: 700}});
  check((await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText.trim()))).filter((x) => ['People', 'Projects', 'Finance', 'H&S', 'Company'].includes(x)).length >= 4, 'laptop: the same main tabs');

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
