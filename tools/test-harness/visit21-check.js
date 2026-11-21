// Visitor sign-in (Andy, 21 Nov 2026: "a visitor button / qr code for each site that can sign and the visitors sign in giving
// their name number email company and then sign out"). The public page from the job's QR code, on a phone, not signed in
// to OpHUB. The database functions are answered by the harness. node visit21-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'visit21'); require('fs').mkdirSync(SHOTS, {recursive: true});
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
  const calls = []; let out = null;
  global.__rpc = (n, b) => {
    calls.push([n, b]);
    if (n === 'visitor_site_info') return b.p_key === 'k-good' ? {site: 'Abington Park School', company: 'RTB Roofing Ltd', logo: null, colour: null} : null;
    if (n === 'visitor_sign_in') return {id: 'v1', token: 't1', signed_in_at: new Date().toISOString()};
    if (n === 'visitor_status') return {name: 'Vera Visitor', signed_in_at: new Date(Date.now() - 3600e3).toISOString(), signed_out_at: out};
    if (n === 'visitor_sign_out') { out = new Date().toISOString(); return true; }
    return undefined;
  };
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  await page.goto(`${B}/visit/k-bad`); await page.waitForTimeout(6000);
  check(/This sign-in link isn.t working/.test(await text()), 'a link that isn\'t a job\'s says so');
  await page.goto(`${B}/visit/k-good`); await page.waitForTimeout(6000);
  let t = await text();
  check(/Visitor Sign-In/.test(t) && /Abington Park School · RTB Roofing Ltd/.test(t) && /Your Name \*/.test(t) && /Phone Number \*/.test(t) && /Email/.test(t) && /Company/.test(t), 'the page: the job and company, then name, phone, email and company');
  await page.getByLabel('Your Name *').fill('Vera Visitor');
  await page.getByLabel('Phone Number *').fill('07700 900444');
  await page.getByLabel('Email').fill('vera@bc.example');
  await page.getByLabel('Company').fill('Building Control');
  await page.getByRole('button', {name: 'Sign In'}).click(); await page.waitForTimeout(800);
  check(/Tick to say you.ll follow the site rules/.test(await text()), 'it asks them to agree to the site rules first');
  await page.getByRole('checkbox').click(); await page.waitForTimeout(300);
  await page.screenshot({path: path.join(SHOTS, 'sign-in-phone.png'), fullPage: true});
  await page.getByRole('button', {name: 'Sign In'}).click(); await page.waitForTimeout(2000);
  const si = calls.find(([n]) => n === 'visitor_sign_in');
  t = await text();
  check(!!si && si[1].p_key === 'k-good' && si[1].p_name === 'Vera Visitor' && si[1].p_phone === '07700 900444' && si[1].p_email === 'vera@bc.example' && si[1].p_company === 'Building Control', 'Sign In sends their details');
  check(/You.re Signed In/.test(t) && /Sign Out/.test(t), 'then: You\'re Signed In, with Sign Out');
  await page.screenshot({path: path.join(SHOTS, 'signed-in-phone.png'), fullPage: true});
  await page.goto(`${B}/visit/k-good`); await page.waitForTimeout(6000);
  check(/You.re Signed In/.test(await text()), 'coming back to the page on the same phone, they\'re still signed in');
  await page.getByRole('button', {name: 'Sign Out'}).click(); await page.waitForTimeout(2000);
  t = await text();
  check(!!calls.find(([n, b]) => n === 'visitor_sign_out' && b.p_id === 'v1' && b.p_token === 't1') && /Signed Out/.test(t) && /Thank you, Vera Visitor/.test(t), 'Sign Out signs them out');
  await page.screenshot({path: path.join(SHOTS, 'signed-out-phone.png'), fullPage: true});
  await ctx.close();
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
