// Bill of Quantities at phone size on Sandbox: nothing off the screen, budget cost drop-down, no mark-up. Read only.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
  await a.page.setViewportSize({width: 375, height: 812});
  await step('Headings fit; description bold; no mark-up', async () => {
    await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {}); await a.page.waitForTimeout(1800); await a.shot('top');
    const right = await a.page.getByText(/^£5,800\.00$/).first().boundingBox();
    const wide = await a.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const t = await a.text();
    const w = await a.page.locator('textarea').locator('visible=true').first().evaluate((e) => getComputedStyle(e).fontWeight);
    return {ok: right.x + right.width <= 375 && wide && !/mark-up \d/.test(t) && Number(w) >= 700, note: 'total right edge ' + Math.round(right.x + right.width) + ', weight ' + w};
  });
  await step('Budget cost opens and closes per line', async () => {
    const n0 = await a.page.getByText(/^Cost rate$/).locator('visible=true').count();
    await a.page.locator('[aria-label="Budget cost"]').locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(500); await a.shot('cost');
    const n1 = await a.page.getByText(/^Cost rate$/).locator('visible=true').count();
    return {ok: n0 === 0 && n1 === 1, note: n0 + ' then ' + n1};
  });
  await step('Bottom of the page', async () => {
    await a.page.mouse.move(180, 400); await a.page.mouse.wheel(0, 6000); await a.page.waitForTimeout(600); await a.shot('bottom');
    const inA = await a.page.getByText(/^+ Add$/).locator('visible=true').last().locator('..').boundingBox(), outA = await a.page.getByText(/^+ Add Works$/).locator('visible=true').first().locator('..').boundingBox();
    return {ok: await a.page.getByText(/^Budget cost tools/).locator('visible=true').count() === 1 && Math.abs(inA.height - outA.height) < 1, note: 'heights ' + inA.height + ' and ' + outA.height};
  });
};
