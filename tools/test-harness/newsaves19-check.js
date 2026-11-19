// More things that can save to a job's OneDrive folder (Andy, 19 Nov 2026: "are there no more areas for it to auto
// save to the one drive?" ... "Add them all"): the Construction Phase Plan, snagging PDFs and photos, HAVS, PUWER, PPE,
// completed deliveries and subcontractor notices are offered under Where Things Save; a snagging PDF made on a job with
// a OneDrive folder is filed by its item. Fake database; server calls caught. node newsaves19-check.js
const {chromium, makeContext, S1} = require('./harness');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*'], finance_enabled: true});
  const O = db.organizations[0].id; db.organizations[0].has_finance = true;
  db.onedrive_connections = [{org_id: O, account_email: 'andy@rtb.example', folder_path: 'OpHUB Progress Reports', connected_at: new Date().toISOString()}];
  db.job_pack_settings = [{org_id: O, enabled: true, config: {parent_path: 'Jobs', template_path: '', folders: ['1. Contract'], files: [], weekly: {name: '{order}. Week {n}', addDate: false, weekStart: 1, week1: 'start'}, rules: {snag_report: {on: true, folder: ''}}, template_read: new Date().toISOString()}}];
  const site = db.sites.find((s) => s.id === S1); site.job_pack = {at: new Date().toISOString(), path: 'Jobs/Test', root_id: 'r1', drive_id: 'd1', drawings_folder_id: null, week1: null};
  db.snags = [{id: 'sn1', site_id: S1, title: 'Lead flashing loose', location: 'Rear', status: 'open', photo_path: null, photo_paths: null, created_at: new Date().toISOString(), created_by: 'me'}];
  const fns = [];
  global.__fn = (name, b) => { fns.push([name, b]); return name === 'onedrive-list-folders' ? {folders: []} : {ok: true}; };
  global.__rpc = (n) => (n === 'onedrive_status' ? {exists: true, connected: true, needs_reconnect: false, account_email: 'andy@rtb.example', folder_path: 'OpHUB Progress Reports'} : undefined);
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

  // Where Things Save offers the new items.
  await page.goto(`${B}/pm/admin/onedrive`); await page.waitForTimeout(5000);
  await page.getByText('+ Add Something To Save', {exact: true}).click(); await page.waitForTimeout(1000);
  await page.getByLabel('What', {exact: true}).click(); await page.waitForTimeout(800);
  let t = await text();
  const want = ['Construction Phase Plan: Plan Issued', 'Snagging: Snag Raised Or Closed', 'HAVS: HAVS Record PDF Made', 'PUWER: PUWER Inspection PDF Made', 'PPE: PPE Issue Record PDF Made', 'Deliveries: Delivery Completed'];
  const missing = want.filter((w) => !t.includes(w));
  check(!missing.length, `Projects: the new items are offered (${missing.length ? 'missing ' + missing.join(', ') : 'all there'})`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.goto(`${B}/pm/admin/onedrive`); await page.waitForTimeout(4500);
  await page.getByText('Finance', {exact: true}).last().click(); await page.waitForTimeout(600);
  await page.getByText('+ Add Something To Save', {exact: true}).click(); await page.waitForTimeout(1000);
  await page.getByLabel('What', {exact: true}).click(); await page.waitForTimeout(800);
  check(/Subcontractor Notices: Payment Or Pay Less Notice Made/.test(await text()), 'Finance: subcontractor notices are offered');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  // A snagging PDF made on a job with a OneDrive folder is filed by its item.
  await page.goto(`${B}/sites/${S1}/snagging/list`); await page.waitForTimeout(5000);
  await page.getByLabel('Export snags').click(); await page.waitForTimeout(800);
  await page.getByText('Export Live (PDF)', {exact: true}).click(); await page.waitForTimeout(6000);
  const put = fns.find(([n, b]) => n === 'onedrive-job-pack' && b.action === 'put' && b.rule === 'snag_report');
  check(!!put && /\.pdf$/i.test(put[1].filename) && !!put[1].content_base64, `the snagging PDF goes to the job's OneDrive folder (${put ? put[1].filename : 'nothing sent'})`);
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
