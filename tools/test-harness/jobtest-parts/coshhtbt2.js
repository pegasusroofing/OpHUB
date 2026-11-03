// COSHH single Create button, the clearer Create COSHH, TBT tabs with the ⋮ (3 Nov). Looks only on ZZ JOB Regular: the
// Create COSHH menu is opened and closed; nothing is uploaded, issued or synced.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const vis = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Regular&limit=1');
  await step('COSHH', async () => {
    await a.page.setViewportSize({width: 1440, height: 900});
    await a.go('/sites/' + J.id + '/hs/coshh', 9000); await vis('Create COSHH').first().waitFor({timeout: 30000}); await a.page.waitForTimeout(800);
    await vis('Create COSHH').first().click(); await vis('Add From Library').first().waitFor({timeout: 8000}); await a.shot('menu');
    await a.page.keyboard.press('Escape'); await a.page.waitForTimeout(300);
    await a.go('/sites/' + J.id + '/hs/coshh/new', 9000); await a.page.waitForTimeout(3000); await a.shot('new');
    return {ok: (await a.page.getByText(/Enter Manually/).count()) >= 1};
  });
  for (const [w, h] of [[1440, 900], [430, 932]]) {
    await step('TBT tabs at ' + w, async () => {
      await a.page.setViewportSize({width: w, height: h});
      await a.go('/sites/' + J.id + '/hs/tbt', 9000); await a.page.waitForTimeout(3000); await a.shot('tbt-' + w);
      return {ok: true};
    });
  }
};
