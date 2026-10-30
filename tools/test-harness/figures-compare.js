// Same data in the old app and the new one: does every money figure on the Finance pages agree?
// Lists figures that appear on one side only, page by page. Text of both is saved in shots/compare/.
const {chromium, makeContext, serve, login, S1} = require('./harness');
const fs = require('fs'), path = require('path');
const world = require('./seeds/world');
const OUT = path.join(__dirname, 'shots', 'compare'); fs.mkdirSync(OUT, {recursive: true});
const PAGES = [
  ['overview', `#/site/${S1}/finance`, `/fin/job/${S1}`],
  ['costs', `#/site/${S1}/finance/costs`, `/fin/job/${S1}/costs`],
  ['budget', `#/site/${S1}/finance/budget`, `/fin/job/${S1}/budget`],
  ['variations', `#/site/${S1}/finance/variations`, `/fin/job/${S1}/variations`],
  ['dayworks', `#/site/${S1}/finance/dayworks`, `/fin/job/${S1}/dayworks`],
  ['boq', `#/site/${S1}/finance/contract`, `/fin/job/${S1}/boq`],
  ['summary', `#/site/${S1}/finance/summary`, `/fin/job/${S1}/summary`],
  ['monthly', `#/site/${S1}/finance/monthly`, `/fin/job/${S1}/monthly`],
  ['application', `#/site/${S1}/finance/application/ap2`, `/fin/job/${S1}/application/ap2`],
  ['certified application', `#/site/${S1}/finance/application/a1`, `/fin/job/${S1}/application/a1`],
  ['invoice', `#/site/${S1}/finance/invoice/v1`, `/fin/job/${S1}/invoice/v1`],
  ['po', `#/finance/po/po1`, `/fin/po/po1`],
  ['purchase invoice', `#/finance/purchase-invoice/pi1`, `/fin/pinv/pi1`],
  ['subcontract', `#/finance/subcontract/sc1`, `/fin/sub/sc1`],
  ['jobs', `#/finance`, `/fin/jobs`],
  ['sales', `#/finance/sales`, `/fin/sales`],
  ['purchases', `#/finance/purchases`, `/fin/purchases`],
  ['reports', `#/finance/reports`, `/fin/reports`],
  ['yard', `#/finance/yard`, `/fin/yard`],
];
const money = (t) => new Set((t.match(/−?-?£\s?[\d,]+(?:\.\d{1,2})?k?/g) || []).map((x) => x.replace(/\s/g, '').replace('−', '-').replace(/\.00$/, '')));
const prep = (db) => { world(db); db.profiles.find((p) => p.id === 'me').role = 'admin'; };
(async () => {
  const browser = await chromium.launch();
  const {srv, port} = await serve();
  const a = await makeContext(browser, 'admin', [], {viewport: {width: 1400, height: 1000}}); prep(a.db);
  const oldP = await a.ctx.newPage(); oldP.setDefaultTimeout(8000); await login(oldP, port); await oldP.waitForTimeout(3000);
  const b = await makeContext(browser, 'admin', [], {viewport: {width: 1400, height: 1000}}); prep(b.db);
  const newP = await b.ctx.newPage(); newP.setDefaultTimeout(8000);
  await newP.goto('http://localhost:8081/login'); await newP.waitForTimeout(5000);
  await newP.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await newP.fill('input[type="password"]', 'pw123456');
  await newP.getByText('Sign In', {exact: true}).click(); await newP.waitForTimeout(5000);
  let same = 0, diffs = 0;
  for (const [name, oldR, newR] of PAGES) {
    await oldP.goto(`http://localhost:${port}/app.html${oldR}`); await oldP.waitForTimeout(3500);
    await newP.goto('http://localhost:8081' + newR); await newP.waitForTimeout(4500);
    const ot = await oldP.evaluate(() => (document.getElementById('app') || document.body).innerText), nt = await newP.evaluate(() => document.body.innerText);
    fs.writeFileSync(path.join(OUT, name.replace(/\s/g, '-') + '.old.txt'), ot); fs.writeFileSync(path.join(OUT, name.replace(/\s/g, '-') + '.new.txt'), nt);
    const om = money(ot), nm = money(nt);
    const onlyOld = [...om].filter((x) => !nm.has(x)), onlyNew = [...nm].filter((x) => !om.has(x));
    if (!onlyOld.length && !onlyNew.length) same++; else diffs++;
    console.log(`${name}: old ${om.size} figures, new ${nm.size}, same ${[...om].filter((x) => nm.has(x)).length}${onlyOld.length ? ' | ONLY OLD ' + onlyOld.join(' ') : ''}${onlyNew.length ? ' | ONLY NEW ' + onlyNew.join(' ') : ''}${!om.size ? ' | old text: ' + ot.slice(0, 80).replace(/\s+/g, ' ') : ''}`);
  }
  console.log(`pages matching ${same}, differing ${diffs}`);
  srv.close(); await browser.close(); process.exit(0);
})();
