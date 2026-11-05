// Bill of Quantities on Sandbox's own jobs at laptop size: what they look like. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  await a.page.setViewportSize({width: 1440, height: 900});
  for (const n of ['Richardson%20court', 'Riverside*']) {
    await step('BoQ on ' + n, async () => {
      const [J] = await a.get('sites?select=id&name=like.' + n + '&limit=1');
      await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.waitForTimeout(3000); await a.shot(n.slice(0, 5).replace(/[^a-z]/gi, ''));
      const sum = await a.page.getByLabel('Section summary').count(), foot = await a.page.getByLabel('Budget cost footer').count();
      const add = await a.page.getByText('+ Add Works', {exact: true}).locator('visible=true').first().boundingBox(), title = await a.page.getByText('Bill Of Quantities', {exact: true}).locator('visible=true').nth(2).boundingBox();
      const under = !!add && !!title && add.y > title.y && Math.abs(add.x - title.x) < 12;
      return {ok: under && (n !== 'Riverside*' || sum > 0), note: 'section bars ' + sum + ', footer ' + foot + ', add under title ' + under};
    });
  }
};
