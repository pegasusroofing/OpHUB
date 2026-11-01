// Tile visibility by its own button, and cancelling the leave the test booked.
module.exports = async ({as, step, state}) => {
  const a = await as('admin');
  const say = async (n = 400) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  await step('Tile visibility: job A, RAMS tile for Delivery Drivers, then back', async () => {
    await a.go(`/sites/${state.finA}/hs`, 5000);
    const was = (await a.get(`sites?select=tile_visibility&id=eq.${state.finA}`))[0];
    const dots = a.page.locator('[aria-label="Who sees RAMS"]').locator('visible=true').first();
    await dots.click({timeout: 6000});
    await a.page.waitForTimeout(900);
    await a.shot('tile-menu');
    await a.page.getByText(/Delivery Drivers/).locator('visible=true').last().click({timeout: 6000});
    await a.page.waitForTimeout(2500);
    const mid = (await a.get(`sites?select=tile_visibility&id=eq.${state.finA}`))[0];
    await a.go(`/sites/${state.finA}/hs`, 5000);
    await dots.click({timeout: 6000});
    await a.page.waitForTimeout(900);
    await a.page.getByText(/Delivery Drivers/).locator('visible=true').last().click({timeout: 6000});
    await a.page.waitForTimeout(2500);
    const end = (await a.get(`sites?select=tile_visibility&id=eq.${state.finA}`))[0];
    return {ok: JSON.stringify(was) !== JSON.stringify(mid), note: `${JSON.stringify(was.tile_visibility).slice(0, 100)} > ${JSON.stringify(mid.tile_visibility).slice(0, 120)} > ${JSON.stringify(end.tile_visibility).slice(0, 100)}`};
  });
  await step('HR: cancel the test leave', async () => {
    await a.go('/pm/hr/holidays', 5000);
    await a.page.getByText('Requests', {exact: true}).locator('visible=true').first().click();
    await a.page.waitForTimeout(1500);
    await a.shot('hr-req');
    const t = await say(900);
    return {note: t.slice(180, 600)};
  });
};
