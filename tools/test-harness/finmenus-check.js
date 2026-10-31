// Finance figure cards (⋯ date range, tap to go to the list), row ⋯ menus on applications and invoices, client H&S by link.
const {chromium, makeContext, S1} = require('./harness');
const world = require('./seeds/world');
const B = 'http://localhost:8081', J = `/fin/job/${S1}`;
const login = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(4000);
};
(async () => {
  const browser = await chromium.launch();
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  world(db); db.profiles.find((p) => p.id === 'me').role = 'admin';
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 150)));
  await login(page);
  let bad = 0;
  const check = (name, ok, more) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${more ? ' — ' + more : ''}`); };
  const open = async (r) => { await page.goto(B + r); await page.waitForTimeout(3000); };
  const text = () => page.evaluate(() => document.body.innerText);
  const param = (k) => new URL(page.url()).searchParams.get(k);

  // Sales figure cards.
  await open('/fin/sales');
  let t = await text();
  check('Sales cards show their dates', /Applied Value · this month/.test(t) && /Overdue · all time/.test(t));
  await page.getByLabel(/Change dates: Applied Value/).click(); await page.waitForTimeout(400);
  t = await text();
  check('Date menu lists the ranges', ['This month', 'Last month', 'This quarter', 'This year', 'All time', 'Pick dates…'].every((x) => t.includes(x)));
  await page.getByText('All time', {exact: true}).click(); await page.waitForTimeout(500);
  t = await text();
  check('Choosing All time changes the card', /Applied Value · all time/.test(t));
  await page.screenshot({path: 'shots/finmenus-sales.png'});
  await page.reload(); await page.waitForTimeout(3000);
  check('Choice is remembered', /Applied Value · all time/.test(await text()));
  await page.getByText(/^Overdue · /).click(); await page.waitForTimeout(800);
  check('Tap Overdue goes to overdue invoices', param('tab') === 'invoices' && param('f') === 'overdue', page.url().split('?')[1]);
  await page.getByText(/^Applied, Not Certified/).click(); await page.waitForTimeout(800);
  check('Tap Applied, Not Certified goes to in-progress applications', param('tab') === 'apps' && param('f') === 'open');

  // Row ⋯ on invoices.
  await open('/fin/sales?tab=invoices&f=all');
  await page.screenshot({path: 'shots/finmenus-rows.png'});
  await page.getByLabel('More').first().click(); await page.waitForTimeout(400);
  t = await text();
  check('Invoice row menu', t.includes('Open') && t.includes('View PDF') && t.includes('Void Invoice'));
  await page.getByText('Record Payment').click(); await page.waitForTimeout(500);
  const paid0 = (db.fin_payments || []).length;
  await page.getByText(/^save$/i).last().click(); await page.waitForTimeout(1200);
  check('Record Payment from the row', (db.fin_payments || []).length === paid0 + 1);
  await open('/fin/sales?tab=invoices&f=all');
  const voids0 = db.fin_invoices.filter((i) => i.status === 'void').length;
  await page.getByLabel('More').first().click(); await page.waitForTimeout(400);
  await page.getByText('Void Invoice').click(); await page.waitForTimeout(400);
  await page.getByText(/^void invoice$/i).last().click(); await page.waitForTimeout(1200);
  check('Void from the row', db.fin_invoices.filter((i) => i.status === 'void').length === voids0 + 1);

  // Row ⋯ on applications.
  await open('/fin/sales?tab=apps&f=all');
  await page.getByLabel('More').first().click(); await page.waitForTimeout(400);
  t = await text();
  check('Application row menu', ['Open', 'Export Excel', 'Download PDF', 'Delete Application'].every((x) => t.includes(x)));
  await page.getByText('Delete Application').click(); await page.waitForTimeout(600);
  t = await text();
  await page.screenshot({path: 'shots/finmenus-delapp.png'});
  check('Delete asks or explains first', /Delete application No\.|void the invoice first/.test(t));

  // Purchases and Subs cards go to their list.
  await open('/fin/purchases');
  await page.getByText(/^To Approve · /).click(); await page.waitForTimeout(800);
  check('Tap To Approve', param('tab') === 'invoices' && param('f') === 'approve');
  await open('/fin/subs');
  await page.getByText('Applications To Certify').click(); await page.waitForTimeout(800);
  check('Tap Applications To Certify', param('tab') === 'apps' && param('f') === 'open');
  await page.getByText('Next Pay Day').click(); await page.waitForTimeout(800);
  check('Tap Next Pay Day', param('tab') === 'payrun');

  // Detailed Summary rows.
  await open(`${J}/summary`);
  await page.getByText(/^Applications/).first().click(); await page.waitForTimeout(600);
  check('Summary rows have the ⋯', await page.getByLabel(/^More: /).count() > 0);

  await ctx.close();
  // Client: no H&S pages beyond the four by link.
  const c = await makeContext(browser, 'client', [], {viewport: {width: 1300, height: 900}}); world(c.db);
  const cp = await c.ctx.newPage(); cp.setDefaultTimeout(8000);
  await login(cp);
  for (const [from, want] of [['mytools', '/hs'], ['havs', '/hs'], ['coshh/save', '/hs/coshh']]) {
    await cp.goto(`${B}/sites/${S1}/hs/${from}`); await cp.waitForTimeout(3000);
    const p = new URL(cp.url()).pathname;
    check(`Client sent back from ${from}`, p.endsWith(want), p);
  }
  await cp.goto(`${B}/sites/${S1}/hs/rams`); await cp.waitForTimeout(3000);
  check('Client still reaches RAMS', new URL(cp.url()).pathname.endsWith('/hs/rams'));
  console.log('errors', errs.join(' / ') || 'none');
  console.log(bad ? `${bad} FAILED` : 'all ok');
  await browser.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
