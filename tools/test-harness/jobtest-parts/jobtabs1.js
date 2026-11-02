// A project's tabs stay on every page inside it, on Sandbox's ZZ job, laptop and phone. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20A&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  for (const p of ['variations', 'budget', 'costs', 'dayworks', 'monthly', 'summary', 'quotes', 'boq']) {
    await step('Tabs on ' + p, async () => {
      await a.go('/fin/job/' + J.id + '/' + p, 6000); await a.page.waitForTimeout(1500); if (p === 'variations') await a.shot('variations');
      const n = await a.page.getByText('Subcontractors & Labour', {exact: true}).locator('visible=true').count();
      return {ok: n === 1, note: n + ' tab rows'};
    });
  }
  await step('A tab goes to that part of the project', async () => {
    await a.go('/fin/job/' + J.id + '/variations', 6000); await a.page.waitForTimeout(1500);
    await a.page.getByText('Sales', {exact: true}).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(2500); await a.shot('sales');
    const u = new URL(a.page.url());
    const n = await a.page.getByText('Subcontractors & Labour', {exact: true}).locator('visible=true').count();
    return {ok: u.searchParams.get('tab') === 'sales' && n === 1, note: u.pathname.slice(-10) + u.search + ', rows ' + n};
  });
  await step('Phone', async () => {
    await a.page.setViewportSize({width: 375, height: 812}); await a.go('/fin/job/' + J.id + '/variations', 6000); await a.page.waitForTimeout(2000); await a.shot('phone');
    await a.page.setViewportSize({width: 1440, height: 900});
    return {ok: (await a.page.getByText('Overview', {exact: true}).locator('visible=true').count()) > 0, note: 'shown'};
  });
};
