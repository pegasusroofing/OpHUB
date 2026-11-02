// Bill of Quantities on a phone, scrolled to the bottom, on Sandbox. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  await step('Phone bottom', async () => {
    await a.page.setViewportSize({width: 375, height: 812}); await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.waitForTimeout(3000);
    await a.page.getByText('Save Bill of Quantities', {exact: true}).first().scrollIntoViewIfNeeded(); await a.page.waitForTimeout(500); await a.shot('bottom');
    const t = await a.page.evaluate(() => document.body.innerText);
    return {ok: /Budget cost tools/.test(t), note: (t.match(/Budget cost tools.{0,12}/) || ['none'])[0]};
  });
};
