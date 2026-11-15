// The phone's side menu has one way to Settings (Andy, 15 Nov 2026: "On phone there is also 2 settings in the bar on the
// left"). A manager: Admin (company settings) is the only gear; their own Settings are under their name ("My Settings ›"),
// which opens Settings and closes the menu. An operative: the Settings line as before, their role under their name.
// node phonemenu15-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'hr15');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const login = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(7000);
};
// The words in the open menu (the dark panel), one per line.
const menuWords = (page) => page.evaluate(() => { const inMenu = (d) => { for (let e = d; e; e = e.parentElement) if (getComputedStyle(e).backgroundColor === 'rgb(22, 24, 29)') return true; return false; }; return [...document.querySelectorAll('div')].filter((d) => !d.children.length && d.innerText && d.getBoundingClientRect().width > 0 && inMenu(d)).map((d) => d.innerText.trim()); });
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const role of ['admin', 'pm', 'operative']) {
    const {ctx, db} = await makeContext(browser, role, [], {viewport: {width: 390, height: 844}});
    require('./seeds/world')(db);
    Object.assign(db.profiles.find((p) => p.id === 'me'), {role, howto_dismissed: ['*']});
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await login(page);
    await page.getByLabel('Menu', {exact: false}).first().click(); await page.waitForTimeout(1500);
    const w = await menuWords(page);
    if (role === 'operative') {
      check(w.filter((x) => x === 'Settings').length === 1 && !w.includes('My Settings ›') && !w.includes('Admin'), `operative: one Settings line, no Admin (${w.join(' | ')})`);
    } else {
      check(!w.includes('Settings') && w.includes('Admin') && w.includes('My Settings ›'), `${role}: Admin is the only gear line; My Settings under their name (${w.join(' | ')})`);
      if (role === 'admin') await page.screenshot({path: path.join(SHOTS, 'phone-menu.png')});
      await page.getByLabel('My Settings', {exact: true}).click(); await page.waitForTimeout(2500);
      check(/\/account$/.test(new URL(page.url()).pathname) && !(await menuWords(page)).includes('My Settings ›'), `${role}: My Settings opens Settings and closes the menu`);
    }
    await ctx.close();
  }
  check(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close();
})().catch((e) => { console.log('STOPPED ' + e.message); process.exitCode = 1; });
