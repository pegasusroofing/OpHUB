// Variations split into Approved and Not Approved Yet on the application. Looks at the ZZ JOB Fin C draft; nothing changed.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  const [d] = await a.get('fin_applications?select=id&status=eq.draft&site_id=eq.' + J.id + '&limit=1');
  for (const [w, h] of [[1440, 900], [430, 932]]) {
    await step('Groups at ' + w, async () => {
      await a.page.setViewportSize({width: w, height: h});
      await a.go('/fin/job/' + J.id + '/application/' + d.id, 9000); await a.page.getByText('Line By Line', {exact: true}).locator('visible=true').first().waitFor({timeout: 30000}); await a.page.waitForTimeout(1500);
      await q('Line By Line').first().click(); await a.page.waitForTimeout(800);
      await q('Not Approved Yet').first().scrollIntoViewIfNeeded().catch(() => {}); await a.page.waitForTimeout(400); await a.shot('groups-' + w);
      const ok = await q('Approved').count(), not = await q('Not Approved Yet').count();
      return {ok: not >= 1, note: 'approved heads ' + ok + ', not approved heads ' + not};
    });
  }
};
