// The current app's join screen (app.html#/join/…) shows the company you're invited to in its header, not the one this
// phone last used (Andy, 18 Nov 2026: "the link in there now defaults to rtb roofing and not sandbox logos and text").
// Signed in as one company, open another company's invite. Fake database. node oldjoin18-check.js
const {chromium, makeContext, serve, login} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const {srv, port} = await serve();
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  const mine = (db.organizations && db.organizations[0] && db.organizations[0].name) || '';
  global.__rpc = (name) => (name === 'get_invite_info' ? [{org_name: 'Sandbox Roofing Ltd', is_valid: true, logo_path: null, color_primary: '#123456', color_secondary: null}] : undefined);
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await login(page, port);
  const before = await page.evaluate(() => (document.querySelector('.brandline') || {}).textContent || '');
  await page.evaluate(() => { location.hash = '#/join/inv-sandbox'; }); await page.waitForTimeout(2500);
  const t = await page.evaluate(() => document.body.innerText);
  const head = await page.evaluate(() => [...document.querySelectorAll('.brandline, .appbar h2, header h2')].map((e) => e.textContent.trim()).join(' | '));
  if (!/invited to join/.test(t)) console.log('NOTE the join screen did not open signed in; header was: ' + before);
  check(/You've been invited to join Sandbox Roofing Ltd/.test(t), 'the join screen opens for the Sandbox invite');
  check(/Sandbox Roofing Ltd/.test(head) && (!mine || !head.includes(mine)), `its header shows Sandbox, not the company this phone uses (${head}; mine ${mine})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'oldjoin18.png')});
  global.__rpc = undefined;
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close(); srv.close();
})();
