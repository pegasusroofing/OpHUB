// Andy's RAMS notes of 14 Nov 2026 on a touch phone, fake database:
//  1. "Ask Outstanding To Sign" on one line, with Export and Email as smaller buttons on the same row;
//  2. the builder's Reuse part is one compact row;
//  3. Create RAMS on a job that already has RAMS asks: supersede one of them, or additional to them (and issuing then
//     marks the chosen ones superseded);
//  4. the ticked-RAMS Export / Email bar stays at the bottom of the screen while scrolling, and goes on other screens.
// node rams14-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081', S1 = '11111111-1111-1111-1111-111111111111';
const SHOTS = path.join(__dirname, 'shots', 'rams14'); require('fs').mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {shot: true});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*'];
  db.rams_docs = [1, 2, 3, 4].map((i) => ({id: 'rx' + i, site_id: S1, org_id: me.org_id, name: (i % 2 ? 'Risk Assessment — Roof ' : 'Method Statement — Roof ') + i, storage_path: 'x/r' + i + '.pdf', status: 'current', doc_type: i % 2 ? 'Risk Assessment' : 'Method Statement', subcontractor_company_id: null, uploaded_at: '2026-11-0' + i + 'T08:00:00Z', created_at: '2026-11-0' + i + 'T08:00:00Z'}));
  db.rams_builds = [{id: 'b1', org_id: me.org_id, site_id: S1, title: 'Roof 1', status: 'issued', revision: 1, ra_doc_id: 'rx1', ms_doc_id: 'rx2', details: {}, hazards: [{id: 'h1', title: 'Work at height'}], sections: [{id: 's1', part: 'method', title: 'Strip'}], ppe: [], updated_at: '2026-11-02T08:00:00Z'}];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  const vis = (sel) => page.locator(`${sel} >> visible=true`);
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(B + `/sites/${S1}/hs/rams`); await page.waitForTimeout(5000);

  // ---- 1. Ask / Export / Email row ----
  const ask = vis('text="🔔 Ask Outstanding To Sign"').first(), ex = vis('text="Export"').last(), em = vis('text="Email"').last();
  await ask.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
  const a = await ask.boundingBox(), e = await ex.boundingBox(), m = await em.boundingBox();
  check(a.height < 22 && Math.abs(a.y - e.y) < 2 && Math.abs(a.y - m.y) < 2, `Ask Outstanding To Sign on one line, level with Export and Email (text ${Math.round(a.height)}px high)`);
  const btnH = await ask.evaluate((el) => el.closest('[role="button"]').getBoundingClientRect().height);
  check(btnH <= 32, `the buttons are the smaller size (${Math.round(btnH)}px)`);
  await page.screenshot({path: path.join(SHOTS, 'after-ask-row.png')});

  // ---- 4. the ticked bar ----
  await page.evaluate(() => window.scrollTo(0, 0)); await page.mouse.wheel(0, -3000); await page.waitForTimeout(500);
  const boxes = vis('[role="checkbox"]');
  for (let i = 0; i < 3; i++) { await boxes.nth(i).click(); await page.waitForTimeout(300); }
  await page.waitForTimeout(500);
  const bar = page.getByText(/^3 Selected$/).first();
  const vh = page.viewportSize().height;
  const y0 = (await bar.boundingBox()).y;
  await page.mouse.wheel(0, 900); await page.waitForTimeout(700);
  const y1 = (await bar.boundingBox()).y;
  await page.mouse.wheel(0, 3000); await page.waitForTimeout(700);
  const y2 = (await bar.boundingBox()).y;
  check(y0 > vh - 200 && Math.abs(y1 - y0) < 2 && Math.abs(y2 - y0) < 2, `the bar stays at the bottom while scrolling (${Math.round(y0)}, ${Math.round(y1)}, ${Math.round(y2)} of ${vh})`);
  await page.screenshot({path: path.join(SHOTS, 'after-ticked-scrolled.png')});
  await page.goto(B + `/sites/${S1}/hs/rams/new`); await page.waitForTimeout(4000);
  check(await page.getByText(/^\d+ Selected$/).count() === 0, 'the bar isn\'t left showing on the next screen');

  // ---- 3. supersede or additional ----
  const before = db.rams_builds.length;
  await vis('text="Create RAMS"').last().click(); await page.waitForTimeout(900);
  let t = await page.locator('body').innerText();
  check(/This Job Has 4 RAMS: Supersede One, Or Add To Them\?/.test(t) && /Additional To The Existing RAMS/.test(t) && /Supersedes: Roof 1 \(Risk Assessment \+ Method Statement\)/.test(t) && /Supersedes: Risk Assessment — Roof 3/.test(t) && /Supersedes: Method Statement — Roof 4/.test(t) && !/Supersedes: Risk Assessment — Roof 1/.test(t),
    'Create asks: additional, or supersede Roof 1 (RA + MS together) or one of the uploaded ones');
  await page.screenshot({path: path.join(SHOTS, 'after-supersede-ask.png')});
  await vis('[aria-label="Close"][role="button"]').last().click(); await page.waitForTimeout(800);
  check(db.rams_builds.length === before, 'the ✕ creates nothing');
  await vis('text="Create RAMS"').last().click(); await page.waitForTimeout(900);
  await page.getByText(/Supersedes: Roof 1/).first().click(); await page.waitForTimeout(4000);
  const nb = db.rams_builds[db.rams_builds.length - 1];
  check(db.rams_builds.length === before + 1 && nb.ra_doc_id === 'rx1' && nb.ms_doc_id === 'rx2', 'Supersedes Roof 1: the new RAMS is set to take over its RA and MS');
  check(/\/hs\/rams\/build\//.test(page.url()), 'and the builder opens');
  // Fill it in (fake database) and issue it.
  Object.assign(nb, {details: {...(nb.details || {}), clientContact: 'Sue', description: 'New roof', startDate: '2026-11-20'}, hazards: [{id: 'h9', title: 'Work at height', harm: 'Falls', p: 3, s: 4, rp: 1, rs: 4, controls: ['Edge protection']}], sections: [{id: 's9', part: 'method', title: 'Strip', body: 'Strip the roof', steps: []}]});
  await page.reload(); await page.waitForTimeout(4500);
  await vis('text="Issue"').first().click(); await page.waitForTimeout(800);
  t = await page.locator('body').innerText();
  check(/It supersedes the RAMS you chose when you created it/.test(t), 'Issue tab says it supersedes the chosen RAMS');
  // ---- 2. Reuse row ----
  const reuse = vis('text="📋 Save As Template"').first(); await reuse.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
  const rb = await reuse.boundingBox(), rl = await vis('text="Reuse"').first().boundingBox();
  const card = await reuse.evaluate((el) => { let n = el; for (let i = 0; i < 8 && n; i++) { n = n.parentElement; if (n && getComputedStyle(n).borderTopLeftRadius !== '0px' && n.getBoundingClientRect().width > 300) return n.getBoundingClientRect().height; } return 0; });
  check(rb.x > rl.x + 100 && card > 0 && card < 110, `Reuse: one compact row with the button on the right (${Math.round(card)}px high)`);
  await page.screenshot({path: path.join(SHOTS, 'after-issue-tab.png')});
  await vis('text="✓ Issue Risk Assessment & Method Statement"').first().click(); await page.waitForTimeout(800);
  t = await page.locator('body').innerText();
  check(/The RAMS it supersedes is marked superseded/.test(t), 'the Issue question says the old one is superseded');
  await page.getByText('Issue', {exact: true}).last().click(); await page.waitForTimeout(7000);
  const old1 = db.rams_docs.find((x) => x.id === 'rx1'), old2 = db.rams_docs.find((x) => x.id === 'rx2');
  const fresh = db.rams_docs.filter((x) => x.supersedes === 'rx1' || x.supersedes === 'rx2');
  check(old1.status === 'superseded' && old2.status === 'superseded' && fresh.length === 2 && db.rams_docs.find((x) => x.id === 'rx3').status === 'current', 'issuing supersedes Roof 1\'s RA and MS (and leaves the others)');

  // ---- 3b. additional ----
  await page.goto(B + `/sites/${S1}/hs/rams/new`); await page.waitForTimeout(4500);
  const n2 = db.rams_builds.length;
  await vis('text="Create RAMS"').last().click(); await page.waitForTimeout(900);
  await page.getByText('➕ Additional To The Existing RAMS', {exact: true}).first().click(); await page.waitForTimeout(4000);
  const ab = db.rams_builds[db.rams_builds.length - 1];
  check(db.rams_builds.length === n2 + 1 && !ab.ra_doc_id && !ab.ms_doc_id, 'Additional: a new RAMS that replaces nothing');

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
