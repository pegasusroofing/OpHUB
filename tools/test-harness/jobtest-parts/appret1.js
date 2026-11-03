// Overview: the % sign sits straight after the Retention and Discount boxes. Sandbox's ZZ JOB Fin A draft; nothing changed.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [JA] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20A&limit=1');
  const [d] = await a.get('fin_applications?select=id&status=eq.draft&site_id=eq.' + JA.id + '&order=created_at.desc&limit=1');
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    await step('% after the box at ' + w, async () => {
      await a.page.setViewportSize({width: w, height: h});
      await a.go('/fin/job/' + JA.id + '/application/' + d.id, 8000); await a.page.getByText('Line By Line', {exact: true}).locator('visible=true').first().waitFor({timeout: 30000}); await a.page.waitForTimeout(1200);
      await a.page.getByLabel('Discount percent').scrollIntoViewIfNeeded(); await a.shot('ret-' + w);
      const r = await a.page.getByLabel('Retention percent').boundingBox(), lbl = await a.page.getByText(/^Retention( \(limit|$)/).locator('visible=true').count(), old = await a.page.getByText(/^Retention %/).locator('visible=true').count();
      const signs = await a.page.evaluate(() => [...document.querySelectorAll('div')].filter((e) => e.innerText === '%' && e.children.length === 0).map((e) => Math.round(e.getBoundingClientRect().x)));
      return {ok: lbl >= 1 && old === 0 && signs.some((x) => x > r.x + r.width - 2 && x < r.x + r.width + 20), note: 'box ends ' + Math.round(r.x + r.width) + ', % at ' + signs.join(',')};
    });
  }
};
