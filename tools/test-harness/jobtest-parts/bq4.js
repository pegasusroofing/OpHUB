// Bill of Quantities open line and Unit list, on Sandbox's ZZ job. Sets one test line's unit by keyboard.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Open line is slim', async () => {
    await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {}); await a.page.waitForTimeout(1500);
    await a.page.getByText('Skip hire').first().click({timeout: 6000}); await a.page.waitForTimeout(600); await a.shot('open');
    const h = await a.page.locator('[aria-label="Unit"]').first().evaluate((e) => { let n = e; for (let i = 0; i < 9 && n.parentElement; i++) { n = n.parentElement; if (n.getBoundingClientRect().height > 50) break; } return Math.round(n.getBoundingClientRect().height); });
    return {ok: h <= 90, note: 'row height ' + h};
  });
  await step('Tab from the description goes to Qty', async () => {
    await a.page.locator('[aria-label^="Open"]').first().isVisible().catch(() => {});
    const d = a.page.locator('textarea').locator('visible=true').first(); await d.click(); await a.shot('centre'); await a.page.keyboard.press('Tab'); await a.page.waitForTimeout(250);
    const ph = await a.page.evaluate(() => document.activeElement && document.activeElement.getAttribute('placeholder'));
    return {ok: ph === 'Qty', note: 'landed on ' + ph};
  });
  await step('Clicking inside the line keeps it open; no Lump sum box', async () => {
    const q = a.page.locator('input[placeholder="Qty"]').first(); await q.click(); await a.page.waitForTimeout(200);
    const b = await a.page.locator('#boq-open-line').boundingBox(); await a.page.mouse.click(b.x + b.width - 200, b.y + b.height - 8); await a.page.waitForTimeout(500);
    return {ok: await a.page.locator('#boq-open-line').count() === 1 && await a.page.locator('input[placeholder^="Lump sum"]').count() === 0, note: 'still open'};
  });
  await step('Unit: type filters, down arrow and Tab takes it, list has Edit at the bottom', async () => {
    const u = a.page.locator('[aria-label="Unit"]').first();
    await u.click(); await a.page.waitForTimeout(300); await u.fill('r'); await a.page.waitForTimeout(400); await a.shot('list');
    const edit = await a.page.getByText(/^Edit saved units/).locator('visible=true').count(), roll = await a.page.getByText(/^roll$/).locator('visible=true').count();
    await a.page.keyboard.press('ArrowDown'); await a.page.waitForTimeout(150); await a.page.keyboard.press('Tab'); await a.page.waitForTimeout(400);
    const v = await u.inputValue().catch(() => 'closed');
    await a.shot('taken');
    return {ok: edit === 1 && roll === 1 && v !== 'r' && v !== '', note: 'edit ' + edit + ', roll ' + roll + ', value ' + v};
  });
  await step('Clicking outside closes it', async () => {
    await a.page.mouse.click(1000, 860); await a.page.waitForTimeout(500);
    return {ok: await a.page.locator('#boq-open-line').count() === 0, note: 'closed'};
  });
};
