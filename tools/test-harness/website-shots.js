// Pictures of the new app for the website (Andy, 14 Nov 2026: "update the website with the new version of the app ... the
// layout etc i want to show on the website"): Home on a phone and Finance › Purchase Invoices on a laptop, with the
// test company (RTB Roofing Ltd, its logo) and the real map. Saved to assets/site/. Needs the dev server on 8081 and
// docs/website/rtb-logo.jpg. node website-shots.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const world = require('./seeds/world');
const B = 'http://localhost:8081';
const OUT = path.join(__dirname, '..', '..', 'assets', 'site');
const LOGO = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'website', 'rtb-logo.jpg'));
fs.mkdirSync(OUT, {recursive: true});
const prep = async (ctx, db) => {
  // The real map tiles, and the company's logo.
  await ctx.unroute(/tiles\.openfreemap\.org/);
  await ctx.route(/org-logos/, (r) => r.fulfill({status: 200, contentType: 'image/jpeg', body: LOGO}));
  // The weather: a dry, bright day.
  await ctx.route(/api\.postcodes\.io\/(postcodes|outcodes)\/[^?]+$/, (r) => r.request().method() === 'GET' ? r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({status: 200, result: {latitude: 51.4613, longitude: -0.1376}})}) : r.fallback());
  await ctx.route(/api\.open-meteo\.com/, (r) => r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({current: {temperature_2m: 9, weather_code: 1, wind_speed_10m: 11, apparent_temperature: 7}, daily: {precipitation_probability_max: [10]}})}));
  const O = db.organizations[0].id, S1 = db.sites[0].id, S2 = (db.sites[1] || db.sites[0]).id;
  Object.assign(db.organizations[0], {name: 'RTB Roofing Ltd', has_pm: true, has_finance: true, logo_path: `${O}/logo.jpg`, color_primary: '#E3262B'});
  const me = db.profiles.find((x) => x.id === 'me') || db.profiles[0]; Object.assign(me, {role: 'admin', finance_enabled: true, howto_dismissed: ['*'], name: 'Andy Cramp'});
  const pi = (id, sup, no, d, net, status, site) => ({id, org_id: O, site_id: site, supplier_name: sup, invoice_no: no, invoice_date: d, due_date: d, net, vat: Math.round(net * 20) / 100, total: Math.round(net * 120) / 100, status, created_at: `${d}T09:00:00Z`});
  db.purchase_invoices = [
    pi('pi1', 'SIG Roofing', 'SIG-88231', '2026-11-12', 1800, 'to_approve', S1), pi('pi2', 'Jewson', 'JW-4412', '2026-11-11', 500, 'to_approve', S2),
    pi('pi3', 'Travis Perkins', 'TP-7731', '2026-11-10', 1240, 'approved', S1), pi('pi4', 'Bauder', 'BD-2291', '2026-11-08', 4010.42, 'approved', S2),
    pi('pi5', 'Marley', 'MR-1182', '2026-11-05', 2650, 'approved', S1), pi('pi6', 'GAP Hire', 'GAP-5521', '2026-11-03', 780, 'to_approve', S2),
  ];
};
const login = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(7000);
};
(async () => {
  const browser = await chromium.launch({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
  // Phone: Home.
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {shot: true, mockGeo: true}); world(db); await prep(ctx, db);
    const page = await ctx.newPage(); await login(page);
    await page.waitForTimeout(6000);
    await page.screenshot({path: path.join(OUT, 'app-home-phone.jpg'), type: 'jpeg', quality: 86});
    await ctx.close();
  }
  // Laptop: Finance › Purchases › Purchase Invoices.
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1440, height: 900}, mockGeo: true}); world(db); await prep(ctx, db);
    const page = await ctx.newPage(); await login(page);
    await page.goto(B + '/fin/purchases?tab=invoices&f=all'); await page.waitForTimeout(5000);
    await page.screenshot({path: path.join(OUT, 'app-finance-laptop.jpg'), type: 'jpeg', quality: 86});
    await page.goto(B + '/home'); await page.waitForTimeout(8000);
    await page.screenshot({path: path.join(OUT, 'app-home-laptop.jpg'), type: 'jpeg', quality: 86});
    await ctx.close();
  }
  await browser.close();
  console.log('saved', fs.readdirSync(OUT).join(', '));
})();
