// Admin Centre › New job pack: every rule edited in the app, at phone size and on a laptop, against the fake data.
const {chromium, makeContext} = require('./harness');
(async () => {
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  db.profiles[0].howto_dismissed = ['*'];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  let fails = 0;
  const ok = (name, pass, note = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`); if (!pass) fails++; };
  const text = () => page.locator('body').innerText();
  const tap = async (t, exact = true) => { await page.getByText(t, {exact}).locator('visible=true').last().click({timeout: 6000}); await page.waitForTimeout(600); };
  const saved = () => (db.job_pack_settings || [])[0];
  await page.goto(BASE + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  await page.goto(BASE + '/pm/admin/onedrive'); await page.waitForTimeout(4000);
  ok('OneDrive page: no Excel, a way in to the rules', /Set it up/i.test(await text()) && !/Excel/i.test(await text()));
  await page.goto(BASE + '/pm/admin/jobpack'); await page.waitForTimeout(4000);
  await page.screenshot({path: 'shots/jobpack-1.png'});
  ok('Starts from the template’s folders and rules', /Schedule of Works/.test(await text()) && /Folders made on each job \(38\)/.test(await text()), (await text()).replace(/\s+/g, ' ').slice(60, 200));

  await page.locator('[aria-label="Incidents: Incident submitted"]').first().click(); await page.waitForTimeout(400);
  await page.screenshot({path: 'shots/jobpack-2.png', fullPage: false});
  await tap('Folders made on each job (38)'); await page.waitForTimeout(400);
  await page.locator('[aria-label="Change 7. Main Contractor Docs"]').click(); await page.waitForTimeout(500);
  await tap('✎ Rename');
  await page.locator('input').locator('visible=true').last().fill('7. Main Contractor Paperwork');
  await tap('OK');
  await tap('+ Add a folder');
  await page.locator('input').locator('visible=true').last().fill('9. Our New Folder');
  await tap('OK');
  await page.locator('[aria-label="Change 6. Programme"]').click(); await page.waitForTimeout(500);
  await tap('🗑 Take out'); await page.waitForTimeout(500);
  await page.screenshot({path: 'shots/jobpack-3.png'});
  await tap('Weekly folders');
  await page.locator('[aria-label="Add the date to the name"]').click(); await page.waitForTimeout(300);
  await page.screenshot({path: 'shots/jobpack-4.png'});
  await tap('Documents copied to each job (6)');
  await page.locator('[aria-label="Take out RTB Handover Checklist.xlsx"]').click(); await page.waitForTimeout(300);
  await page.getByPlaceholder('File name, e.g. Checklist.xlsx').fill('New Doc.xlsx');
  await page.getByText('Add', {exact: true}).locator('visible=true').last().click(); await page.waitForTimeout(600);
  await tap('The top of the job folder');
  await page.screenshot({path: 'shots/jobpack-5.png'});
  await tap('Save'); await page.waitForTimeout(1200);
  const s = saved();
  const c = s && s.config;
  ok('Saved, and left off', !!c && s.enabled === false);
  if (c) {
    ok('Rule turned on', c.rules.incident.on === true);
    ok('Rename carried through', c.folders.includes('7. Main Contractor Paperwork') && !c.folders.includes('7. Main Contractor Docs'));
    ok('Folder added', c.folders.includes('9. Our New Folder'));
    ok('Folder taken out, with what’s inside it', !c.folders.some((f) => f.startsWith('6. Programme')));
    ok('Date on the week folders', c.weekly.addDate === true);
    ok('Documents changed', c.files.some((f) => f.name === 'New Doc.xlsx' && f.folder === '') && !c.files.some((f) => f.name === 'RTB Handover Checklist.xlsx'));
  }
  await page.goto(BASE + '/pm/quotes'); await page.waitForTimeout(4000);
  ok('Quotes page: no Excel load', !/Load Excel/i.test(await text()));
  await page.goto(BASE + '/pm/quotes/settings'); await page.waitForTimeout(4000);
  await page.screenshot({path: 'shots/quotesettings.png'});
  ok('Old tracker is a once-only job in settings', /Bring in the old tracker/i.test(await text()));
  await page.setViewportSize({width: 1300, height: 900});
  await page.goto(BASE + '/pm/admin/jobpack'); await page.waitForTimeout(4000);
  await page.screenshot({path: 'shots/jobpack-desk.png'});
  ok('No crashes', !errs.length, errs.slice(0, 2).join(' / ').slice(0, 200));
  console.log(fails ? `${fails} failed` : 'all passed');
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('STOPPED', e.message.slice(0, 300)); process.exit(1); });
