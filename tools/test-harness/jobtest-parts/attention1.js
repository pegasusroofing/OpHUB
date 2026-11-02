// Needs Attention shows headings only, on Sandbox, laptop. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Company overview: heading only; row still opens', async () => {
    await a.go('/fin', 6000); await a.page.waitForTimeout(3000); await a.shot('company');
    const sub = await a.page.getByText(/to chase$/).locator('visible=true').count();
    const row = a.page.getByText(/^Overdue Invoices$/i).locator('visible=true').first(); const has = await row.count();
    if (has) { await row.click({timeout: 5000}); await a.page.waitForTimeout(1800); }
    return {ok: sub === 0, note: 'sub lines ' + sub + (has ? ', opened ' + new URL(a.page.url()).pathname : '')};
  });
  await step('Project overview: heading only', async () => {
    const [J] = await a.get('sites?select=id&name=like.Kestrel*&limit=1');
    await a.go('/fin/job/' + J.id, 7000); await a.page.waitForTimeout(3000); await a.page.mouse.wheel(0, 2000); await a.page.waitForTimeout(500); await a.shot('project');
    const sub = await a.page.getByText(/to chase$/).locator('visible=true').count();
    return {ok: sub === 0, note: 'sub lines ' + sub};
  });
};
