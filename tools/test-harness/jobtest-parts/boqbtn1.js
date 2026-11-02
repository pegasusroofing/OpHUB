// Bill of Quantities layout on Sandbox: with lines and empty, laptop and phone. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  const [E] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Regular&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('With lines: header, buttons, footer', async () => {
    await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.waitForTimeout(3000); await a.shot('boq');
    const foot = await a.page.getByLabel('Budget cost footer').boundingBox();
    const h = await q('Bill of Quantities').count(), io = await q('Import / Export').count(), add = await q('+ Add Works').count();
    return {ok: !!foot && foot.y > 700 && h >= 2 && io === 1 && add === 2, note: 'footer at ' + Math.round(foot.y) + ', add ' + add + ', io ' + io};
  });
  await step('Typing m2 gives m²', async () => {
    const box = a.page.getByLabel('Unit').nth(2);
    await box.fill('m'); await a.page.waitForTimeout(300); await a.shot('unit');
    const offered = await a.page.getByText('m²', {exact: true}).locator('visible=true').count();
    await box.fill('m2'); await a.page.waitForTimeout(200); const v2 = await box.inputValue();
    await box.fill('m3'); await a.page.waitForTimeout(200); const v3 = await box.inputValue();
    await box.fill(''); await a.page.waitForTimeout(200);
    return {ok: offered > 0 && v2 === 'm²' && v3 === 'm³', note: 'offered ' + offered + ', ' + v2 + ', ' + v3};
  });
  await step('Empty page', async () => {
    await a.go('/fin/job/' + E.id + '/boq', 7000); await a.page.waitForTimeout(3000); await a.shot('empty');
    return {ok: (await q('No lines yet').count()) === 1 && (await q('+ Add Works').count()) === 1, note: 'empty state'};
  });
  await step('Phone', async () => {
    await a.page.setViewportSize({width: 375, height: 812}); await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.waitForTimeout(2500); await a.shot('phone');
    await a.page.setViewportSize({width: 1440, height: 900});
    return {ok: (await a.page.getByText(/^Budget cost tools/).count()) === 1, note: 'tools button'};
  });
};
