// Screenshots only (before / after Andy's RAMS notes of 14 Nov 2026) on a touch phone, fake database.
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081', S1 = '11111111-1111-1111-1111-111111111111';
const SHOTS = path.join(__dirname, 'shots', 'rams14'); require('fs').mkdirSync(SHOTS, {recursive: true});
const tag = process.argv[2] || 'before';
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {shot: true});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*'];
  db.rams_docs = [1, 2, 3, 4].map((i) => ({id: 'rx' + i, site_id: S1, org_id: me.org_id, name: (i % 2 ? 'Risk Assessment — Roof ' : 'Method Statement — Roof ') + i, storage_path: 'x/r' + i + '.pdf', status: 'current', doc_type: i % 2 ? 'Risk Assessment' : 'Method Statement', subcontractor_company_id: null, uploaded_at: '2026-11-0' + i + 'T08:00:00Z', created_at: '2026-11-0' + i + 'T08:00:00Z'}));
  db.rams_builds = [{id: 'b1', org_id: me.org_id, site_id: S1, title: 'Roof 1', status: 'issued', revision: 1, ra_doc_id: 'rx1', ms_doc_id: 'rx2', details: {}, hazards: [{id: 'h1', title: 'Work at height'}], sections: [{id: 's1', part: 'method', title: 'Strip'}], ppe: [], updated_at: '2026-11-02T08:00:00Z'}];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(B + `/sites/${S1}/hs/rams`); await page.waitForTimeout(5000);
  await page.screenshot({path: path.join(SHOTS, tag + '-list.png')});
  const boxes = page.locator('[role="checkbox"] >> visible=true');
  console.log('tick boxes', await boxes.count());
  for (let i = 0; i < 3 && i < await boxes.count(); i++) { await boxes.nth(i).click(); await page.waitForTimeout(300); }
  await page.waitForTimeout(600);
  await page.screenshot({path: path.join(SHOTS, tag + '-ticked.png')});
  const bar = page.getByText(/\d+ Selected/).first();
  if (await bar.count()) console.log('bar box', JSON.stringify(await bar.boundingBox()), 'viewport', JSON.stringify(page.viewportSize()));
  await page.mouse.wheel(0, 2000); await page.waitForTimeout(800);
  if (await bar.count()) console.log('bar box after scroll', JSON.stringify(await bar.boundingBox()));
  await page.screenshot({path: path.join(SHOTS, tag + '-ticked-scrolled.png')});
  await page.goto(B + `/sites/${S1}/hs/rams/build/b1?tab=issue`); await page.waitForTimeout(5000);
  await page.mouse.wheel(0, 2000); await page.waitForTimeout(800);
  await page.screenshot({path: path.join(SHOTS, tag + '-issue.png')});
  console.log('errors', errs.join(' | ') || 'none');
  await browser.close();
})();
