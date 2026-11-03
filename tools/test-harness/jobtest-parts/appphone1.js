// Phone: each application line has its box on the same row as the description. Sandbox's SBX-126 ddf. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  await a.page.setViewportSize({width: 430, height: 932});
  const [J] = await a.get('sites?select=id&job_number=eq.SBX-126&limit=1');
  const [app] = await a.get('fin_applications?select=id&site_id=eq.' + J.id + '&order=number.desc&limit=1');
  await step('Box beside the description', async () => {
    await a.go('/fin/job/' + J.id + '/application/' + app.id, 8000); await a.page.waitForTimeout(3500);
    await q('Line By Line').first().click({timeout: 5000}); await a.page.waitForTimeout(800); await a.shot('lines');
    const d = await a.page.getByText(/tiling/).locator('visible=true').first().boundingBox();
    const box = await a.page.getByLabel('Percent done').first().boundingBox().catch(() => null) || await a.page.getByText(/^Applied \d/).locator('visible=true').first().boundingBox();
    const over = await a.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    return {ok: box.x > d.x + 100 && Math.abs(box.y - d.y) < 40 && over <= 1, note: 'desc ' + Math.round(d.x) + ',' + Math.round(d.y) + ' box ' + Math.round(box.x) + ',' + Math.round(box.y) + ' over ' + over};
  });
};
