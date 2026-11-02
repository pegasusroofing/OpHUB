// Bill of Quantities saving on Sandbox's ZZ JOB Multi: a line that has gone from under the page, a second open copy, Tab order, and Select lines. Writes only to that test job.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Multi&limit=1');
  const url = '/fin/job/' + J.id + '/boq';
  const lines = () => a.get('fin_contract_items?select=id,description&site_id=eq.' + J.id + '&order=position');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Tab goes straight from Unit to Sell rate', async () => {
    await a.go(url, 7000); await a.page.waitForTimeout(3000);
    await a.page.getByLabel('Unit').first().click({timeout: 5000}); await a.page.waitForTimeout(300);
    await a.page.keyboard.press('Tab'); await a.page.waitForTimeout(300);
    const on = await a.page.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label'));
    return {ok: on === 'Rate £', note: 'after one Tab: ' + on};
  });
  await step('Select lines, then Tick all appears', async () => {
    await q('Select lines to apply to').first().click({timeout: 5000}); await a.page.waitForTimeout(400);
    await a.page.getByLabel('Tick').nth(0).click({timeout: 5000}); await a.page.waitForTimeout(400); await a.shot('ticked');
    const apply = await a.page.getByText(/^Apply to 1 ticked$/).locator('visible=true').count();
    return {ok: apply === 1, note: 'apply ' + apply};
  });
  await step('A second open copy does not break saving', async () => {
    await a.go(url, 7000); await a.page.waitForTimeout(3000);
    const other = await a.page.context().newPage();
    await other.goto(a.page.url()); await other.waitForTimeout(6000);
    const stamp = 'ZZ line ' + (Date.now() % 100000);
    await other.getByLabel('Section heading').first().click({timeout: 8000}).catch(() => {});
    const before = await lines();
    await other.getByText('+ Add Works', {exact: true}).first().click({timeout: 6000}); await other.waitForTimeout(400);
    await other.getByText('Item', {exact: true}).last().click({timeout: 5000}); await other.waitForTimeout(500);
    const box = other.locator('textarea').last(); await box.fill(stamp); await other.waitForTimeout(200);
    await other.getByLabel('Rate £').last().fill('10'); await other.getByLabel('Qty').last().fill('2'); await other.waitForTimeout(200);
    await other.getByText('Save Bill of Quantities', {exact: true}).first().click({timeout: 6000}); await other.waitForTimeout(3500);
    const mid = await lines(); await other.close();
    // The older copy now changes its own line and saves.
    await a.page.locator('textarea').first().fill('ZZ Multi edited ' + stamp); await a.page.waitForTimeout(200);
    await q('Save Bill of Quantities').first().click({timeout: 6000}); await a.page.waitForTimeout(3500); await a.shot('saved');
    const after = await lines(), failed = await a.page.getByText(/didn.t save/).locator('visible=true').count();
    return {ok: failed === 0 && after.some((l) => l.description === stamp) && after.length === before.length + 1, note: before.length + ' > ' + mid.length + ' > ' + after.length + ', failed ' + failed};
  });
};
