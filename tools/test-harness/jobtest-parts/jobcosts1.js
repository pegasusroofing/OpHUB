// Costs: filter by type alongside sort, on Sandbox's Riverside job, laptop and phone. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=like.Riverside*&limit=1');
  const count = () => a.page.getByText(/^\d+ lines? · /).locator('visible=true').first().innerText();
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Filter by Labour then add Plant', async () => {
    await a.go('/fin/job/' + J.id + '/costs', 7000); await a.page.waitForTimeout(2500); const all = await count();
    await a.page.getByLabel('Filter', {exact: true}).first().click({timeout: 5000}); await a.page.waitForTimeout(300);
    await a.page.getByLabel('Type', {exact: true}).first().click({timeout: 5000}); await a.page.waitForTimeout(300); await a.shot('open');
    await a.page.getByRole('checkbox', {name: /^Labour/}).click({timeout: 5000}); await a.page.waitForTimeout(400); const lab = await count();
    await a.page.getByRole('checkbox', {name: /^Plant/}).click({timeout: 5000}); await a.page.waitForTimeout(400); const both = await count();
    await a.page.getByText('Done', {exact: true}).locator('visible=true').last().click({timeout: 4000}); await a.page.waitForTimeout(400); await a.shot('filtered');
    const n = (t) => Number(t.split(' ')[0]);
    return {ok: n(lab) <= n(both) && n(both) <= n(all) && n(lab) < n(all), note: all + ' | ' + lab + ' | ' + both};
  });
  await step('Sort still there; phone', async () => {
    const sort = await a.page.getByLabel('Sort', {exact: true}).count();
    await a.page.setViewportSize({width: 375, height: 812}); await a.page.waitForTimeout(800); await a.shot('phone');
    await a.page.setViewportSize({width: 1440, height: 900});
    return {ok: sort > 0, note: 'sort ' + sort};
  });
};
