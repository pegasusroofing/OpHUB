// Toolbox Talks (Andy, 19 Nov 2026): "create a tbt which mimics the existing designs in rtb roofing please. add it so we
// can have a template to create", and "move the toolbox talks required into the toolbox talks templates and have the tab
// header as toolbox talks". Admin › H&S › Toolbox Talks: How Often at the top, + Create A Toolbox Talk makes a talk in
// RTB Roofing's layout and saves it as a template (with its wording, so ✎ Edit opens it again). The PDF it saved is
// written to shots/tbtbuild19.pdf to look at. Fake database, laptop size. node tbtbuild19-check.js
const {chromium, makeContext} = require('./harness');
const fs = require('fs');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin';
  db.organizations[0].rams_settings = {address: 'Unit 7\nRunwell Hall Farm, Hoe Ln,\nChelmsford\nCM3 8DQ', phone: '01234 000000'};
  db.tbt_templates = [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  let pdf = null;
  await page.route('**/storage/v1/object/rams-docs/**', (route) => {
    if (route.request().method() === 'POST') { pdf = route.request().postDataBuffer(); return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({Key: 'rams-docs/x', Id: 'x'})}); }
    return route.fallback();
  });
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

  await page.goto(B + '/pm/admin/tbt'); await page.waitForTimeout(4000);
  let t = await text();
  check(/How Often Does Each Live Project Need A Toolbox Talk\?/.test(t) && /Toolbox Talk Templates/i.test(t), 'Toolbox Talks shows How Often and the templates together');
  const tabs = await page.locator('[role="tab"], [role="button"]').allInnerTexts();
  check(tabs.some((x) => x.trim() === 'Toolbox Talks') && !tabs.some((x) => /Toolbox Talks Required|Toolbox Talk Templates/.test(x)), `the H&S tab is "Toolbox Talks", with no separate Required tab`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'tbtbuild19-page.png')});

  await page.getByText('+ Create A Toolbox Talk', {exact: true}).click(); await page.waitForTimeout(1200);
  await page.getByText('Save Template', {exact: true}).click(); await page.waitForTimeout(600);
  check(/Give the talk a title\./.test(await text()), 'it asks for a title before saving');
  const box = (label) => page.locator(`[aria-label="${label}"], input[placeholder], textarea`).first();
  const fill = async (label, v) => { const l = page.getByText(label, {exact: true}).first(); const input = l.locator('xpath=following-sibling::*[1]//input | following-sibling::*[1]//textarea').first(); await input.fill(v); };
  await fill('Title', 'Safe Working at Height');
  await fill('Reason', 'Over 40% of major injuries on construction sites involve falls from heights.');
  await fill('Why', "Falls from height can and do end in death. Don't end up as a statistic.");
  await fill('Outline', 'This talk will cover: before working on roofs, hazards and safe working at height.');
  await fill('Heading', 'Before Working at Height - Consider if the work can be done any other way');
  await fill('Points (One Per Line, Numbered For You)', 'Before any work or access onto a roof, fragile materials should be identified and precautions decided.\nRoof lights should be identified and arrangements made to close off with barriers to prevent falling through.\n3. Access ladders must extend at least 1 metre above the stepping-off point and must be secured.');
  await fill('Question', 'What should be identified before work at height starts?');
  await page.getByText('+ Add Section', {exact: true}).click(); await page.waitForTimeout(400);
  const heads = page.getByText('Heading', {exact: true});
  check(await heads.count() === 2, 'a second section can be added');
  await heads.nth(1).locator('xpath=following-sibling::*[1]//input').fill('Hazards of Working at Height');
  await page.getByText('Points (One Per Line, Numbered For You)', {exact: true}).nth(1).locator('xpath=following-sibling::*[1]//textarea').fill('If you can fall and harm yourself, guardrails and toe-boards must be erected.\nWet, windy or icy weather can seriously affect safety.');
  await fill('Questions For You (One Per Line)', 'When must crawling boards or ladders be used?\nHow far should ladders extend above a stepping-off point?');
  await fill('Closing Line', 'Remember there is no safe height to fall from');
  await page.screenshot({path: path.join(__dirname, 'shots', 'tbtbuild19-builder.png'), fullPage: true});
  await page.getByText('Save Template', {exact: true}).click(); await page.waitForTimeout(7000);
  const row = db.tbt_templates[0] || {};
  check(row.title === 'Safe Working at Height' && row.builder && row.builder.sections.length === 2 && /tbt-templates\/.*Safe_Working_at_Height_-_TBT\.pdf$/.test(row.storage_path || ''), `saved as a template with its wording (${row.storage_path || 'none'})`);
  check(!!pdf && pdf.length > 3000 && pdf.slice(0, 5).toString() === '%PDF-', `a PDF was made and stored (${pdf ? pdf.length : 0} bytes)`);
  if (pdf) fs.writeFileSync(path.join(__dirname, 'shots', 'tbtbuild19.pdf'), pdf);
  t = await text();
  check(/Safe Working at Height/.test(t) && /Made here/.test(t) && /✎ Edit/.test(t), 'it is in the list, with ✎ Edit');
  await page.getByText('✎ Edit', {exact: true}).first().click(); await page.waitForTimeout(1000);
  const titleNow = await page.getByText('Title', {exact: true}).first().locator('xpath=following-sibling::*[1]//input').inputValue();
  check(titleNow === 'Safe Working at Height' && /Save Changes/.test(await text()), 'Edit opens it again with its wording');
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
