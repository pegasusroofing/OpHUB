// Application top at phone size: one Excel / PDF menu, small dates. Nothing changed.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
  const r = (await a.get('fin_applications?select=id&site_id=eq.' + J.id + '&status=eq.draft&limit=1'))[0];
  await a.page.setViewportSize({width: 375, height: 812});
  await step('Menu and dates', async () => {
    await a.go('/fin/job/' + J.id + '/application/' + r.id, 6000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {}); await a.page.waitForTimeout(1500); await a.shot('top');
    const b = await a.page.getByText(/^Valuation$/).locator('visible=true').first().boundingBox(), c = await a.page.getByText(/^Final$/).locator('visible=true').first().boundingBox();
    await a.page.getByText(/^Excel \/ PDF/).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(500); await a.shot('menu');
    const t = await a.text();
    return {ok: Math.abs(b.y - c.y) < 3 && /Download Excel/.test(t) && /Download PDF/.test(t) && /Upload edited Excel/.test(t), note: 'dates on one row'};
  });
};
