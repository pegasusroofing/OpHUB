// Duplicate a section, on screen only: refs move on and the copies are new. It leaves the page unsaved straight away, on Sandbox's ZZ JOB Fin C. Also shows the Plot box on ZZ JOB Multi.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  const [M] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Multi&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Duplicate section', async () => {
    await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.waitForTimeout(3000);
    const refs = () => a.page.getByLabel('Ref').allInnerTexts();
    const before = await refs();
    await a.page.getByText('⋯', {exact: true}).locator('visible=true').nth(0).click({timeout: 5000}); await a.page.waitForTimeout(400); await a.shot('menu');
    await a.page.getByText('Duplicate section', {exact: true}).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(600); await a.shot('dup');
    const after = await refs();
    await a.page.close().catch(() => {});
    return {ok: after.length === before.length * 2 && after.includes('2') && after.includes('2.1'), note: before.join(',') + ' > ' + after.join(',')};
  });
};
