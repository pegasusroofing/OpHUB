// The Plots tab on Sandbox's ZZ JOB Multi: add a plot, see it in the Bill's drop-down, remove it. Also the single-site view on ZZ JOB Fin C.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Multi&limit=1');
  const [S] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  const name = 'ZZ Plot ' + (Date.now() % 10000);
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Single site offers to switch on', async () => {
    await a.go('/fin/job/' + S.id + '/boq', 7000); await a.page.waitForTimeout(2500);
    await q('Plots').first().click({timeout: 5000}); await a.page.waitForTimeout(2000); await a.shot('single');
    const tab = await q('Bill of Quantities').count();
    return {ok: (await q('Make it multi-site').count()) === 1 && tab >= 1, note: new URL(a.page.url()).pathname.split('/').pop()};
  });
  await step('Add a plot', async () => {
    await a.go('/fin/job/' + J.id + '/plots', 7000); await a.page.waitForTimeout(2500); await a.shot('list');
    await q('+ Add plot').first().click({timeout: 5000}); await a.page.waitForTimeout(500);
    await a.page.locator('input').locator('visible=true').last().fill('AB1 2CD');
    await a.page.getByPlaceholder('e.g. Plot 12').fill(name); await q('Save').last().click({timeout: 5000}); await a.page.waitForTimeout(2500); await a.shot('added');
    const rows = await a.get('site_sub_addresses?select=name&site_id=eq.' + J.id);
    return {ok: rows.some((r) => r.name === name) && (await q(name).count()) === 1, note: rows.map((r) => r.name).join(', ')};
  });
  await step('It shows in the Bill', async () => {
    await q('BoQ').first().click({timeout: 5000}); await a.page.waitForTimeout(3000);
    await a.page.getByLabel('Plot', {exact: true}).first().click({timeout: 5000}); await a.page.waitForTimeout(700); await a.shot('dropdown');
    const n = await q(name).count();
    await a.page.keyboard.press('Escape');
    return {ok: n >= 1, note: 'listed ' + n};
  });
  await step('Remove it', async () => {
    await a.go('/fin/job/' + J.id + '/plots', 7000); await a.page.waitForTimeout(2500);
    await a.page.getByLabel('More: ' + name).click({timeout: 5000}); await a.page.waitForTimeout(400);
    await q('Remove').last().click({timeout: 5000}); await a.page.waitForTimeout(500);
    await q('Remove').last().click({timeout: 5000}); await a.page.waitForTimeout(2200);
    const rows = await a.get('site_sub_addresses?select=name&site_id=eq.' + J.id);
    return {ok: !rows.some((r) => r.name === name), note: rows.map((r) => r.name).join(', ')};
  });
};
