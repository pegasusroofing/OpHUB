// Phone line layout for review. Sandbox's ZZ test jobs only: certifying on ZZ JOB Fin C (nothing saved), a ZZ JOB Fin A draft (one box changed and put back).
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  await a.page.setViewportSize({width: 430, height: 932});
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  const [app] = await a.get('fin_applications?select=id,status&site_id=eq.' + J.id + '&status=eq.submitted&cert_net=is.null&order=number.desc&limit=1');
  const [JA] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20A&limit=1');
  await step('Certifying on a phone', async () => {
    await a.go('/fin/job/' + J.id + '/application/' + app.id, 8000); await a.page.getByText('Line By Line', {exact: true}).locator('visible=true').first().waitFor({timeout: 30000}); await a.page.waitForTimeout(1500);
    await q('Line By Line').first().click(); await a.page.waitForTimeout(800);
    if (app.status === 'submitted') { await q('Certify').last().click({timeout: 8000}); await a.page.waitForTimeout(800); }
    await a.page.getByText(/Strip tiles/).locator('visible=true').first().scrollIntoViewIfNeeded(); await a.page.mouse.wheel(0, -120); await a.page.waitForTimeout(500); await a.shot('lines');
    await a.page.getByText('Variations', {exact: true}).locator('visible=true').last().scrollIntoViewIfNeeded(); await a.page.waitForTimeout(500); await a.shot('variations');
    const over = await a.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const bar = await a.page.getByLabel('Totals').boundingBox();
    return {ok: over <= 1 && bar.height < 40 && (await q('Applied').count()) >= 3, note: 'over ' + over + ', totals bar height ' + Math.round(bar.height) + ', applied rows ' + (await q('Applied').count())};
  });
  await step('Draft on a phone', async () => {
    const [d] = await a.get('fin_applications?select=id,site_id&status=eq.draft&site_id=eq.' + JA.id + '&order=created_at.desc&limit=1');
    if (!d) return {ok: true, note: 'no draft application in Sandbox'};
    await a.go('/fin/job/' + d.site_id + '/application/' + d.id, 8000); await a.page.getByText('Line By Line', {exact: true}).locator('visible=true').first().waitFor({timeout: 30000}); await a.page.waitForTimeout(1500);
    await q('Line By Line').first().click(); await a.page.waitForTimeout(800); await a.shot('draft');
    const bulk = await q('Bulk Edit ▾').count(); if (bulk) { await q('Bulk Edit ▾').first().click(); await a.page.waitForTimeout(500); await a.shot('bulk-edit'); await a.page.keyboard.press('Escape'); await a.page.getByLabel('Close').locator('visible=true').last().click().catch(() => {}); await a.page.waitForTimeout(400); }
    await a.page.setViewportSize({width: 375, height: 812}); await a.page.waitForTimeout(600); await a.shot('draft-375');
    const over = await a.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    return {ok: over <= 1 && bulk === 1 && (await a.page.getByLabel('Percent done').count()) >= 1, note: 'over at 375 ' + over + ', bulk edit ' + bulk};
  });
  await step('Phone: % and qty boxes keep in step', async () => {
    await a.page.setViewportSize({width: 430, height: 932}); await a.page.waitForTimeout(500);
    const pBox = a.page.getByLabel('Percent done').first(), qBox = a.page.getByLabel('Quantity done').first();
    if (!(await qBox.count())) return {ok: false, note: 'no qty box'};
    const was = await pBox.inputValue();
    await qBox.click(); await qBox.fill('25'); await a.page.waitForTimeout(300); await qBox.blur(); await a.page.waitForTimeout(300); await a.shot('synced');
    const p1 = await pBox.inputValue();
    await pBox.click(); await pBox.fill('10'); await a.page.waitForTimeout(300); await pBox.blur(); await a.page.waitForTimeout(300);
    const q1 = await qBox.inputValue();
    await pBox.click(); await pBox.fill('50'); await pBox.blur(); await a.page.waitForTimeout(4000);
    return {ok: p1 === '25' && q1 === '10' /* first line of Fin A: 100 m2 */, note: 'qty 25 gave ' + p1 + '%, 10% gave qty ' + q1 + ' (line of 100), put back to 50% (was ' + was + '%)'};
  });
  await step('Phone: variation description is words until tapped', async () => {
    const before = await a.page.getByPlaceholder('Description').locator('visible=true').count();
    const words = a.page.getByLabel(/^Change: /).locator('visible=true').first();
    if (!(await words.count())) return {ok: before === 0, note: 'no variation with words on this draft; open boxes ' + before};
    await words.scrollIntoViewIfNeeded(); await a.shot('var-words'); await words.click(); await a.page.waitForTimeout(400); await a.shot('var-edit');
    const open = await a.page.getByLabel('Description', {exact: true}).locator('visible=true').count();
    await a.page.keyboard.press('Tab'); await a.page.waitForTimeout(300);
    const qtyLink = await a.page.getByLabel('Change variation quantity').locator('visible=true').count(), oldBoxes = await a.page.getByPlaceholder('£ value').locator('visible=true').count();
    return {ok: before === 0 && open === 1 && qtyLink >= 1 && oldBoxes === 0, note: 'open boxes before ' + before + ', after tap ' + open + ', qty to tap ' + qtyLink + ', old £ boxes ' + oldBoxes};
  });
};
