// Admin › H&S › Toolbox Talks (Andy, 21 Nov 2026): "Can we add a header here says tbt library. Then make the upload a
// create tbt or upload tbt two buttons that when you click ask for name and then upload file (allow any file upload)".
// Phone, fake database. node tbtlib21-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'tbtlib21'); fs.mkdirSync(SHOTS, {recursive: true});
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
  db.tbt_templates = [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(`${B}/pm/admin/tbt`); await page.waitForTimeout(5000);
  let t = await text();
  check(/TBT Library/i.test(t) && /\+ Create TBT/.test(t) && /Upload TBT/.test(t) && !/Upload A PDF Instead|Add To Bank|Choose PDF/.test(t), 'a TBT Library heading, Create TBT and Upload TBT; no Upload A PDF Instead box');
  const btns = await page.evaluate(() => ['+ Create TBT', '⬆ Upload TBT'].map((l) => { const e = [...document.querySelectorAll('div')].find((x) => x.childElementCount === 0 && x.textContent === l); return e ? Math.round(e.getBoundingClientRect().top) : null; }));
  check(btns[0] !== null && btns[0] === btns[1], `the two buttons sit on one row (${btns.join(', ')})`);
  await page.screenshot({path: path.join(SHOTS, 'tbt-library-phone.png')});
  // Upload: the name first, then any file (a Word document here).
  await page.getByText('⬆ Upload TBT', {exact: true}).click(); await page.waitForTimeout(800);
  check(/Name Of The Toolbox Talk/.test(await text()), 'Upload TBT asks for the name first');
  await page.getByPlaceholder('e.g. Alcohol & Drugs').fill('Ladder Safety');
  const docx = path.join(SHOTS, 'ladder-safety.docx'); fs.writeFileSync(docx, 'PK fake word document');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', {timeout: 15000}), page.getByText('Next', {exact: true}).last().click()]);
  check(!chooser.isMultiple() && !/pdf/i.test(await chooser.element().getAttribute('accept') || ''), `then any file can be chosen (accept: ${await chooser.element().getAttribute('accept') || 'anything'})`);
  await chooser.setFiles(docx); await page.waitForTimeout(3500);
  const row = db.tbt_templates[0];
  check(!!row && row.title === 'Ladder Safety' && /ladder-safety\.docx$/.test(row.storage_path), `it's in the TBT Library (${row && row.storage_path})`);
  check(/Ladder Safety/.test(await text()), 'and listed');
  // Create: the name first, then the builder with it filled in.
  await page.getByText('+ Create TBT', {exact: true}).click(); await page.waitForTimeout(800);
  await page.getByPlaceholder('e.g. Alcohol & Drugs').fill('Manual Handling');
  await page.getByText('Next', {exact: true}).last().click(); await page.waitForTimeout(1500);
  const title = await page.evaluate(() => [...document.querySelectorAll('input, textarea')].map((i) => i.value).find((v) => v === 'Manual Handling') || '');
  check(/Create A Toolbox Talk/i.test(await text()) && title === 'Manual Handling', 'Create TBT opens the builder with the name as its title');
  await page.screenshot({path: path.join(SHOTS, 'tbt-create-phone.png')});
  await ctx.close();
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
