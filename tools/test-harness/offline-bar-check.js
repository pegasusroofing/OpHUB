// With no signal, screens show the saved copy and the "📡 Offline — showing saved data" bar; tap it once the
// signal is back → live data again and "✓ Back online".
const {chromium, makeContext} = require('./harness');
(async()=>{
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport:{width:1300, height:900}});
  db.profiles[0].howto_dismissed = ['*'];
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/sites'); await page.waitForTimeout(5000);
  let off = true;
  await ctx.route('**/rest/v1/sites*', (r) => off ? r.abort() : r.fallback());
  await page.evaluate(() => window.dispatchEvent(new Event('online'))); await page.waitForTimeout(20000); // supabase retries a few times first
  console.log('offline bar', await page.getByText(/Offline — showing saved data/).count(), '| list still shown', (await page.getByText('Studley Rd').count()) > 0);
  off = false;
  const bar = page.getByText(/Offline — showing saved data/).first();
  if (await bar.count()) { await bar.click(); await page.waitForTimeout(1500); }
  console.log('after retry: offline bar', await page.getByText(/Offline — showing saved data/).count(), '| back online', await page.getByText('✓ Back online').count());
  console.log('errors', errs.join(' / ').slice(0,300) || 'none');
  await browser.close(); process.exit(0);
})();
