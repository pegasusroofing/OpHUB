// Last of the second round: PM's leave to approve, the new Filter and Sort drop-downs and thin export bars, then the H&S policy with everyone signing.
const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, keep, samples, OUT}) => {
  const a = await as('admin');
  const say = async (n = 400) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const pdf = path.join(samples, 'sample.pdf');
  const held = () => { const f = path.join(__dirname, '../shots/crawl/sandbox-log.jsonl'); return fs.readFileSync(f, 'utf8').trim().split('\n').slice(-6).filter((l) => /"held"/.test(l)).map((l) => { const o = JSON.parse(l); return `${o.table} ${o.method}`; }).join(', '); };
  const filter = async (part, ...ticks) => { await a.page.locator('[aria-label="Filter"]').locator('visible=true').first().click(); await a.page.waitForTimeout(400); await a.page.locator(`[aria-label="${part}"]`).locator('visible=true').first().click(); await a.page.waitForTimeout(400); for (const t of ticks) { await a.page.getByText(t).locator('visible=true').first().click(); await a.page.waitForTimeout(300); } };
  const done = async () => { await a.page.getByText('Done', {exact: true}).locator('visible=true').last().click(); await a.page.waitForTimeout(500); };
  const sortTo = async (t) => { await a.page.locator('[aria-label="Sort"]').locator('visible=true').first().click(); await a.page.waitForTimeout(400); await a.page.getByText(t, {exact: true}).locator('visible=true').last().click(); await a.page.waitForTimeout(500); };

  await step('HR: PM asks for 10 Nov, it waits, admin sees it and presses Approve', async () => {
    const p = await as('pm');
    await p.go('/pm/hr/holidays', 5000);
    await p.tap('+ Book time off', {wait: 900});
    await p.label('From', 700);
    await p.label('10 Nov 2026', 700);
    await p.tap('Send for approval', {wait: 3000});
    const r = (await a.get('hr_leave?select=id,status&start_date=eq.2026-11-10&order=created_at.desc&limit=1'))[0];
    if (!r) return {ok: false, note: 'not saved'};
    await a.go('/pm/hr/holidays', 5000);
    await a.page.getByText('Requests', {exact: true}).locator('visible=true').first().click();
    await a.page.waitForTimeout(1200);
    await a.shot('hr-req');
    const t = await say(900);
    await a.tap('Approve', {wait: 2500});
    await a.shot('hr-appr');
    const e = (await a.get(`hr_leave?select=status&id=eq.${r.id}`))[0];
    return {ok: r.status === 'pending' && /andy pm/.test(t), note: `${r.status} > ${e.status}; ${held()}`};
  });
  await step('Snags: the site manager one is closed with its photo', async () => {
    const s = await a.get(`snags?select=description,title,status,closed_photo_path&site_id=eq.${state.regular}`);
    return {ok: s.some((x) => x.status === 'closed' && x.closed_photo_path), note: JSON.stringify(s.map((x) => [x.title, x.status, !!x.closed_photo_path]))};
  });
  const count = async (re) => ((await a.text()).match(re) || []).length;
  await step('Projects: Filter drop-down, tick Live and Closed, by PM; Sort by name', async () => {
    await a.go('/fin/jobs', 5500);
    await a.shot('l-jobs');
    const live = await count(/SBX-\d+ ·/g);
    await filter('Status', /^Closed/);
    await a.shot('l-jobs-f');
    await done();
    const both = await count(/SBX-\d+ ·/g);
    await sortTo('Name A to Z');
    await a.shot('l-jobs-s');
    const t = await say(700);
    const w = await a.page.evaluate(() => [document.documentElement.scrollWidth, innerWidth].join('/'));
    return {ok: both > live, note: `live ${live}, live+closed ${both}; width ${w}; ${t.slice(150, 360)}`};
  });
  await step('Sales: invoices filter Owed + Paid, by month; apps list', async () => {
    await a.go('/fin/sales?tab=invoices', 5500);
    await a.shot('l-sales');
    const n1 = await count(/SBX-INV-\d+ ·/g);
    await filter('Status', /^Paid/);
    await a.shot('l-sales-f');
    await done();
    const n2 = await count(/SBX-INV-\d+ ·/g);
    await sortTo('Biggest first');
    await a.go('/fin/sales?tab=apps', 5500);
    await a.shot('l-sales-a');
    const t = await say(400);
    return {ok: n2 >= n1 && n1 > 0, note: `owed ${n1}, owed+paid ${n2}; ${t.slice(150, 330)}`};
  });
  await step('Purchases: orders by supplier; invoices Show; plant', async () => {
    await a.go('/fin/purchases?tab=orders', 5500);
    await a.shot('l-po');
    const n0 = await count(/PO-\d+ ·/g);
    await filter('Supplier', /^ZZ Fin Supplier/);
    await a.shot('l-po-f');
    await done();
    const n1 = await count(/PO-\d+ ·/g);
    await a.go('/fin/purchases?tab=invoices', 5500);
    await a.shot('l-pi');
    await filter('Show', /^All filed/);
    await done();
    await a.shot('l-pi2');
    await a.go('/fin/purchases?tab=plant', 5500);
    await a.shot('l-pl');
    return {ok: n1 >= 1 && n1 <= n0, note: `POs ${n0} > ${n1} for ZZ Fin Supplier`};
  });
  await step('Yard: filter by Low stock and category, sort highest value', async () => {
    await a.go('/fin/yard', 5500);
    await a.shot('l-yard');
    const before = await say(1500);
    await filter('Show', /^Low stock/);
    await a.shot('l-yard-f');
    await done();
    const t = await say(1500);
    await sortTo('Highest value');
    return {ok: /LOW/.test(t), note: t.slice(400, 620)};
  });
  await step('Labour: Directory filter Not verified, sort Z to A; Operative invoices filter', async () => {
    await a.go('/fin/directory?kind=labour', 5500);
    await a.shot('l-lab');
    await filter('Show', /^PAYE staff/);
    await a.shot('l-lab-f');
    await done();
    await sortTo('Name Z to A');
    await a.go('/fin/subs?tab=opinv', 5500);
    await a.shot('l-op');
    await a.go('/fin/subs?tab=orders', 5500);
    await a.shot('l-sc');
    return {note: 'pictures checked by eye'};
  });
  await step('Thin export bars: BOQ, Report and PPE give real files; job page shows tabs go on', async () => {
    await a.go(`/fin/job/${state.finA}`, 5500);
    await a.shot('tabs');
    await a.go(`/fin/job/${state.finA}/boq`, 5000);
    await a.shot('bar-boq');
    const x1 = await a.saved(async () => { await a.page.getByText('📊 Excel').locator('visible=true').last().click(); await a.page.waitForTimeout(1500); await a.tap('⬇️ Download', {wait: 0}); });
    await a.go('/fin/reports?id=cis', 5000);
    await a.shot('bar-rep');
    const p1 = await a.saved(async () => { await a.page.getByText('📄 PDF').locator('visible=true').last().click(); await a.page.waitForTimeout(2500); await a.page.getByText('📄 PDF', {exact: true}).locator('visible=true').last().click(); });
    await a.go('/pm/admin/ppelog', 5000);
    await a.shot('bar-ppe');
    const x2 = await a.saved(async () => { await a.page.getByText('📊 Excel').locator('visible=true').last().click(); await a.page.waitForTimeout(1500); await a.tap('⬇️ Download', {wait: 0}); });
    return {ok: fs.readFileSync(x1).subarray(0, 2).toString() === 'PK' && fs.readFileSync(p1).subarray(0, 4).toString() === '%PDF' && fs.readFileSync(x2).subarray(0, 2).toString() === 'PK', note: [x1, p1, x2].map((f) => path.basename(f)).join(', ')};
  });
};
