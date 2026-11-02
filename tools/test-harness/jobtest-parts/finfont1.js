// Screenshots of the Finance bar and the day works buttons, laptop and phone, on Sandbox. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Bar and buttons', async () => {
    const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
    await a.go('/fin/job/' + J.id + '/dayworks', 7000); await a.page.waitForTimeout(2500); await a.shot('dayworks');
    await a.page.setViewportSize({width: 375, height: 812}); await a.page.waitForTimeout(800); await a.shot('phone');
    await a.page.setViewportSize({width: 1440, height: 900});
    const b = await a.page.getByText('All (1)', {exact: true}).locator('visible=true').first().boundingBox(), p = await a.page.getByText('All (1)', {exact: true}).locator('visible=true').first().locator('xpath=..').boundingBox();
    const off = Math.abs((b.y + b.height / 2) - (p.y + p.height / 2));
    return {ok: off < 1.5, note: 'text is ' + off.toFixed(1) + 'px off centre'};
  });
};
