// An operative's Materials on a job, in Finance-style tabs (Andy, 19 Nov 2026: "Change this layout a little more finance
// tab style"), each with its count. My Requests is first unless there is something to collect, when To Collect jumps to
// the front (Andy, 19 Nov: "if nothing to collect leave as second tab"); it opens on the first tab.
// Phone. Fake database. node opmat19-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me');
  Object.assign(me, {howto_dismissed: ['*'], finance_enabled: false, signature_path: 'sig/me.png'});
  if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
  db.rams_docs = []; db.coshh_docs = []; db.toolbox_talks = [];
  const now = new Date().toISOString(), today = now.slice(0, 10);
  db.material_required_items = [{id: 'p1', site_id: S1, org_id: me.org_id, item: 'Lead flashing', qty: '2', status: 'assigned', assigned_to: 'me', assigned_at: now, created_at: now}];
  db.materials = [
    {id: 'd1', site_id: S1, org_id: me.org_id, item: 'Slates', qty: '400', status: 'sent', fulfilment: 'delivery', required_for_delivery: today, created_at: now},
    {id: 'q1', site_id: S1, org_id: me.org_id, item: 'Batten', qty: '20', status: 'pending', requested_by: 'me', created_at: now},
  ];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
  await page.goto(`${B}/sites/${S1}/materials`); await page.waitForTimeout(5000);
  const tabs = async () => page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].filter((e) => e.getBoundingClientRect().width).map((e) => [e.innerText.replace(/\s+/g, ' ').trim(), String(getComputedStyle(e).borderBottomColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(e).borderBottomColor !== 'transparent')]));
  const body = () => page.evaluate(() => document.body.innerText);
  let tb = await tabs();
  check(tb.length === 3 && /^To Collect 1/.test(tb[0][0]) && /^My Requests 1/.test(tb[1][0]) && /^Deliveries 1/.test(tb[2][0]), `something to collect: To Collect first, then My Requests, Deliveries (${tb.map((x) => x[0]).join(' | ')})`);
  let t = await body();
  check(tb[0][1] === 'true' && /Lead flashing/.test(t) && !/Slates/.test(t), 'opens on To Collect, with only the collection list');
  const box = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].filter((e) => e.getBoundingClientRect().width).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.right)]; }));
  check(box.every((b) => b[0] === box[0][0]) && box.every((b) => b[1] <= 390), `the tabs fit on one row on a phone (${JSON.stringify(box)})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'opmat19-collect.png')});
  await page.getByRole('tab').filter({hasText: /^Deliveries/}).first().click(); await page.waitForTimeout(1200);
  t = await body();
  check(/Slates/.test(t) && /Goods Received \(GRN\)/.test(t) && !/Lead flashing/.test(t), 'Deliveries: what is coming, with Goods Received');
  await page.screenshot({path: path.join(__dirname, 'shots', 'opmat19-deliveries.png')});
  await page.getByRole('tab').filter({hasText: /^My Requests/}).first().click(); await page.waitForTimeout(1200);
  t = await body();
  check(/Batten/.test(t) && /Waiting for manager/.test(t) && /\+ Request Materials/.test(t) && /See All My Requests/.test(t), 'My Requests: what is waiting, Request Materials, See All');
  await page.screenshot({path: path.join(__dirname, 'shots', 'opmat19-requests.png')});
  // Nothing to collect: My Requests first, To Collect second, and it opens on My Requests.
  db.material_required_items = [];
  await page.goto(`${B}/home`); await page.waitForTimeout(2500);
  await page.evaluate(() => { try { Object.keys(localStorage).filter((k) => /opMaterials/.test(k)).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* none */ } });
  await page.goto(`${B}/sites/${S1}/materials`); await page.waitForTimeout(5000);
  tb = await tabs();
  check(tb.length === 3 && /^My Requests 1/.test(tb[0][0]) && /^To Collect/.test(tb[1][0]) && /^Deliveries 1/.test(tb[2][0]), `nothing to collect: My Requests first, To Collect second (${tb.map((x) => x[0]).join(' | ')})`);
  check(tb[0][1] === 'true' && /Batten/.test(await body()), 'and it opens on My Requests');
  await page.screenshot({path: path.join(__dirname, 'shots', 'opmat19-nothing-to-collect.png')});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
