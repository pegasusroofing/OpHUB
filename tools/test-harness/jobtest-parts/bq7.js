// Tick boxes hidden until Select from the ⋯ menu, at phone size. Nothing saved on purpose.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
  await a.page.setViewportSize({width: 375, height: 812});
  const ticks = () => a.page.locator('[aria-label="Tick"]').locator('visible=true').count();
  const menu = async () => { await a.page.getByText('⋯', {exact: true}).locator('visible=true').nth(1).click({timeout: 6000}); await a.page.waitForTimeout(500); };
  await step('Hidden, Select shows them, Stop selecting hides them', async () => {
    await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {}); await a.page.waitForTimeout(1500); await a.shot('none');
    const n0 = await ticks();
    await menu(); await a.shot('menu'); await a.page.getByText(/^Select$/).locator('visible=true').last().click({timeout: 5000}); await a.page.waitForTimeout(600); await a.shot('on');
    const n1 = await ticks();
    await menu(); await a.page.getByText(/^Stop selecting$/).locator('visible=true').last().click({timeout: 5000}); await a.page.waitForTimeout(600);
    const n2 = await ticks();
    return {ok: n0 === 0 && n1 > 0 && n2 === 0, note: `${n0}, ${n1}, ${n2}`};
  });
};
