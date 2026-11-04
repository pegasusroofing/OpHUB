// Weather pop-up (Andy, 4 Nov 2026 late), fake database and a made-up forecast: tap the weather on the job home →
// Today (now, high / low, hour by hour), a Next 5 Days tab, and Email Weather Delay opening the filled-in email.
// node weatherpop-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const forecast = () => {
  const days = [0, 1, 2, 3, 4, 5].map(day), hours = [];
  days.forEach((d) => { for (let h = 0; h < 24; h++) hours.push(`${d}T${String(h).padStart(2, '0')}:00`); });
  return {
    current: {temperature_2m: 9.4, weather_code: 61, wind_speed_10m: 14, apparent_temperature: 6},
    hourly: {time: hours, temperature_2m: hours.map((_, i) => 6 + (i % 7)), weather_code: hours.map((_, i) => [0, 3, 61, 80][i % 4]), precipitation_probability: hours.map((_, i) => (i * 13) % 100), wind_speed_10m: hours.map((_, i) => 8 + (i % 9))},
    daily: {time: days, weather_code: [61, 3, 0, 80, 2, 45], temperature_2m_max: [11, 12, 13, 10, 9, 12], temperature_2m_min: [4, 5, 6, 3, 2, 5], precipitation_probability_max: [80, 20, 5, 70, 30, 10], wind_speed_10m_max: [20, 15, 10, 25, 18, 12], sunrise: [`${days[0]}T07:01`], sunset: [`${days[0]}T16:32`]},
  };
};
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const W of [390, 1300]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: W, height: W < 500 ? 844 : 1000}});
    require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*'];
    const site = db.sites.find((s) => s.id === S1); site.postcode = 'SW4 6RZ';
    await ctx.route(/api\.postcodes\.io/, (r) => r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({result: {latitude: 51.46, longitude: -0.14}})}));
    await ctx.route(/api\.open-meteo\.com/, (r) => r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(forecast())}));
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto(B + '/sites/' + S1); await page.waitForTimeout(5000);
    const wbtn = page.getByLabel(/^Weather:/).first();
    check(await wbtn.count() > 0, `${W}: weather shows on the job home`);
    await wbtn.click(); await page.waitForTimeout(1500);
    let t = await page.evaluate(() => document.body.innerText);
    check(/Today/.test(t) && /Next 5 Days/.test(t) && /High 11° · Low 4°/.test(t) && /HOUR BY HOUR/.test(t) && /Feels like 6°/.test(t), `${W}: Today shows now, high/low and hour by hour`);
    check(/Email Weather Delay/.test(t), `${W}: Email Weather Delay button`);
    await page.screenshot({path: path.join(__dirname, 'shots', 'job', `weather-today-${W}.png`)});
    await page.getByText('Next 5 Days', {exact: true}).click(); await page.waitForTimeout(600);
    t = await page.evaluate(() => document.body.innerText);
    check(/Tomorrow/.test(t) && /12° \/ 5°/.test(t) && (t.match(/mph/g) || []).length >= 5, `${W}: Next 5 Days lists 5 days`);
    await page.screenshot({path: path.join(__dirname, 'shots', 'job', `weather-5day-${W}.png`)});
    await page.getByText(/Email Weather Delay/).last().click(); await page.waitForTimeout(800);
    t = await page.evaluate(() => document.body.innerText);
    check(/Subject/.test(t) && /Message/.test(t) && await page.getByLabel('Back').count() > 0, `${W}: email form opens with a Back arrow`);
    await page.getByRole('dialog').getByLabel('Back').click(); await page.waitForTimeout(500);
    check(await page.getByText('Next 5 Days', {exact: true}).count() > 0, `${W}: Back returns to the weather`);
    await page.getByLabel('Close').last().click(); await page.waitForTimeout(500);
    check(await page.getByText('HOUR BY HOUR').count() === 0, `${W}: ✕ closes it`);
    await ctx.close();
  }
  check(!errs.length, `no errors ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
})();
