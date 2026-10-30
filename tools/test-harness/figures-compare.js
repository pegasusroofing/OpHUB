// Same data in the old app and the new one: does every money figure and percentage on the Finance pages agree?
// Lists figures that appear on one side only, page by page. Text of both is saved in shots/compare/.
const {chromium, makeContext, serve, login, S1} = require('./harness');
const fs = require('fs'), path = require('path');
const world = require('./seeds/world');
const OUT = path.join(__dirname, 'shots', 'compare'); fs.mkdirSync(OUT, {recursive: true});
const J = `/fin/job/${S1}`, O = `#/site/${S1}/finance`;
const PAGES = [
  ['overview', O, J],
  ['costs', `${O}/costs`, `${J}/costs`],
  ['budget', `${O}/budget`, `${J}/budget`],
  ['variations', `${O}/variations`, `${J}/variations`],
  ['dayworks', `${O}/dayworks`, `${J}/dayworks`],
  ['boq', `${O}/contract`, `${J}/boq`],
  ['summary', `${O}/summary`, `${J}/summary`],
  ['monthly', `${O}/monthly`, `${J}/monthly`],
  ['application-draft', `${O}/application/ap2`, `${J}/application/ap2`],
  ['application-certified', `${O}/application/a1`, `${J}/application/a1`],
  ['invoice', `${O}/invoice/v1`, `${J}/invoice/v1`],
  ['po', `${O}/po/po1`, '/fin/po/po1'],
  ['subcontract', `${O}/sub/sc1`, '/fin/sub/sc1'],
  ['jobs', '#/finance/jobs', '/fin/jobs'],
  ['sales-invoices', '#/finance/sales/invoices', '/fin/sales'],
  ['sales-apps', '#/finance/sales/apps', '/fin/sales?tab=apps'],
  ['purchases-orders', '#/finance/purchases/orders', '/fin/purchases'],
  ['purchases-invoices', '#/finance/purchases/invoices', '/fin/purchases?tab=invoices'],
  ['subs', '#/finance/subs', '/fin/subs'],
  ['yard', '#/finance/yard', '/fin/yard'],
];
const figures = (t) => new Set((t.match(/[−-]?£\s?[\d,]+(?:\.\d{1,2})?k?|-?\d+(?:\.\d+)?%/g) || []).map((x) => x.replace(/\s/g, '').replace('−', '-').replace(/\.00$/, '')));
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
    const was = await oldP.evaluate(() => document.body.innerText);
    await oldP.evaluate((h) => go(h), oldR).catch(() => {});
    for (let i = 0; i < 16; i++) { await oldP.waitForTimeout(500); if ((await oldP.evaluate(() => document.body.innerText)) !== was) break; }
    await oldP.waitForTimeout(3000);
    await newP.goto('http://localhost:8081' + newR); await newP.waitForTimeout(5000);
    const ot = await oldP.evaluate(() => document.body.innerText), nt = await newP.evaluate(() => document.body.innerText);
    fs.writeFileSync(path.join(OUT, name + '.old.txt'), ot); fs.writeFileSync(path.join(OUT, name + '.new.txt'), nt);
    const om = figures(ot), nm = figures(nt);
    const onlyOld = [...om].filter((x) => !nm.has(x)), onlyNew = [...nm].filter((x) => !om.has(x));
    if (!onlyOld.length && !onlyNew.length) same++; else diffs++;
    console.log(`${name}: old ${om.size}, new ${nm.size}, same ${[...om].filter((x) => nm.has(x)).length}${onlyOld.length ? ' | ONLY OLD ' + onlyOld.join(' ') : ''}${onlyNew.length ? ' | ONLY NEW ' + onlyNew.join(' ') : ''}`);
  }
  console.log(`pages matching ${same}, differing ${diffs}`);
  srv.close(); await browser.close(); process.exit(0);
})();
