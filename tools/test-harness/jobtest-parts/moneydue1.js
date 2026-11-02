// Money due report and its auto-run box on Sandbox, laptop and phone. Nothing is saved or run.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Money due lists invoices, applications, retentions and a total', async () => {
    await a.go('/fin/reports?id=moneydue', 8000); await a.page.waitForTimeout(3000); await a.shot('laptop');
    const need = ['Invoices', 'Applications', 'Retentions', 'Total due:'];
    const got = []; for (const t of need) got.push(await a.page.getByText(t, {exact: true}).locator('visible=true').count());
    return {ok: got.every((n) => n > 0), note: got.join(',')};
  });
  await step('Auto-run box opens with how often and folder', async () => {
    await a.page.getByText(/^Auto-run: /).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(600);
    await a.page.getByLabel('How often').first().click({timeout: 5000}); await a.page.waitForTimeout(500);
    await a.page.getByText('Every month', {exact: true}).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(500); await a.shot('auto');
    const d = await a.page.getByText('Day of the month', {exact: true}).locator('visible=true').count();
    await a.page.getByLabel('Close').locator('visible=true').last().click({timeout: 4000}); await a.page.waitForTimeout(400);
    return {ok: d > 0, note: 'day box ' + d};
  });
  await step('Phone view', async () => {
    await a.page.setViewportSize({width: 375, height: 812}); await a.page.waitForTimeout(1000); await a.shot('phone');
    return {ok: true, note: 'screenshot'};
  });
};
