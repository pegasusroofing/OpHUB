// Payment Procedure drop-down on the New project form, on Sandbox. Nothing is created.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  await a.page.setViewportSize({width: 1440, height: 1000});
  await step('Starts unchosen, picks Invoice', async () => {
    await a.go('/fin/newjob', 6000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {}); await a.page.waitForTimeout(1500);
    const start = await a.page.getByText(/^Choose…$/).locator('visible=true').count();
    await a.page.getByText(/^Choose…$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(500);
    await a.page.getByText(/^Invoice$/).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(600); await a.shot('form');
    const left = await a.page.getByText(/^Choose…$/).locator('visible=true').count();
    return {ok: start === 1 && left === 0, note: `unchosen ${start} then ${left}`};
  });
};
