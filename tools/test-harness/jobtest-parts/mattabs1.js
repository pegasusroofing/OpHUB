// Materials tabs on every Materials page, info box under the tabs (3 Nov). Looks only on ZZ JOB Regular: tabs pressed, nothing booked or issued.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const vis = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Regular&limit=1');
  await step('Tabs stay on every page', async () => {
    await a.page.setViewportSize({width: 430, height: 932});
    await a.go('/sites/' + J.id + '/materials/requests', 9000); await vis('Collections').first().waitFor({timeout: 30000}); await a.page.waitForTimeout(800); await a.shot('requests');
    const got = [];
    for (const t of ['Collections', 'Yard Stock', 'Book into yard']) {
      await vis(t).first().click(); await a.page.waitForTimeout(3500);
      got.push(t + ':' + ((await vis('Material Requests').count()) > 0 ? 'tabs' : 'NO TABS'));
      await a.shot(t.replace(/\s+/g, '-').toLowerCase());
    }
    await a.page.goBack(); await a.page.waitForTimeout(2500);
    const back = a.page.url().replace(/^.*\/sites\/[^/]+/, '');
    return {ok: got.every((x) => x.endsWith(':tabs')), note: got.join(' · ') + ' · back → ' + back};
  });
};
