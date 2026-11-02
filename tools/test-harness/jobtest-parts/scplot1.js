// A subcontractor order booked to a plot, on Sandbox's ZZ JOB Multi. Makes one test order there; nothing is sent.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Multi&limit=1');
  const name = 'ZZ Sub ' + (Date.now() % 10000);
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('New order with a plot', async () => {
    await a.go('/fin/sub/new?site=' + J.id, 7000); await a.page.waitForTimeout(3000); await a.shot('form');
    await a.page.locator('input').locator('visible=true').first().fill(name);
    await a.page.getByText('Not booked to one', {exact: false}).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(500);
    await q('Plot 2').last().click({timeout: 5000}); await a.page.waitForTimeout(400); await a.shot('picked');
    await q('Save').last().click({timeout: 6000}); await a.page.waitForTimeout(4000); await a.shot('saved');
    const [r] = await a.get('fin_subcontracts?select=name,sub_job_id&name=eq.' + encodeURIComponent(name));
    const plots = await a.get('site_sub_addresses?select=id,name&site_id=eq.' + J.id);
    return {ok: !!r && r.sub_job_id === plots.find((p) => p.name === 'Plot 2').id, note: JSON.stringify(r)};
  });
  await step('No picker on a single-site job', async () => {
    const [S] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
    await a.go('/fin/sub/new?site=' + S.id, 7000); await a.page.waitForTimeout(3000);
    return {ok: (await a.page.getByText('Not booked to one').locator('visible=true').count()) === 0, note: 'hidden'};
  });
};
