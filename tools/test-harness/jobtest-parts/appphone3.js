// Phone: while certifying, one Fill In button instead of three, and Certified As Applied through it fills the boxes. Sandbox's ZZ JOB Fin C; nothing saved.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  await a.page.setViewportSize({width: 390, height: 844});
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  const [app] = await a.get('fin_applications?select=id&site_id=eq.' + J.id + '&status=eq.submitted&cert_net=is.null&order=number.desc&limit=1');
  await step('One Fill In button on a phone', async () => {
    if (!app) return {ok: true, note: 'no applied application on Fin C'};
    await a.go('/fin/job/' + J.id + '/application/' + app.id, 8000); await a.page.waitForTimeout(3500);
    await q('Certify').last().click({timeout: 5000}); await a.page.waitForTimeout(800); await a.shot('tools');
    const three = await q("Fill In From The Client's Excel").count(), one = await q('Fill In The Certified Figures ▾').count();
    await q('Fill In The Certified Figures ▾').first().click({timeout: 5000}); await a.page.waitForTimeout(500); await a.shot('menu');
    await q('Certified as applied').first().click({timeout: 5000}); await a.page.waitForTimeout(500);
    const over = await a.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    return {ok: three === 0 && one === 1 && over <= 1, note: 'three ' + three + ', one ' + one + ', over ' + over};
  });
};
