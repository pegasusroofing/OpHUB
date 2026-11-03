// The application page: no jump, click selects, variation qty, buttons, certified on the row. Sandbox's ZZ JOB Fin C; makes a draft and marks it applied.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  const scroller = () => a.page.evaluate(() => { const els = [...document.querySelectorAll('div')].filter((e) => e.scrollHeight > e.clientHeight + 40 && getComputedStyle(e).overflowY !== 'visible' && e.clientHeight > 300); const e = els[els.length - 1]; return e ? e.scrollTop : -1; });
  await step('BoQ: all on one row, capital letter', async () => {
    await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.waitForTimeout(3000); await a.shot('boq');
    const d = await a.page.locator('textarea').first().boundingBox(), r = await a.page.getByLabel('Rate £').first().boundingBox();
    const box = a.page.locator('textarea').first(); const was = await box.inputValue();
    await box.fill(''); await box.pressSequentially('strip tiles', {delay: 20}); const v = await box.inputValue(); await box.fill(was);
    await a.go('/fin/jobs', 800);
    return {ok: Math.abs(d.y - r.y) < 8 && v === 'Strip tiles', note: 'row offset ' + Math.round(d.y - r.y) + ', ' + v};
  });
  let id;
  await step('Draft: click selects, no jump after typing and returning to the window', async () => {
    await a.go('/fin/job/' + J.id + '/application/new', 9000); await a.page.waitForTimeout(4000); id = new URL(a.page.url()).pathname.split('/').pop(); await a.shot('draft'); await q('Line By Line').first().click({timeout: 5000}); await a.page.waitForTimeout(500);
    const box = a.page.getByLabel('Percent done').last(); await box.scrollIntoViewIfNeeded(); await a.page.waitForTimeout(300);
    await box.click(); await a.page.waitForTimeout(150); await a.page.keyboard.type('50'); await a.page.waitForTimeout(200);
    const typed = await box.inputValue(); const y1 = (await box.boundingBox()).y;
    await a.page.waitForTimeout(3500);
    await a.page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); }); await a.page.waitForTimeout(2500);
    const y2 = (await box.boundingBox()).y, still = await box.inputValue();
    return {ok: typed === '50' && Math.abs(y2 - y1) < 2 && still === '50', note: 'typed ' + typed + ', scroll ' + y1 + ' > ' + y2 + ', still ' + still};
  });
  await step('Variation quantity sets the value', async () => {
    await q('+ Variation Line').first().click({timeout: 5000}); await a.page.waitForTimeout(600);
    const boxes = a.page.locator('input:visible'), n = await boxes.count();
    await boxes.nth(n - 3).fill('ZZ two doors'); await boxes.nth(n - 2).fill('2'); await boxes.nth(n - 1).fill('150');
    await q('Save').last().click(); await a.page.waitForTimeout(2500); await a.shot('variation');
    return {ok: (await q('£300.00').count()) >= 1, note: 'value £300'};
  });
  await step('Buttons on one row, then certified on each line', async () => {
    const s = await q('Save').last().boundingBox(), m = await q('Apply For Payment').first().boundingBox(), d = await a.page.getByLabel('Delete', {exact: true}).locator('visible=true').first().boundingBox(); await a.shot('buttons');
    const same = Math.abs(s.y - m.y) < 8 && Math.abs(d.y + d.height / 2 - (m.y + m.height / 2)) < 8;
    await q('Apply For Payment').first().click({timeout: 5000}); await a.page.waitForTimeout(1500);
    await q('Apply For Payment').last().click({timeout: 5000}); await a.page.getByText(/^No — just apply/).locator('visible=true').first().click({timeout: 2000}).catch(() => {}); await a.page.waitForTimeout(2500); await a.page.waitForTimeout(3500); await a.shot('applied'); await q('Certify').first().click({timeout: 5000}); await a.page.waitForTimeout(600);
    const boxes = await a.page.getByLabel('Certified percent').count();
    const [r] = await a.get('fin_applications?select=status,variations&id=eq.' + id);
    const kept = (r.variations || []).some((v) => String(v.description || '').endsWith('ZZ two doors') && Number(v.value) === 300 && Number(v.qty) === 2 && v.fin_variation_id);
    return {ok: same && r.status === 'submitted' && boxes >= 3 && kept, note: 'one row ' + same + ', ' + r.status + ', certified boxes ' + boxes + ', variation kept ' + kept};
  });
};
