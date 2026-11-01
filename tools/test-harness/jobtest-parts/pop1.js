// The Status pop-ups, on Sandbox. Nothing is created.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  await a.page.setViewportSize({width: 1440, height: 800});
  await step('Table: Status pop-up opens beside its arrow, ticks filter, click away closes', async () => {
    await a.go('/fin/jobs', 6000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {}); await a.page.waitForTimeout(1500);
    const f = a.page.locator('[aria-label="Filter Status"]').locator('visible=true').first(), b = await f.boundingBox();
    await f.click(); await a.page.waitForTimeout(500);
    const c = a.page.getByRole('checkbox', {name: 'Closed'}).first(), p = await c.boundingBox();
    await c.click(); await a.page.waitForTimeout(600); await a.shot('table');
    await a.page.mouse.click(30, 700); await a.page.waitForTimeout(500);
    const gone = await a.page.getByRole('checkbox', {name: 'Closed'}).count();
    return {ok: Math.abs(p.x - b.x) < 200 && p.y > b.y && p.y - b.y < 140 && gone === 0, note: JSON.stringify({arrow: [b.x, b.y], item: [p.x, p.y], left: gone})};
  });
  await step('New project: Status drop-down picks a choice', async () => {
    await a.go('/fin/newjob', 6000); await a.page.waitForTimeout(1500);
    await a.page.getByText(/^Live$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(500); await a.shot('form');
    await a.page.getByText(/^Upcoming$/).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(500);
    return {ok: await a.page.getByText(/^Upcoming$/).locator('visible=true').count() === 1, note: 'picked'};
  });
};
