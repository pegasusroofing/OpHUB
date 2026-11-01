// Pictures of the quote tracker for Andy: phone and laptop.
module.exports = async ({as, step, state}) => {
  const a = await as('admin');
  const showAll = async () => { await a.go('/pm/quotes', 5000); await a.page.getByText('Live ▾').locator('visible=true').first().click(); await a.page.waitForTimeout(500); await a.tap('All', {wait: 900}); };
  await step('pictures', async () => {
    await showAll(); await a.shot('phone-list');
    await a.page.getByText('List ▾').locator('visible=true').first().click(); await a.page.waitForTimeout(500); await a.tap('By customer', {wait: 900}); await a.shot('phone-customer');
    await a.go(`/pm/quotes/${state.q2}`, 4500); await a.shot('phone-quote');
    await a.page.setViewportSize({width: 1300, height: 900});
    await showAll(); await a.shot('desk-list');
    await a.go(`/pm/quotes/${state.q1}`, 6000); await a.shot('desk-quote');
    await a.page.evaluate(() => document.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 40) e.scrollTop = e.scrollHeight; })); await a.page.waitForTimeout(800); await a.shot('desk-quote2');
    return {note: 'ok'};
  });
};
