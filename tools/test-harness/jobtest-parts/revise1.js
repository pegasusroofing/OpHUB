// Revise RAMS in the RAMS ⋮ menu (3 Nov). Looks only on ZZ JOB Regular: the menu is opened and closed, Revise not pressed.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Regular&limit=1');
  await step('Menu shows Revise RAMS', async () => {
    await a.page.setViewportSize({width: 1440, height: 900});
    await a.go('/sites/' + J.id + '/hs/rams', 9000); await a.page.getByText('View', {exact: true}).first().waitFor({timeout: 30000}); await a.page.waitForTimeout(800);
    await a.page.getByText('⋮', {exact: true}).locator('visible=true').first().click();
    await a.page.getByText(/Revise RAMS/).first().waitFor({timeout: 8000}); await a.page.waitForTimeout(400); await a.shot('menu');
    await a.page.keyboard.press('Escape');
    return {ok: true};
  });
};
