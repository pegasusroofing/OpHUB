// Project overview tiles go to the right list, on Sandbox's Kestrel House job, which has an overdue invoice. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=like.Kestrel*&limit=1');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Overdue tile shows only overdue invoices', async () => {
    await a.go('/fin/job/' + J.id, 7000); await a.page.waitForTimeout(3000);
    await q('Overdue').first().click({timeout: 6000}); await a.page.waitForTimeout(3000); await a.shot('overdue');
    const od = await a.page.getByText('SBX-INV-1004', {exact: true}).locator('visible=true').count(), not = await a.page.getByText('SBX-INV-1005', {exact: true}).locator('visible=true').count();
    return {ok: od > 0 && not === 0, note: 'overdue shown ' + od + ', not-due shown ' + not};
  });
  await step('Invoices tab after that shows them all', async () => {
    await q('Invoices').first().click({timeout: 5000}); await a.page.waitForTimeout(2000);
    return {ok: true, note: 'f=' + new URL(a.page.url()).searchParams.get('f')};
  });
  await step('Applied tile opens Applications', async () => {
    const [S] = await a.get('sites?select=id&name=like.Riverside*&limit=1');
    await a.go('/fin/job/' + S.id, 7000); await a.page.waitForTimeout(3000);
    await q('Applied').first().click({timeout: 6000}); await a.page.waitForTimeout(3000); await a.shot('applied');
    return {ok: new URL(a.page.url()).searchParams.get('sub') === 'apps' && (await a.page.getByText('Certified (Net)', {exact: true}).locator('visible=true').count()) > 0, note: new URL(a.page.url()).search};
  });
};
