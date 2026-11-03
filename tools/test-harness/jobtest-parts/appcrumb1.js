// The Applications step in the trail goes to the project's Sales list; Raise Invoice in that list is plain row-sized text. Sandbox's ZZ JOB Fin C. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  const [app] = await a.get('fin_applications?select=id&site_id=eq.' + J.id + '&order=number.desc&limit=1');
  await step('Applications step goes to the Sales list', async () => {
    await a.go('/fin/job/' + J.id + '/application/' + app.id, 8000); await a.page.waitForTimeout(3000);
    await q('Applications').first().click({timeout: 5000}); await a.page.waitForTimeout(3500); await a.shot('sales');
    const url = a.page.url(), lost = await a.page.getByText(/not found/i).locator('visible=true').count();
    return {ok: url.includes('/fin/job/' + J.id) && url.includes('tab=sales') && !lost, note: url.split('/fin/')[1]};
  });
  await step('Raise Invoice cell is the row size', async () => {
    const n = await q('Raise Invoice').count();
    if (!n) return {ok: true, note: 'no certified application waiting for an invoice here'};
    const h = await q('Raise Invoice').first().evaluate((e) => Math.round(e.getBoundingClientRect().height));
    return {ok: h < 22, note: 'height ' + h};
  });
};
