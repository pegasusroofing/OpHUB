// Admin Centre on a phone (Andy, 21 Nov 2026): "when choosing the main contractor tab on phone view in settings it just
// shows the bar as sitting on projects which is a bug"; "put roles under the invites tab please and have as invites &
// roles header"; "Device locks shouldn't be a header but should be a drop down in the users section at the bottom".
// Fake database. node admintabs21-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'admintabs21'); require('fs').mkdirSync(SHOTS, {recursive: true});
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
  db.device_locks = [{device_id: 'dv1', org_id: me.org_id, user_id: 'o1', status: 'pending', requested_at: new Date().toISOString()}];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(`${B}/pm/admin`); await page.waitForTimeout(5000);
  // Tabs by row; the underlined one has a coloured bottom border.
  const tabs = async () => page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => {
    const r = t.getBoundingClientRect(); const c = getComputedStyle(t).borderBottomColor;
    return {l: t.textContent.trim(), y: Math.round(r.top), on: c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent'};
  }));
  const all = await tabs(); const topY = Math.min(...all.map((t) => t.y));
  const top = async () => (await tabs()).filter((t) => Math.abs(t.y - topY) < 4);
  const subs = async () => (await tabs()).filter((t) => t.y > topY + 10);
  const labels = (await top()).map((t) => t.l);
  console.log('top tabs:', labels.join(' | '));
  const tapTop = async (l) => { await page.getByRole('tab', {name: l, exact: true}).first().click(); await page.waitForTimeout(2500); };
  const onTop = async () => (await top()).filter((t) => t.on).map((t) => t.l).join(', ') || 'none';
  for (const l of labels) {
    await tapTop(l);
    check(await onTop() === l, `phone: tapping ${l} underlines ${l} (${await onTop()}; ${page.url().replace(B, '')})`);
  }
  // Main Contractor › Inspection Templates, then away and back: Main Contractor stays underlined (it used to show Projects).
  await tapTop('Main Contractor');
  await page.getByRole('tab', {name: 'Inspection Templates', exact: true}).click(); await page.waitForTimeout(2500);
  check(await onTop() === 'Main Contractor', `phone: Main Contractor › Inspection Templates keeps Main Contractor underlined (${await onTop()})`);
  await tapTop('People'); await tapTop('Main Contractor');
  check(await onTop() === 'Main Contractor' && /kind=mc/.test(page.url()), `phone: back to Main Contractor, it's still underlined (${await onTop()}; ${page.url().replace(B, '')})`);
  await page.screenshot({path: path.join(SHOTS, 'main-contractor-phone.png')});
  // People: Invites & Roles (Roles under the invites), Users with Device Locks at the bottom.
  await tapTop('People');
  const ps = (await subs()).map((t) => t.l);
  check(ps.includes('Invites & Roles') && ps.includes('Users') && !ps.includes('Roles') && !ps.includes('Device Locks'), `People's tabs: Invites & Roles and Users; no Roles or Device Locks tabs (${ps.join(' | ')})`);
  await page.getByRole('tab', {name: 'Invites & Roles', exact: true}).click(); await page.waitForTimeout(3000);
  let t = await text();
  check(/Pending Invites|One-Time Invite/.test(t) && /Your Roles/.test(t) && t.indexOf('Your Roles') > t.indexOf('Invite'), 'Invites & Roles: the invites, then the roles under them');
  await page.screenshot({path: path.join(SHOTS, 'invites-roles-phone.png'), fullPage: true});
  await page.getByRole('tab', {name: 'Users', exact: true}).click(); await page.waitForTimeout(3000);
  t = await text();
  check(/Device Locks · 1 Waiting/.test(t) && /Awaiting approval/.test(t), 'Users: Device Locks at the bottom, open because a phone is waiting');
  await page.getByText('Device Locks · 1 Waiting', {exact: true}).click(); await page.waitForTimeout(800);
  check(!/Awaiting approval/.test(await text()), 'Users: Device Locks closes and opens like a drop-down');
  await page.getByText('Device Locks · 1 Waiting', {exact: true}).click(); await page.waitForTimeout(800);
  await page.screenshot({path: path.join(SHOTS, 'users-device-locks-phone.png'), fullPage: true});
  await ctx.close();
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
