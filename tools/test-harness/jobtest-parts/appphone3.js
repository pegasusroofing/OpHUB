// Phone: while certifying, one drop-down for Enter %, Hide 0% lines and the Fill In choices. Sandbox's ZZ JOB Fin C; nothing saved.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  await a.page.setViewportSize({width: 390, height: 844});
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  const [app] = await a.get('fin_applications?select=id&site_id=eq.' + J.id + '&status=eq.submitted&cert_net=is.null&order=number.desc&limit=1');
  await step('One Fill In button on a phone', async () => {
    if (!app) return {ok: true, note: 'no applied application on Fin C'};
    await a.go('/fin/job/' + J.id + '/application/' + app.id, 8000); await a.page.waitForTimeout(3500); await a.page.getByText('Line By Line', {exact: true}).locator('visible=true').first().waitFor({timeout: 30000});
    await q('Certify').last().click({timeout: 8000}); await a.page.waitForTimeout(800); await a.shot('tools');
    const three = await q("Fill In From The Client's Excel").count() + await q('Hide 0% Lines').count(), one = await q('Enter % · Fill In ▾').count();
    await q('Enter % · Fill In ▾').first().click({timeout: 5000}); await a.page.waitForTimeout(500); await a.shot('menu');
    await q('Fill in: certified as applied').first().click({timeout: 5000}); await a.page.waitForTimeout(500);
    await q('Enter % · Fill In ▾').first().click({timeout: 5000}); await a.page.waitForTimeout(400); await q('Hide 0% lines').first().click({timeout: 5000}); await a.page.waitForTimeout(400); await a.shot('hidden');
    const hid = await q('Enter % · 0% Hidden · Fill In ▾').count();
    const over = await a.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    return {ok: three === 0 && one === 1 && hid === 1 && over <= 1, note: 'old bits ' + three + ', one ' + one + ', hidden ' + hid + ', over ' + over};
  });
};
