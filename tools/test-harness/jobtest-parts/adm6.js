module.exports = async ({as, step, state}) => {
  const a = await as('admin');
  await step('HR: cancel the test leave from the calendar', async () => {
    await a.go('/pm/hr/holidays', 5000);
    await a.page.getByText('2', {exact: true}).locator('visible=true').first().click();
    await a.page.waitForTimeout(1200);
    await a.shot('hr-day');
    await a.page.getByText(/Cancel/).locator('visible=true').last().click();
    await a.page.waitForTimeout(1000);
    await a.page.getByText('Cancel it', {exact: true}).locator('visible=true').last().click();
    await a.page.waitForTimeout(2500);
    const r = (await a.get(`hr_leave?select=status&id=eq.${state.leave}`))[0];
    const fs = await a.page.evaluate(() => { const i = document.querySelector('input,textarea'); return i ? getComputedStyle(i).fontSize : 'none'; });
    return {ok: r?.status === 'cancelled', note: `${JSON.stringify(r)}; input font ${fs}`};
  });
  await step('Phone zoom: input size on a Finance form', async () => {
    await a.go(`/fin/job/${state.finA}/boq`, 4500);
    const fs = await a.page.evaluate(() => [...document.querySelectorAll('input,textarea')].slice(0, 6).map((i) => getComputedStyle(i).fontSize).join(','));
    const w = await a.page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth].join('/'));
    const vp = await a.page.evaluate(() => document.querySelector('meta[name=viewport]')?.content);
    return {note: `fonts ${fs}; width ${w}; viewport ${vp}`};
  });
};
