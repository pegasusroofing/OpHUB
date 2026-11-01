// Bill of Quantities summary at laptop size. Read only.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Three tiles', async () => {
    await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {}); await a.page.waitForTimeout(1500);
    await a.page.mouse.move(800, 500); await a.page.mouse.wheel(0, 5000); await a.page.waitForTimeout(600); await a.shot('page');
    const t = (await a.text()).replace(/\s+/g, ' ');
    return {ok: /Total £[\d,.]+ Budget cost £[\d,.]+ Margin [\d.]+%/.test(t), note: (t.match(/Total £.{0,50}/) || [''])[0]};
  });
};
