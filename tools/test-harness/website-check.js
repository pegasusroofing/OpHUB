// The website (Andy, 14 Nov 2026): Home, Projects and Finance pages; no prices anywhere (enquire / quote only); Get A
// Quote fills in the enquiry form (a quote, for which system) and that goes at the start of the message sent to the
// book-demo function; the Projects / Finance pages' Get A Quote opens the form ready; nothing runs off the side of a
// phone; no page errors. Serves the repo's top folder itself. node website-check.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright');
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'shots', 'rams14');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const TYPES = {'.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'};
(async () => {
  const srv = http.createServer((q, r) => {
    let f = decodeURIComponent(q.url.split('?')[0]); if (f === '/') f = '/index.html';
    // As vercel.json: /projects is projects.html (clean addresses, Andy 14 Nov 2026).
    if (!path.extname(f) && fs.existsSync(path.join(ROOT, f + '.html'))) f += '.html';
    const p = path.join(ROOT, f);
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, {'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream'}); r.end(fs.readFileSync(p));
  }).listen(0);
  const B = `http://localhost:${srv.address().port}`;
  const browser = await chromium.launch(); const errs = [];
  const page = await browser.newPage({viewport: {width: 1300, height: 900}});
  page.on('pageerror', (e) => errs.push(e.message));
  let sent = null;
  await page.route('**/functions/v1/book-demo', (rt) => { sent = JSON.parse(rt.request().postData() || '{}'); rt.fulfill({status: 200, contentType: 'application/json', body: '{"ok":true}'}); });
  for (const pg of ['/', '/projects', '/finance']) {
    await page.goto(B + pg); await page.waitForTimeout(800);
    const t = await page.locator('body').innerText();
    check(!/£\s?\d{3}\/month|per month|\/mo\b/i.test(t) && !/£(199|299|399|500|549|749|899|1,299)\b/.test(t), `${pg}: no prices shown`);
  }
  await page.goto(B + '/'); await page.waitForTimeout(800);
  const t = await page.locator('body').innerText();
  check(/One price per company/.test(t) && (await page.getByText('Get A Quote', {exact: true}).count()) === 3, 'home: Pricing says enquire, with three Get A Quote buttons');
  await page.locator('#pricing .qcard.f a').click(); await page.waitForTimeout(500);
  check(await page.locator('#dWant').inputValue() === 'A quote' && await page.locator('#dSys').inputValue() === 'OpHUB Finance', 'Finance\'s Get A Quote fills in: A quote, for OpHUB Finance');
  await page.screenshot({path: path.join(SHOTS, 'website-form.png')});
  await page.fill('#dName', 'Test Person'); await page.fill('#dEmail', 'test@example.com'); await page.fill('#dMsg', '20 operatives');
  await page.click('#demoBtn'); await page.waitForTimeout(1200);
  check(!!sent && sent.message === 'A quote for OpHUB Finance. 20 operatives', `the message says what they want (${sent && sent.message})`);
  check(await page.locator('#demoDone').isVisible(), 'the thank-you shows');
  await page.goto(B + '/projects'); await page.waitForTimeout(800);
  await page.getByText('Get A Quote', {exact: true}).first().click(); await page.waitForTimeout(1200);
  check(/quote=projects/.test(page.url()) && await page.locator('#dSys').inputValue() === 'OpHUB Projects', 'Projects page: Get A Quote opens the form for OpHUB Projects');
  await page.goto(B + '/#pricing'); await page.waitForTimeout(800);
  await page.locator('#pricing').screenshot({path: path.join(SHOTS, 'website-pricing.png')});
  const ph = await browser.newPage({viewport: {width: 390, height: 844}});
  for (const pg of ['/', '/projects', '/finance']) {
    await ph.goto(B + pg); await ph.waitForTimeout(600);
    const over = await ph.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(over <= 0, `${pg} on a phone: nothing runs off the side (${over})`);
  }
  for (const pg of ['/', '/projects', '/finance']) { await page.goto(B + pg); await page.waitForTimeout(400); const bad = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => /.html/.test(h) && h !== '/app.html')); check(!bad.length, pg + ': no .html addresses in its links (Sign In stays /app.html) ' + bad.join(' ')); const imgs = await page.evaluate(() => [...document.querySelectorAll('img.appshot')].map((i) => i.naturalWidth)); check(imgs.length > 0 && imgs.every((w) => w > 300), pg + ': the real app pictures load (' + imgs.join(', ') + ')'); }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close(); srv.close();
})();
