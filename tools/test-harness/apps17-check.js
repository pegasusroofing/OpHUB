// Finance › Sales › Applications (Andy, 17 Nov 2026): "can we make the app column slightly wider, also how can we have
// it filter down by applications then certificates, then all? Without adding bars? Change app column text to number"
// and "a column before number for what it is? App or cert?". Phone: Type (App / Cert) with its ▾ in the search row
// under the headings (Applications, Certificates, All), then Number, a little wider. Laptop: Type (Application /
// Certificate, with its tick list) and Number. Also Finance › Projects' Value Of Works bar sits in a holder that keeps
// it above the iPhone's bottom bar ("the footer bar sits below screen"). Fake database. node apps17-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081', S1 = '11111111-1111-1111-1111-111111111111';
const SHOTS = path.join(__dirname, 'shots', 'apps17');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']}); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  Object.assign(db.profiles.find((p) => p.id === 'me'), {role: 'admin', finance_enabled: true, howto_dismissed: ['*']});
  Object.assign(db.organizations[0], {has_pm: true, has_finance: true});
  const O = db.organizations[0].id;
  db.job_finance = [{site_id: S1, org_id: O, billing_type: 'application', contract_value: 48000}];
  db.fin_applications = [
    {id: 'a1', org_id: O, site_id: S1, number: 1, status: 'certified', valuation_date: '2026-09-15', gross: 10000, net_due: 9500, cert_date: '2026-09-18', cert_gross: 10000, cert_retention: 500, cert_previous: 0, cert_discount: 0, cert_net: 9500, lines: []},
    {id: 'a2', org_id: O, site_id: S1, number: 2, status: 'certified', valuation_date: '2026-10-15', gross: 21500, net_due: 9800, cert_date: '2026-10-18', cert_gross: 21000, cert_retention: 1050, cert_previous: 10450, cert_discount: 0, cert_net: 9500, lines: []},
    {id: 'a3', org_id: O, site_id: S1, number: 3, status: 'submitted', valuation_date: '2026-11-15', gross: 30000, net_due: 8000, lines: []},
  ];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (/cannot contain a nested|cannot be a descendant/.test(m.text())) errs.push(m.text().slice(0, 90)); });
  const vis = (sel) => page.locator(`${sel} >> visible=true`).first();
  const rows = () => page.evaluate(() => { const t = [...document.querySelectorAll('[aria-label="Applications"]')].find((e) => e.getBoundingClientRect().width > 0); return t ? [...t.querySelectorAll('[role="button"]')].filter((b) => !/^Search|^Sort/.test(b.getAttribute('aria-label') || '')).map((b) => b.innerText.split('\n').slice(0, 2).join(' ')).filter((x) => /^(App|Cert) /.test(x)) : []; });
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);

  // ---- Phone ----
  await page.goto(B + '/fin/sales?tab=apps&f=all'); await page.waitForTimeout(5000);
  const heads = await page.evaluate(() => { const t = [...document.querySelectorAll('[aria-label="Applications"]')].find((e) => e.getBoundingClientRect().width > 0); return t ? t.innerText.split('\n').slice(0, 6).join(' | ') : ''; });
  check(/^TYPE \| NO\. \| PROJECT \| AMOUNT/i.test(heads), `phone: Type, then No. (was App; Andy chose No. over Number) (${heads})`);
  const look = await page.evaluate(() => {
    const leaves = [...document.querySelectorAll('div[dir="auto"]')].filter((e) => e.getBoundingClientRect().width > 0);
    const hs = leaves.filter((e) => /^(TYPE|NO\.|PROJECT|AMOUNT)$/.test(e.textContent.trim()));
    const no = leaves.find((e) => e.textContent.trim() === '3'), col = no && no.parentElement.getBoundingClientRect(), nb = no && no.getBoundingClientRect();
    return {lines: hs.map((h) => getComputedStyle(h).textDecorationLine), centred: col && nb ? Math.round(Math.abs((nb.left + nb.right) / 2 - (col.left + col.right) / 2)) : 99};
  });
  check(look.lines.length === 4 && look.lines.every((x) => x === 'underline'), `phone: every heading underlined, Type too (${look.lines.join(',')})`);
  check(look.centred < 2, `phone: the number is centred above its date (off by ${look.centred}px)`);
  const w = await page.evaluate(() => { const b = document.querySelector('[aria-label="Search No."]'); return b ? Math.round(b.getBoundingClientRect().width) : 0; });
  check(w >= 60, `phone: No. a little wider (${w}px, was 52)`);
  let r = await rows();
  check(r.length === 3 && r.filter((x) => x.startsWith('Cert ')).length === 2 && r.some((x) => x.startsWith('App 3')), `phone: each row says App or Cert (${r.join(' | ')})`);
  await page.screenshot({path: path.join(SHOTS, 'apps-phone.png')});
  // The ▾ under Type: Applications, Certificates, All.
  await vis('[aria-label="Search Type"]').click(); await page.waitForTimeout(700);
  const menu = await page.evaluate(() => document.body.innerText);
  check(/Applications\n/.test(menu) && /Certificates\n/.test(menu) && /✓ All/.test(menu), 'phone: the ▾ under Type offers Applications, Certificates, All');
  await page.screenshot({path: path.join(SHOTS, 'type-choice-phone.png')});
  await page.getByText('Certificates', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(1000);
  r = await rows();
  check(r.length === 2 && r.every((x) => x.startsWith('Cert ')) && /Cert ▾/.test(await vis('[aria-label="Search Type"]').innerText()), `phone: Certificates only, its box says Cert (${r.join(' | ')})`);
  await vis('[aria-label="Search Type"]').click(); await page.waitForTimeout(700);
  await page.getByText('Applications', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(1000);
  r = await rows();
  check(r.length === 1 && r[0].startsWith('App 3'), `phone: Applications only (${r.join(' | ')})`);
  await page.screenshot({path: path.join(SHOTS, 'apps-only-phone.png')});
  await vis('[aria-label="Search Type"]').click(); await page.waitForTimeout(700);
  await page.getByText('All', {exact: true}).filter({visible: true}).first().click(); await page.waitForTimeout(1000);
  check((await rows()).length === 3, 'phone: All again');
  check(await page.evaluate(() => [...document.querySelectorAll('div')].filter((d) => /^Applications$|^Certificates$/.test(d.innerText || '') && d.getBoundingClientRect().height > 30 && d.getBoundingClientRect().width > 300).length) === 0, 'phone: no new bar added');

  // ---- Phone: Projects' Value Of Works bar ----
  await page.goto(B + '/fin/jobs'); await page.waitForTimeout(5000);
  const foot = await page.evaluate(() => { const f = document.querySelector('[aria-label="Value of works"]'); if (!f) return null; const h = f.parentElement, r = f.getBoundingClientRect(); return {bottom: Math.round(r.bottom), vh: innerHeight, holderPad: getComputedStyle(h).paddingBottom, holderBg: getComputedStyle(h).backgroundColor}; });
  check(!!foot && foot.bottom <= foot.vh && foot.holderBg === 'rgb(255, 255, 255)', `phone Projects: the Value Of Works bar is fully on screen, in a white holder that pads it above the iPhone's bar (${JSON.stringify(foot)})`);
  await page.screenshot({path: path.join(SHOTS, 'projects-phone.png')});

  // ---- Laptop ----
  await page.setViewportSize({width: 1300, height: 900});
  await page.goto(B + '/fin/sales?tab=apps&f=all'); await page.waitForTimeout(5000);
  const lt = await page.evaluate(() => document.body.innerText);
  check(/\nType\b/i.test(lt) && /\nNo\./i.test(lt) && /Certificate\n/.test(lt) && /Application\n/.test(lt), 'laptop: Type (Application / Certificate) and No. columns');
  await page.screenshot({path: path.join(SHOTS, 'apps-laptop.png'), clip: {x: 0, y: 0, width: 1300, height: 560}});

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
