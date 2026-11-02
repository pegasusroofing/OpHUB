// Real key presses: m2 in a unit box, naming the General heading, on Sandbox's Riverside job. Nothing is saved: it leaves before autosave.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=like.Riverside*&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Typing m then 2 on the keyboard', async () => {
    await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.waitForTimeout(3000);
    const box = a.page.getByLabel('Unit').first();
    await box.click({timeout: 5000}); await a.page.keyboard.press('m'); await a.page.waitForTimeout(250); await a.shot('m');
    const list1 = await a.page.getByText('m²', {exact: true}).locator('visible=true').count();
    await a.page.keyboard.press('2'); await a.page.waitForTimeout(300); await a.shot('m2');
    const v = await box.inputValue(), list2 = await a.page.getByText('m²', {exact: true}).locator('visible=true').count();
    await a.page.keyboard.press('Tab'); await a.page.waitForTimeout(300); const after = await box.inputValue();
    return {ok: v === 'm²' && after === 'm²' && list1 > 0, note: 'typed ' + v + ', after Tab ' + after + ', listed ' + list1 + '/' + list2};
  });
  await step('General heading can be named', async () => {
    await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.waitForTimeout(3000);
    const h = a.page.getByLabel('Section heading').first();
    await h.click({timeout: 5000}); await a.page.keyboard.type('Flat roof', {delay: 40}); await a.page.waitForTimeout(500); await a.shot('named');
    const inputs = await a.page.evaluate(() => [...document.querySelectorAll('input,textarea')].map((e) => e.value).filter((x) => /^F/.test(x)));
    await a.go('/fin/jobs', 3000);
    return {ok: inputs.includes('Flat roof'), note: JSON.stringify(inputs.slice(0, 3))};
  });
};
