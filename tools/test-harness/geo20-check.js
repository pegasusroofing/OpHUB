// The check-in location found from the postcode (Andy, 20 Nov 2026: "can we also get the geolocation to auto find it from the
// postcode. but have it as a notification number in the project to highlight it needs to be confirmed"). It's only a
// suggestion until a manager says Yes, so check-ins are never measured from a rough postcode point. node geo20-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'geo20'); require('fs').mkdirSync(SHOTS, {recursive: true});
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'pm', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'pm', howto_dismissed: ['*']});
  const site = db.sites.find((s) => s.id === S1);
  Object.assign(site, {postcode: 'SW4 6RZ', geofence_lat: null, geofence_lon: null, geofence_suggested_lat: null, geofence_suggested_lon: null, multi_site: false, repair_contract: false});
  let looked = 0;
  await ctx.route(/api\.postcodes\.io/, (r) => { looked++; r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({status: 200, result: {latitude: 51.46012, longitude: -0.13811}})}); });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto(`${B}/sites/${S1}`); await page.waitForTimeout(6000);
  check(looked > 0 && site.geofence_suggested_lat === 51.46012 && site.geofence_lat == null, `opening the job looks the postcode up and keeps it as a suggestion (check-ins still unmeasured) (${site.geofence_suggested_lat})`);
  await page.reload(); await page.waitForTimeout(5000);
  let t = await text();
  check(/Confirm The Check-In Location/.test(t) && /Found from SW4 6RZ/.test(t), 'the project shows Confirm The Check-In Location, with a 1');
  await page.screenshot({path: path.join(SHOTS, '1-project-confirm-row-phone.png')});
  await page.getByText('Confirm The Check-In Location').first().click(); await page.waitForTimeout(5000);
  t = await text();
  check(/Found From The Postcode/.test(t) && /Is This The Right Place For Check-Ins\?/.test(t), 'Check In asks: Is This The Right Place For Check-Ins? Yes / No');
  await page.screenshot({path: path.join(SHOTS, '2-checkin-confirm-phone.png')});
  await page.getByText('Yes', {exact: true}).first().click(); await page.waitForTimeout(2000);
  check(site.geofence_lat === 51.46012 && site.geofence_lon === -0.13811 && site.geofence_suggested_lat == null, 'Yes makes it the check-in point and clears the suggestion');
  await page.goto(`${B}/sites/${S1}`); await page.waitForTimeout(5000);
  check(!/Confirm The Check-In Location/.test(await text()), 'and the project no longer asks');
  // An operative never triggers it.
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
