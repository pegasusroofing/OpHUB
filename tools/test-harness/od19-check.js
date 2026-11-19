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
  // Job folders set up earlier in another company's folders: choosing the main folder offers to move them in.
  Object.assign(db.job_pack_settings[0].config, {parent_path: 'RTB Roofing Ltd/Live Projects', template_path: 'RTB Roofing Ltd/Live Projects/- New Job Pack - Template'});
  await page.goto(`${BASE}/pm/admin/onedrive`); await page.waitForTimeout(4500);
  await page.getByText(/^Main Folder:/).first().click(); await page.waitForTimeout(1200);
  await page.getByText('RTB Construction', {exact: true}).last().click(); await page.waitForTimeout(1200);
  await page.getByText('Use “RTB Construction”', {exact: true}).click(); await page.waitForTimeout(1500);
  t = await text();
  check(/outside your main folder/.test(t), 'job folders in RTB Roofing’s folders: it says they’re outside the main folder');
  await page.getByText('Yes', {exact: true}).last().click(); await page.waitForTimeout(2000);
  const c2 = db.job_pack_settings[0].config;
  check(c2.parent_path === 'RTB Construction' && !c2.template_path, `Yes moves new job folders into the main folder and clears the other company’s template (${c2.parent_path} / ${c2.template_path || 'none'})`);
  // Disconnected: only the connection shows; the settings are kept.
  main = null;
  global.__rpc = (n) => (n === 'onedrive_status' ? {exists: false} : undefined);
  db.onedrive_connections = [];
  await page.goto(`${BASE}/pm/admin/onedrive`); await page.waitForTimeout(4500);
  t = await text();
  check(/Connect OneDrive/.test(t) && !/NEW JOBS|New Jobs/.test(t) && !/WHERE THINGS SAVE|Where Things Save/i.test(t) && /kept and shows again/.test(t), 'not connected: only the connection shows, with a note that the settings are kept');
  check(db.job_pack_settings.length === 1 && db.job_pack_settings[0].config.parent_path === 'RTB Construction', 'and nothing set up is deleted');
  await page.screenshot({path: require('path').join(__dirname, 'shots', 'od19-disconnected.png')});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
