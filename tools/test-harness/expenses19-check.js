// Expenses (Andy, 19 Nov 2026): "an expenses button on the taskbar to left hand side below finance but above HR. this is
// for all users excl operatives please. and takes us to the expenses page. remove it from anywhere else in the app. make
// sure we have to allocate it to a job on uploading and it gets issued to the finance for approval like we set previously".
// Fake database, laptop size. (Going to Finance is the database trigger zz_expense_to_finance on each saved row.)
// node expenses19-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081', S1 = '11111111-1111-1111-1111-111111111111';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const login = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
};
const navOrder = (page) => page.evaluate(() => [...document.querySelectorAll('[role="link"], [role="button"], a')].map((e) => e.innerText.trim()).filter((t) => ['Finance', 'Expenses', 'HR'].includes(t)));

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const tmp = path.join(__dirname, 'shots', 'receipt-test.pdf');
  fs.writeFileSync(tmp, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.finance_enabled = true;
    db.expenses = [];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await login(page);
    await page.waitForTimeout(1000);
    const order = await navOrder(page);
    check(order.join(' > ').includes('Finance > Expenses > HR'), `the menu has Expenses below Finance and above HR (${order.join(' > ')})`);
    await page.locator('[role="link"]:visible', {hasText: /^Expenses$/}).first().click(); await page.waitForTimeout(3000);
    check(/\/expenses$/.test(page.url()), `the button opens the Expenses page (${page.url().replace(B, '')})`);
    let t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    check(/goes to Finance to check and book in/.test(t) && /Which Job Is This For\?/.test(t) && !/A job not on the app/.test(t), 'every receipt is put against a job on the app, and goes to Finance');
    // Add a receipt without choosing a job: it won't save.
    // One Upload button: the phone's own chooser for photos (camera or library) and files (Andy, 19 Nov 2026).
    check(!/Take Photo|🖼 Photos|📎 PDF/.test(t) && /📎 Upload Receipt/.test(t), 'one Upload Receipt button instead of three');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('📎 Upload Receipt', {exact: true}).first().click()]);
    const accept = await chooser.element().getAttribute('accept');
    check(/image\/\*/.test(accept || '') && /application\/pdf/.test(accept || '') && chooser.isMultiple(), `it takes photos and PDFs, several at once (${accept})`);
    await chooser.setFiles([tmp, path.join(__dirname, 'shots', 'receipt-photo-test.png')].filter((f) => fs.existsSync(f))); await page.waitForTimeout(1500);
    await page.getByText(/^Save & Send 2 Receipts$/).click(); await page.waitForTimeout(800);
    t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    check(/Choose which job each set of receipts is for\./.test(t) && db.expenses.length === 0, 'without a job it asks for one and saves nothing');
    await page.getByText('Choose The Job…', {exact: true}).first().click(); await page.waitForTimeout(800);
    const site = db.sites.find((x) => x.id === S1);
    await page.getByText(new RegExp(site.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')).last().click(); await page.waitForTimeout(600);
    await page.getByText('This Is Fuel', {exact: true}).click(); await page.waitForTimeout(300);
    await page.screenshot({path: path.join(__dirname, 'shots', 'expenses19-page.png')});
    await page.setViewportSize({width: 390, height: 844}); await page.waitForTimeout(800);
    await page.screenshot({path: path.join(__dirname, 'shots', 'expenses19-phone.png'), fullPage: true});
    await page.getByText(/^Save & Send 2 Receipts$/).click(); await page.waitForTimeout(5000);
    const row = db.expenses[0] || {};
    check(row.site_id === S1 && row.category === 'fuel' && (row.file_paths || []).length === 2 && (row.file_paths || []).some((p) => /.jpg$/.test(p)) && (row.file_paths || []).some((p) => /.pdf$/.test(p)), `saved against the job, as fuel, with the photo and the PDF (${row.site_id}, ${row.category}, ${(row.file_paths || []).length} files)`);
    t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    check(new RegExp(`${site.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} — Fuel`).test(t), 'it shows under Sent Receipts with its job');
    // Not on the job's Materials page any more; the old link opens Expenses with the job chosen.
    await page.goto(`${B}/sites/${S1}/materials`); await page.waitForTimeout(4000);
    t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    check(!/Receipts for this job/.test(t) && !/🧾 Expenses/.test(t), 'the job\'s Materials page has no Expenses tile or button');
    await page.goto(`${B}/sites/${S1}/expenses`); await page.waitForTimeout(4000);
    check(/\/expenses\?site=/.test(page.url()) && (await page.locator('body').innerText()).includes(site.name), 'an old job expenses link opens Expenses with that job chosen');
    await ctx.close();
  }
  {
    const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 1300, height: 900}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); me.role = 'operative';
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await login(page);
    const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    check(!/\bExpenses\b/.test(t), 'operatives have no Expenses button');
    await page.goto(B + '/expenses'); await page.waitForTimeout(3000);
    check(/aren.t part of your login/.test(await page.locator('body').innerText()), 'and the page itself is closed to them');
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
