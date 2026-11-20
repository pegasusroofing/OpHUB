// Finance tables: filter boxes under the column titles narrow the rows; the totals bar adds up what's left.
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  require('./seeds/ex4')(db);
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(B+'/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  // The footer bar's count line (e.g. "3 invoices", "2 projects").
  const count = async (re) => (await page.locator('body').innerText()).split('\n').map((l) => l.trim()).find((l) => re.test(l.split(' · ')[0])) || '';
  await page.goto(B+'/fin/job/'+S1+'?tab=sales'); await page.waitForTimeout(6000);
  // Sales opens on Applications & Certificates; the invoices are the next tab.
  await page.getByRole('tab', {name: 'Invoices', exact: true}).first().click(); await page.waitForTimeout(3000);
  const inv = (db.fin_invoices||[]).filter(i=>i.site_id===S1 && i.status!=='draft' && i.status!=='void'); // voided ones are listed apart
  const box = page.locator('input[aria-label^="Filter "]').first();
  check(await page.locator('input[aria-label^="Filter "]').count() > 0 && (await box.getAttribute('aria-label')) === 'Filter Invoice', `typed filter boxes under the column titles, the first for the invoice number (${await box.getAttribute('aria-label')})`);
  const before = await count(/^\d+ invoices?$/);
  check(before.startsWith(`${inv.length} invoices`), `before filtering: all the job's invoices (${before})`);
  await page.screenshot({path:'shots/filters-before.png'});
  await box.fill('zzzz'); await page.waitForTimeout(800);
  check(await page.getByText('Nothing matches those filters.').count() > 0 && (await count(/^\d+ invoices?$/)).startsWith('0 invoices'), `no match: says so, and the footer counts 0 (${await count(/^\d+ invoices?$/)})`);
  await box.fill(''); await page.waitForTimeout(500);
  await box.fill(String(inv[0].number)); await page.waitForTimeout(800);
  const t = await page.locator('body').innerText();
  check((await count(/^\d+ invoices?$/)).startsWith('1 invoice ') && t.includes(inv[0].number) && !t.includes(inv[1].number) && /£15,000/.test(t), `filtered to ${inv[0].number}: one row, and the footer adds up just that one (${await count(/^\d+ invoices?$/)})`);
  await page.screenshot({path:'shots/filters-after.png'});
  await page.goto(B+'/fin/jobs'); await page.waitForTimeout(5000);
  const jobsBefore = await count(/^\d+ (projects?|jobs?)$/i);
  await page.getByLabel('Filter Project').fill('zzzz'); await page.waitForTimeout(800);
  const jobsAfter = await count(/^\d+ (projects?|jobs?)$/i);
  check(!!jobsBefore && /^0 /.test(jobsAfter), `Finance › Projects: the Project filter narrows the list (${jobsBefore} → ${jobsAfter})`);
  check(!errs.length, `no page errors ${errs.join(' / ').slice(0,300)}`);
  await browser.close();
})();
