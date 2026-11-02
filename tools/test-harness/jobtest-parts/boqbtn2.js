// Bill of Quantities and Variations as two tabs, the section summary, the footer and the Import list, on Sandbox's ZZ job. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Page, footer and summary', async () => {
    await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.waitForTimeout(3000); await a.shot('boq');
    const sum = await a.page.getByLabel('Section summary').count(), ticked = await a.page.getByText(/ticked|^Tick all/i).locator('visible=true').count(), ex = await q('Export to Excel').count(), main = await q('Variations').count();
    return {ok: sum === 1 && ticked === 0 && ex === 1 && main === 1, note: 'summary ' + sum + ', tick buttons ' + ticked + ', export ' + ex + ', variations tabs ' + main};
  });
  await step('Import / Export has no copy-in', async () => {
    await q('Import / Export').first().click({timeout: 5000}); await a.page.waitForTimeout(600); await a.shot('import');
    const c = await a.page.getByText(/Copy in tasks/).locator('visible=true').count();
    await a.page.keyboard.press('Escape'); await a.page.waitForTimeout(300);
    return {ok: c === 0, note: 'copy-in ' + c};
  });
  await step('Two tabs: BoQ and Variations', async () => {
    await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.waitForTimeout(2500);
    await q('Variations').first().click({timeout: 5000}); await a.page.waitForTimeout(2500); const p1 = new URL(a.page.url()).pathname.split('/').pop(); await a.shot('variations');
    await q('BoQ').first().click({timeout: 5000}); await a.page.waitForTimeout(2500); const p2 = new URL(a.page.url()).pathname.split('/').pop();
    return {ok: p1 === 'variations' && p2 === 'boq', note: p1 + ' then ' + p2};
  });
};
