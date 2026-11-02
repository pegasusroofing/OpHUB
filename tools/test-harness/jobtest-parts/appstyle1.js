// Application in the Bill of Quantities' style, and the Plot box with its default, on Sandbox. Nothing is saved.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Application draft', async () => {
    const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20A&limit=1');
    const apps = await a.get('fin_applications?select=id,status&site_id=eq.' + J.id + '&status=eq.draft&limit=1');
    await a.go('/fin/job/' + J.id + '/application/' + apps[0].id, 7000); await a.page.waitForTimeout(3000); await a.shot('overview'); await q('Line By Line').first().click({timeout: 5000}); await a.page.waitForTimeout(500); await a.shot('draft');
    await a.page.mouse.move(800, 500); await a.page.mouse.wheel(0, 700); await a.page.waitForTimeout(500); await a.shot('draft2');
    const bars = await a.page.getByLabel('Section summary').count(), v = await q('Variations').count();
    return {ok: bars >= 3 && v >= 1, note: bars + ' bars'};
  });
  await step('Plot box on a multi-site job with no plots', async () => {
    const [J] = await a.get('sites?select=id&job_number=eq.SBX-126&limit=1');
    await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.waitForTimeout(3000); await a.shot('noplots');
    return {ok: (await q('Plot').count()) >= 1, note: 'boxes ' + (await q('Plot').count())};
  });
  await step('A new line takes the plot above', async () => {
    const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Multi&limit=1');
    await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.waitForTimeout(3000);
    const before = await q('Plot 2').count();
    await a.page.getByText('⋯', {exact: true}).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(400); await q('+ Item below').first().click({timeout: 5000}); await a.page.waitForTimeout(700); await a.shot('plotdefault');
    const after = await q('Plot 2').count();
    await a.go('/fin/jobs', 1500);
    return {ok: after === before + 1, note: before + ' > ' + after};
  });
};
