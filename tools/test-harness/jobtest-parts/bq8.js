// Refs fixed until chosen from the menu; tools and Import / Export on one row; bold labels. Phone size, nothing changed.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
  await a.page.setViewportSize({width: 375, height: 812});
  const inputs = () => a.page.locator('input').locator('visible=true').count();
  await step('Refs fixed, menu opens them for editing', async () => {
    await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {}); await a.page.waitForTimeout(1500); await a.shot('top');
    const n0 = await inputs();
    await a.page.getByText('⋯', {exact: true}).locator('visible=true').nth(1).click({timeout: 6000}); await a.page.waitForTimeout(500);
    await a.page.getByText(/^Edit ref numbers$/).locator('visible=true').last().click({timeout: 5000}); await a.page.waitForTimeout(500);
    const n1 = await inputs();
    await a.page.getByText('⋯', {exact: true}).locator('visible=true').nth(1).click({timeout: 6000}); await a.page.waitForTimeout(500);
    await a.page.getByText(/^Finish editing ref numbers$/).locator('visible=true').last().click({timeout: 5000}); await a.page.waitForTimeout(500);
    return {ok: n1 > n0 && await inputs() === n0, note: n0 + ' then ' + n1};
  });
  await step('Tools and Import / Export on one row', async () => {
    await a.page.mouse.move(180, 400); await a.page.mouse.wheel(0, 6000); await a.page.waitForTimeout(600); await a.shot('bottom');
    const x = await a.page.getByText(/^Budget cost tools/).locator('visible=true').first().boundingBox(), y = await a.page.getByText(/^Import \/ Export$/).locator('visible=true').first().boundingBox();
    return {ok: Math.abs(x.y - y.y) < 4 && y.x + y.width <= 375, note: 'rows ' + Math.round(x.y) + ', ' + Math.round(y.y)};
  });
};
