// Bill of Quantities: lines stay open, labels and £ signs, Tab order, Unit list. Sets one test line's unit by keyboard on Sandbox's ZZ job.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  const active = () => a.page.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label'));
  await step('All lines open, with labels and £', async () => {
    await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {}); await a.page.waitForTimeout(1500); await a.shot('page');
    const q = await a.page.locator('[aria-label="Qty"]').count(), t = (await a.text()).replace(/\s+/g, ' ');
    return {ok: q >= 4 && /Sell rate/.test(t) && /Cost rate/.test(t) && /Budget cost/.test(t) && /£/.test(t), note: q + ' lines open'};
  });
  await step('Tab goes description to Qty, and clicking about never closes', async () => {
    await a.page.locator('textarea').locator('visible=true').first().click(); await a.page.keyboard.press('Tab'); await a.page.waitForTimeout(250);
    const on = await active();
    const before = await a.page.locator('[aria-label="Qty"]').count();
    await a.page.mouse.click(1000, 880); await a.page.waitForTimeout(400); await a.page.keyboard.press('Tab'); await a.page.waitForTimeout(300);
    return {ok: on === 'Qty' && await a.page.locator('[aria-label="Qty"]').count() === before, note: 'landed on ' + on};
  });
  await step('Unit: type filters, down arrow and Tab takes it, Edit at the bottom', async () => {
    const u = a.page.locator('[aria-label="Unit"]').first();
    await u.click(); await a.page.waitForTimeout(300); await u.fill('r'); await a.page.waitForTimeout(400); await a.shot('list');
    const edit = await a.page.getByText(/^Edit saved units/).locator('visible=true').count();
    await a.page.keyboard.press('ArrowDown'); await a.page.waitForTimeout(150); await a.page.keyboard.press('Tab'); await a.page.waitForTimeout(400);
    const v = await u.inputValue();
    return {ok: edit === 1 && v !== 'r' && v !== '', note: 'value ' + v};
  });
};
