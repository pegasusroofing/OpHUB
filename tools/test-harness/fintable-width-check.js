// Finance list tables fit the page on a laptop: every column on show without scrolling sideways.
const {chromium, makeContext, S1} = require('./harness');
const world = require('./seeds/world');
const B = 'http://localhost:8081';
(async () => {
  const browser = await chromium.launch();
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  world(db); db.profiles.find((p) => p.id === 'me').role = 'admin';
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  await page.goto(B + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(4000);
  let bad = 0;
  for (const r of ['/fin/jobs', '/fin/sales?tab=apps&f=all', '/fin/sales?tab=invoices&f=all', '/fin/purchases?tab=orders', '/fin/purchases?tab=invoices&f=all', '/fin/purchases?tab=plant', '/fin/subs?tab=orders', '/fin/subs?tab=apps&f=all', '/fin/subs', '/fin/directory', '/fin/directory?kind=supplier', '/fin/directory?kind=labour', `/fin/job/${S1}/parts`]) {
    await page.goto(B + r); await page.waitForTimeout(2500);
    const o = await page.evaluate(() => { const bars = [...document.querySelectorAll('div')].filter((d) => d.scrollWidth > d.clientWidth + 2 && getComputedStyle(d).overflowX !== 'visible' && d.clientWidth > 300); const inp = [...document.querySelectorAll('input[aria-label^="Filter "]')]; return {over: bars.map((b) => b.scrollWidth + '/' + b.clientWidth).slice(0, 2), filters: inp.length}; });
    if (o.over.length) bad++;
    console.log((o.over.length ? 'WIDE' : 'ok  ') + ' ' + r + ' filters ' + o.filters + ' ' + o.over.join(' '));
  }
  await page.goto(B + '/fin/sales?tab=invoices&f=all'); await page.waitForTimeout(2500); await page.screenshot({path: 'shots/fintable-width.png'});
  console.log(bad ? bad + ' too wide' : 'all fit');
  await browser.close(); process.exit(bad ? 1 : 0);
})();
