// Plant tracking (4 Nov 2026), fake database. The hand-over steps are database functions (tested on the real database
// in a rolled-back transaction); here the screens and the calls they make are checked.
//  - Projects › Yard & Plant: the register with filters; Allocate To Someone calls plant_allocate.
//  - A job's Plant tile as the operative: "Sign for it" calls plant_accept; Hand It Back needs a photo.
//  - Finance › Purchases › Yard has Stock / Plant tabs; the delivery form has the plant boxes.
// node plant-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const out = (n) => path.join(__dirname, 'shots', 'job', `plant-${n}.png`);
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

async function open(browser, role, width = 1300) {
  const {ctx, db} = await makeContext(browser, role, [], {viewport: {width, height: width < 500 ? 844 : 900}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = role; me.finance_enabled = role === 'admin'; me.howto_dismissed = ['*']; me.signature_path = 'sig/me.png';
  const org = me.org_id;
  db.plant_items = [
    {id: 'p1', org_id: org, name: 'Propane 47kg #01', category: 'plant', photo_path: 'x/p.jpg', current_site_id: null, current_status: 'available'},
    {id: 'p2', org_id: org, name: 'Propane 47kg #02', category: 'plant', photo_path: 'x/p.jpg', current_site_id: S1, current_status: 'available'},
    {id: 'p3', org_id: org, name: 'Material cage #01', category: 'plant', photo_path: 'x/p.jpg', current_site_id: S1, current_status: 'checked_out'},
  ];
  db.plant_checkouts = [
    {id: 'c2', org_id: org, plant_item_id: 'p2', site_id: S1, operative_id: 'me', checkout_status: 'pending_signoff', allocated_at: '2026-11-04T08:00:00Z', requested_at: '2026-11-04T08:00:00Z'},
    {id: 'c3', org_id: org, plant_item_id: 'p3', site_id: S1, operative_id: 'me', checkout_status: 'checked_out', op_signed_at: '2026-10-30T08:00:00Z', requested_at: '2026-10-30T08:00:00Z'},
  ];
  const calls = [];
  await ctx.route(/rest\/v1\/rpc\/plant_/, (r) => { calls.push([r.request().url().split('/rpc/')[1].split('?')[0], JSON.parse(r.request().postData() || '{}')]); r.fulfill({status: 200, contentType: 'application/json', body: '{"ok":true}'}); });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  return {page, db, ctx, calls, errs};
}

(async () => {
  const browser = await chromium.launch();
  {
    const {page, ctx, calls, errs} = await open(browser, 'admin');
    await page.goto(B + '/pm/yard'); await page.waitForTimeout(4000);
    check(await page.getByText('Propane 47kg #01').count() > 0 && await page.getByText('Material cage #01').count() > 0, 'Yard & Plant: register lists every item');
    check(await page.getByText(/days out/).count() > 0, 'Yard & Plant: shows how long it has been out');
    await page.screenshot({path: out('register')});
    await page.getByText('Propane 47kg #01').click(); await page.waitForTimeout(500);
    await page.getByText('Allocate To Someone').click(); await page.waitForTimeout(800);
    await page.screenshot({path: out('allocate-who')});
    const person = page.getByText('Jake Morris', {exact: true}).last();
    await person.click(); await page.waitForTimeout(800);
    const job = page.getByText(/Studley Rd/).last(); await job.click(); await page.waitForTimeout(1500);
    check(calls.some(([f, a]) => f === 'plant_allocate' && a.p_item === 'p1'), `Allocate calls plant_allocate (${JSON.stringify(calls.map((c) => c[0]))})`);
    await page.goto(B + '/fin/yard?sub=plant'); await page.waitForTimeout(4000);
    check(await page.getByText('Stock', {exact: true}).count() > 0 && await page.getByText('Propane 47kg #01').count() > 0, 'Finance › Yard: Plant tab shows the register');
    await page.screenshot({path: out('finance-yard')});
    await page.goto(B + '/pm/delivery/new'); await page.waitForTimeout(4000);
    check(await page.getByText('Plant To Take To The Job (optional)').count() > 0, 'Delivery form: plant to take');
    check(!errs.length, `admin: no errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  {
    const {page, ctx, calls, errs} = await open(browser, 'operative', 390);
    await page.goto(B + '/sites/' + S1 + '/plant'); await page.waitForTimeout(4000);
    check(await page.getByText('Sign for it', {exact: true}).count() > 0, 'operative: allocated item says Sign for it');
    await page.screenshot({path: out('op-job')});
    await page.getByText('Propane 47kg #02').click(); await page.waitForTimeout(400);
    await page.getByText('✍ Sign For It').click(); await page.waitForTimeout(1500);
    check(calls.some(([f, a]) => f === 'plant_accept' && a.p_checkout === 'c2'), 'operative: Sign For It calls plant_accept');
    await page.getByText('Material cage #01').click(); await page.waitForTimeout(400);
    await page.getByText('↩ Hand It Back').click(); await page.waitForTimeout(400);
    await page.getByText('Sign It Back').click(); await page.waitForTimeout(800);
    check(!calls.some(([f]) => f === 'plant_return'), 'operative: can\'t hand back without a photo');
    await page.screenshot({path: out('op-handback')});
    check(!errs.length, `operative: no errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  await browser.close();
})();
