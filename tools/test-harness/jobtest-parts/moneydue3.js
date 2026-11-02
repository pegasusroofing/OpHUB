// The Save and run now button takes an ordinary click (a dry run: nothing is pressed or saved).
module.exports = async ({as, step}) => {
  const a = await as('admin');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Buttons in the box take an ordinary click', async () => {
    await a.go('/fin/reports?id=moneydue', 8000); await a.page.waitForTimeout(2500);
    await a.page.getByText(/^Auto-run: /).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(800);
    await a.page.getByRole('button', {name: 'Save and run now'}).click({timeout: 8000, trial: true});
    return {ok: true, note: 'clickable'};
  });
};
