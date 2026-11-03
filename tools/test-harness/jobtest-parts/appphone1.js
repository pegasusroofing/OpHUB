// Phone: each application line has its box on the same row as the description. Sandbox's SBX-126 ddf. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  await a.page.setViewportSize({width: 430, height: 932});
  const [J] = await a.get('sites?select=id&job_number=eq.SBX-126&limit=1');
  const [app] = await a.get('fin_applications?select=id&site_id=eq.' + J.id + '&order=number.desc&limit=1');
  await step('Box beside the description', async () => {
    await a.go('/fin/job/' + J.id + '/application/' + app.id, 8000); await a.page.waitForTimeout(3500);
    await q('Line By Line').first().click({timeout: 5000}); await a.page.waitForTimeout(800); await a.shot('lines');
    const d = await a.page.getByText(/tiling/).locator('visible=true').first().boundingBox();
    const box = await a.page.getByLabel('Percent done').first().boundingBox().catch(() => null) || await a.page.getByText(/^Applied \d/).locator('visible=true').first().boundingBox();
    const over = await a.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    return {ok: box.x > d.x + 100 && Math.abs(box.y - d.y) < 40 && over <= 1, note: 'desc ' + Math.round(d.x) + ',' + Math.round(d.y) + ' box ' + Math.round(box.x) + ',' + Math.round(box.y) + ' over ' + over};
  });
  await step('Variations: box beside the description too', async () => {
    const d = await a.page.getByText(/leadwork/).locator('visible=true').first().boundingBox();
    const b = await a.page.getByText(/^Applied \d/).locator('visible=true').last().boundingBox().catch(() => null) || await a.page.getByLabel('Percent done').last().boundingBox();
    return {ok: b.x > d.x + 100 && Math.abs(b.y - d.y) < 40, note: 'desc ' + Math.round(d.y) + ' box ' + Math.round(b.x) + ',' + Math.round(b.y)};
  });
  await step('Overview buttons the same height, bin on the right, Email Application below', async () => {
    await q('Overview').last().click({timeout: 5000}); await a.page.waitForTimeout(800);
    const btns = await a.page.evaluate(() => [...document.querySelectorAll('[role=button]')].filter((e) => ['Save', 'Export Excel', 'Apply For Payment', 'Return To Draft', 'Import Certificate', 'Certify'].includes(e.innerText.trim()) || e.getAttribute('aria-label') === 'Delete').map((e) => { const r = e.getBoundingClientRect(); return {t: e.innerText.trim() || 'bin', h: Math.round(r.height), w: Math.round(r.width), x: Math.round(r.x), y: Math.round(r.y)}; }));
    await a.page.getByLabel('Delete', {exact: true}).locator('visible=true').first().scrollIntoViewIfNeeded().catch(() => {}); await a.page.waitForTimeout(300); await a.shot('buttons');
    const row = btns.filter((b) => b.y === btns[btns.length - 1].y), hs = row.map((b) => b.h), bin = row.find((b) => b.t === 'bin');
    return {ok: row.length === 4 && Math.max(...hs) - Math.min(...hs) <= 1 && bin && bin.x === Math.max(...row.map((b) => b.x)) && bin.w < 60, note: JSON.stringify(btns)};
  });
};
