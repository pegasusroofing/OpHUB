// Old app vs new app, side by side, for every screen an operative or a driver sees (5 Nov 2026). Fake database only.
//   node cmp-ops.js operative|driver [width] [name filter]
// Saves shots/cmp/ops/<name>-old-<w>.png and -new-<w>.png (full page), plus <name>-old-<w>.txt / -new-<w>.txt:
// the words on the page and every button, so the wording can be compared line by line.
const {chromium, makeContext, serve, login, S1} = require('./harness');
const fs = require('fs'), path = require('path');
const role = process.argv[2] || 'operative', W = +(process.argv[3] || 390), only = process.argv[4] ? new RegExp(process.argv[4]) : null;
const OUT = path.join(__dirname, 'shots', 'cmp', 'ops'); fs.mkdirSync(OUT, {recursive: true});
const s = (x) => `#/site/${S1}/${x}`, n = (x) => `/sites/${S1}${x ? '/' + x : ''}`;
const SCREENS = {
  operative: [
    ['home', '#/home', '/home'],
    ['sites', '#/sites', '/sites'],
    ['jobhome', s('home'), n(''), '^not now$'],
    ['checkin', s('checkin'), n('checkin')],
    ['schedule', s('schedule'), n('schedule'), '^in progress$'],
    ['snagging', s('snagging'), n('snagging')],
    ['snaglist', s('snagging/list'), n('snagging/list'), 'close snag'],
    ['variations', s('snagging/variations'), n('snagging/variations')],
    ['materials', s('materials'), n('materials')],
    ['expenses', s('expenses'), n('expenses')],
    ['hs', s('hs'), n('hs')],
    ['rams', s('hs/rams'), n('hs/rams')],
    ['coshh', s('hs/coshh'), n('hs/coshh')],
    ['tbt', s('hs/tbt'), n('hs/tbt')],
    ['tbt-view', s('hs/tbt/tb1'), n('hs/tbt/tb1')],
    ['briefings', s('hs/briefings'), n('hs/briefings')],
    ['briefing-view', s('hs/briefings/view/bf1'), n('hs/briefings/bf1')],
    ['mytools', s('hs/mytools'), n('hs/mytools')],
    ['havspuwer', s('hs/havspuwer'), n('hs/havspuwer')],
    ['havs', s('hs/havs'), n('hs/havs')],
    ['puwer', s('hs/puwer'), n('hs/puwer')],
    ['incidents', s('hs/incidents'), n('hs/incidents')],
    ['incident-new', s('hs/incidents/new'), n('hs/incidents/new')],
    ['ppe', s('ppe'), n('ppe')],
    ['messages', s('messages'), n('messages')],
    ['inbox', '#/inbox', '/inbox'],
    ['calendar', s('calendar'), n('calendar'), '^＋ ?add'],
    ['account', '#/account', '/account'],
    ['signature', '#/signature', '/signature'],
    ['onboarding', '#/onboarding-checklist', '/getting-started'],
    ['mycerts', '#/operative-dashboard', '/dashboard'],
    ['mc', s('mc'), n('mc')],
  ],
  driver: [
    ['drv-home', '#/driver', '/home', 'book time off'],
    ['drv-checkin', '#/driver/checkin', '/driver/checkin'],
    ['drv-schedule', '#/driver/schedule', '/driver/schedule', 'slates and battens'],
    ['drv-vehicle', '#/driver/vehicle-checklist', '/driver/vehicle'],
    ['drv-account', '#/account', '/account'],
    ['drv-signature', '#/signature', '/signature'],
  ],
}[role].filter(([name]) => !only || only.test(name));
const seedAll = (db) => { require('./seeds/world')(db); require('./seeds/opscmp')(db, role); };
// The words on the page and every tappable thing, so the two apps can be compared line by line.
const words = () => {
  const root = document.body;
  const btn = [...document.querySelectorAll('button, [role="button"], [onclick], a[href], select, input, textarea')]
    .filter((e) => e.offsetParent !== null).map((e) => (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') ? `[${e.tagName.toLowerCase()} ${e.type || ''} "${e.placeholder || e.value || ''}"]` : e.tagName === 'SELECT' ? `[select: ${[...e.options].map((o) => o.text).join(' | ')}]` : (e.innerText || e.getAttribute('aria-label') || e.title || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  return 'TEXT\n' + root.innerText + '\n\nBUTTONS\n' + [...new Set(btn)].join('\n');
};
// Press one button (matched by its words) and screenshot what it opens: <name>-<app>-<w>-pop.png / .txt.
async function pressAndShoot(page, re, file) {
  try {
    await page.getByText(new RegExp(re, 'i')).first().click({timeout: 2500}); await page.waitForTimeout(1500);
    await page.screenshot({path: path.join(OUT, file + '.png'), fullPage: true}); fs.writeFileSync(path.join(OUT, file + '.txt'), await page.evaluate(words));
  } catch (e) { console.log('press failed', file, e.message.slice(0, 80)); }
}
(async () => {
  const browser = await chromium.launch();
  const opt = {viewport: {width: W, height: W < 500 ? 844 : 900}};
  const geo = async (ctx) => { await ctx.grantPermissions(['geolocation']); await ctx.setGeolocation({latitude: 51.4613, longitude: -0.1376}); };
  // Old app (app.html)
  {
    const {srv, port} = await serve();
    const {ctx, db} = await makeContext(browser, role, [], opt); seedAll(db); await geo(ctx);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await login(page, port);
    for (const [name, old, , press] of SCREENS) {
      await page.evaluate((h) => go(h), old).catch(() => {}); await page.waitForTimeout(3000);
      await page.screenshot({path: path.join(OUT, `${name}-old-${W}.png`), fullPage: true});
      fs.writeFileSync(path.join(OUT, `${name}-old-${W}.txt`), 'URL ' + page.url().split('#')[1] + '\n' + await page.evaluate(words));
      if (press) await pressAndShoot(page, press, `${name}-old-${W}-pop`);
      console.log('old', name);
    }
    console.log('old errors:', errs.slice(0, 5).join(' | '));
    await ctx.close(); srv.close();
  }
  // New app (Expo dev server)
  {
    const {ctx, db} = await makeContext(browser, role, [], opt); seedAll(db); await geo(ctx);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    for (const [name, , neu, press] of SCREENS) {
      await page.goto('http://localhost:8081' + neu); await page.waitForTimeout(4500);
      await page.screenshot({path: path.join(OUT, `${name}-new-${W}.png`), fullPage: true});
      fs.writeFileSync(path.join(OUT, `${name}-new-${W}.txt`), 'URL ' + page.url().replace('http://localhost:8081', '') + '\n' + await page.evaluate(words));
      if (press) await pressAndShoot(page, press, `${name}-new-${W}-pop`);
      console.log('new', name);
    }
    console.log('new errors:', errs.slice(0, 5).join(' | '));
  }
  await browser.close();
})();
