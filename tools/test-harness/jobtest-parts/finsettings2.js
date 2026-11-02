// Laptop size: Finance settings, cost codes, Admin Users and Reports. Only looks; changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {}); };
  const tap = async (t) => { await a.page.getByText(t, {exact: true}).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(1500); };
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Settings at laptop size', async () => {
    await a.go('/fin/settings', 6000); await clear(); await a.page.waitForTimeout(1500);
    await tap('Company overheads (OHP)'); await a.shot('settings');
    const edit = await a.page.getByText('Edit', {exact: true}).locator('visible=true').count();
    await tap('Cost Codes'); await a.shot('codes');
    const tabs = await a.page.getByText('Settings', {exact: true}).locator('visible=true').count();
    return {ok: edit > 0 && tabs > 0, note: 'edit ' + edit + ', settings labels ' + tabs};
  });
  await step('Users at laptop size', async () => {
    await a.go('/pm/admin/users', 6000); await a.page.waitForTimeout(2000); await a.shot('users');
    return {ok: (await a.page.getByLabel(/^Finance for /).count()) > 0, note: 'switch shown'};
  });
  await step('Reports at laptop size', async () => {
    await a.go('/fin/reports', 5000); await a.page.waitForTimeout(1500); await a.shot('reports');
    await a.go('/fin/reports?id=apps', 7000); await a.page.waitForTimeout(3000); await a.shot('report');
    return {ok: true, note: 'screenshots'};
  });
};
