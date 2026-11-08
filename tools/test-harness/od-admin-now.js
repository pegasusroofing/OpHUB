// Screenshots of today's Admin Centre › OneDrive and New job pack pages (laptop, fake database), to design from.
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
(async () => {
  const browser = await chromium.launch();
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1366, height: 900}});
  seed(db); db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id;
  db.onedrive_connections = [{org_id: O, account_email: 'andy@rtbroofing.example', folder_path: '/RTB Roofing Ltd', connected_at: '2026-10-20T09:00:00Z'}];
  db.job_pack_settings = [{org_id: O, enabled: true, config: null}];
  global.__rpc = (n) => (n === 'onedrive_status' ? {exists: true, connected: true, needs_reconnect: false, account_email: 'andy@rtbroofing.example', folder_path: '/RTB Roofing Ltd'} : undefined);
  const page = await ctx.newPage();
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  for (const p of ['onedrive', 'jobpack']) {
    await page.goto(`http://localhost:8081/pm/admin/${p}`); await page.waitForTimeout(5000);
    await page.screenshot({path: `shots/od-now-${p}.png`, fullPage: true});
  }
  await browser.close();
})();
