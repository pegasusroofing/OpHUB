// The Variations tab, its Day Works switch, the trimmed overview buttons and the Sales order, on Sandbox's ZZ job. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20A&limit=1');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Overview keeps Monthly Report only', async () => {
    await a.go('/fin/job/' + J.id, 7000); await a.page.waitForTimeout(3000); await a.shot('overview');
    const m = await q('Monthly Report').count(), gone = (await q('Day Works').count()) + (await q('Budgets').count()) + (await q('Project Quotes').count());
    return {ok: m === 1 && gone === 0, note: 'monthly ' + m + ', others ' + gone};
  });
  await step('Variations tab, then Day Works', async () => {
    await q('Variations').first().click({timeout: 5000});
    await a.page.waitForTimeout(2500); const p1 = new URL(a.page.url()).pathname.split('/').pop(); await a.shot('variations');
    await q('Day Works').last().click({timeout: 5000}); await a.page.waitForTimeout(2500); const p2 = new URL(a.page.url()).pathname.split('/').pop(); await a.shot('dayworks');
    return {ok: p1 === 'variations' && p2 === 'dayworks', note: p1 + ' then ' + p2};
  });
  await step('Sales opens on Applications, in the right order', async () => {
    await a.go('/fin/job/' + J.id + '?tab=sales', 7000); await a.page.waitForTimeout(3000); await a.shot('sales');
    const box = async (x) => (await q(x).first().boundingBox()).x;
    const [ap, inv, ret] = [await box('Applications & Certificates'), await box('Invoices'), await box('Retention')];
    const net = await q('APPLIED (NET)').count() + await a.page.getByText('Applied (Net)', {exact: true}).locator('visible=true').count();
    return {ok: ap < inv && inv < ret && net > 0, note: [ap, inv, ret].map(Math.round).join(' < ') + ', applications list ' + net};
  });
};
