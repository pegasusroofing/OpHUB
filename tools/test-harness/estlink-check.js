// Link Estimating Folder (4 Nov 2026), fake database, OneDrive calls caught (nothing really moves):
// Finance › project › Project Financials has the link → the picker opens in the Estimating folder → Use → the folder moves
// into the job (quote-tracker link_folder), the job's OneDrive folder made first if it hasn't one.
// node estlink-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.finance_enabled = true; me.howto_dismissed = ['*'];
  const fns = [];
  await ctx.route(/functions\/v1\/(quote-tracker|onedrive-job-pack|onedrive-list-folders)/, (r) => {
    const n = r.request().url().split('/functions/v1/')[1].split('?')[0], b = JSON.parse(r.request().postData() || '{}'); fns.push([n, b]);
    const body = n === 'onedrive-list-folders' ? {folders: b.parent_id === 'EST' ? [{id: 'ENQ1', name: 'Studley Rd extra works', driveId: 'D1'}] : [{id: 'X', name: 'Somewhere else', driveId: 'D1'}]}
      : n === 'onedrive-job-pack' ? {path: 'Jobs/J101', made: 3, copied: 0, failed: []}
      : b.action === 'estimating_root' ? {ok: true, id: 'EST', driveId: 'D1', name: '2. Estimating'} : {ok: true, how: 'moved', quote: null};
    r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});
  });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(B + `/fin/job/${S1}?setup=1`); await page.waitForTimeout(5000);
  check(await page.getByText('📁 Link Estimating Folder').count() > 0, 'Project Financials pop-up has Link Estimating Folder');
  await page.screenshot({path: path.join(__dirname, 'shots', 'job', 'estlink-popup.png')});
  await page.getByText('📁 Link Estimating Folder').first().click(); await page.waitForTimeout(3500);
  check(await page.getByText('Studley Rd extra works').count() > 0, 'picker opens in the Estimating folder');
  await page.getByText('Studley Rd extra works').click(); await page.waitForTimeout(2000);
  await page.screenshot({path: path.join(__dirname, 'shots', 'job', 'estlink-picker.png')});
  await page.getByText(/For This Job/).click(); await page.waitForTimeout(800);
  await page.getByText('Yes, Move It', {exact: true}).click(); await page.waitForTimeout(3000);
  const link = fns.find(([n, b]) => n === 'quote-tracker' && b.action === 'link_folder');
  check(!!link && link[1].site_id === S1 && link[1].folder_id === 'ENQ1' && link[1].drive_id === 'D1', `moves the chosen folder into the job (${JSON.stringify(fns.map((f) => f[1].action || f[0]))})`);
  check(!errs.length, `no errors ${errs.join(' | ')}`);
  await browser.close();
})();
