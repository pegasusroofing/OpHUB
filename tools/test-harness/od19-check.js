// OneDrive main folder per company (Andy, 19 Nov 2026: "when i connect to the onedrive i need to be able to choose what
// main file i want"; "make sure no cross contamination"). A second company on the same Microsoft account, with "RTB" in
// its name: coming back from connecting asks for its main folder; the choice is saved as its own; Set It Up starts its
// job folders there and never in RTB Roofing's folders (it used RTB Roofing's paths for any "RTB" company).
// Fake database; server calls caught. node od19-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const BASE = 'http://localhost:8081';
const ROOT = [{id: 'f-rtb', name: 'RTB Roofing Ltd', driveId: 'd1'}, {id: 'f-con', name: 'RTB Construction', driveId: 'd1'}];
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1366, height: 900}});
  seed(db); db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id; db.organizations[0].name = 'RTB Construction Group';
  db.onedrive_connections = [{org_id: O, account_email: 'andy@rtb.example', folder_path: 'OpHUB Progress Reports', connected_at: new Date().toISOString()}];
  db.job_pack_settings = [];
  let main = 'OpHUB Progress Reports';
  const calls = [];
  global.__fn = (name, b) => (name === 'onedrive-list-folders' ? {folders: !b.parent_id ? ROOT : []} : {ok: true});
  global.__rpc = (n, b) => {
    if (n === 'onedrive_status') return {exists: true, connected: true, needs_reconnect: false, account_email: 'andy@rtb.example', folder_path: main};
    if (n === 'onedrive_set_main_folder') { calls.push(b.p_path); main = b.p_path; return true; }
    return undefined;
  };
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  // Back from Microsoft: it asks for this company's main folder.
  await page.goto(`${BASE}/pm/admin/onedrive?onedrive=success&msg=andy%40rtb.example`); await page.waitForTimeout(5000);
  let t = await text();
  check(/Choose This Company’s Main OneDrive Folder/.test(t), 'back from connecting, it asks for this company’s main folder');
  await page.getByText('RTB Construction', {exact: true}).last().click(); await page.waitForTimeout(1500);
  await page.getByText('Use “RTB Construction”', {exact: true}).click(); await page.waitForTimeout(2000);
  check(calls[0] === 'RTB Construction', `the main folder is saved for this company (${calls.join(', ')})`);
  t = await text();
  check(/Main Folder: 📁 RTB Construction/.test(t), 'the page shows Main Folder: RTB Construction');
  // Set It Up: job folders start in its own main folder, not RTB Roofing's.
  await page.getByText('Set It Up', {exact: true}).click(); await page.waitForTimeout(2500);
  const c = (db.job_pack_settings[0] || {}).config || {};
  check(c.parent_path === 'RTB Construction' && !/RTB Roofing/.test(`${c.parent_path} ${c.template_path}`), `job folders start in its main folder, nothing of RTB Roofing’s (${c.parent_path} / template: ${c.template_path || 'none'})`);
  await page.screenshot({path: require('path').join(__dirname, 'shots', 'od19.png')});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
