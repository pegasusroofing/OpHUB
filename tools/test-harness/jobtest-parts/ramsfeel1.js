// RAMS snags of 3 Nov and the Finance look in Projects. Looks only, on ZZ JOB Regular: the Export pop-up is opened
// and closed, the builder's Info tab is only viewed (no field is typed in), nothing is saved, sent or exported.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const vis = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Regular&limit=1');
  const [B] = await a.get('rams_builds?select=id&site_id=eq.' + J.id + '&order=updated_at.desc&limit=1');
  for (const [w, h] of [[1440, 900], [430, 932]]) {
    await step('RAMS list and Export pop-up at ' + w, async () => {
      await a.page.setViewportSize({width: w, height: h});
      await a.go('/sites/' + J.id + '/hs/rams', 9000); await vis('Export').first().waitFor({timeout: 30000}); await a.page.waitForTimeout(1200);
      await a.shot('list-' + w);
      await vis('Export').first().click(); await vis('Who Still Has To Sign').first().waitFor({timeout: 10000}); await a.page.waitForTimeout(500);
      await a.shot('export-' + w);
      const ok = await vis('Export PDF').count();
      await a.page.keyboard.press('Escape'); await a.page.waitForTimeout(300);
      return {ok: ok >= 1};
    });
  }
  await step('Builder Info tab', async () => {
    await a.page.setViewportSize({width: 1440, height: 900});
    await a.go('/sites/' + J.id + '/hs/rams/build/' + B.id, 9000); await vis('Emergency contact').first().waitFor({timeout: 30000}); await a.page.waitForTimeout(1000);
    await vis('Emergency contact').first().scrollIntoViewIfNeeded(); await a.shot('builder-info');
    return {ok: true};
  });
  await step('New RAMS, copy closed', async () => {
    await a.go('/sites/' + J.id + '/hs/rams/new', 9000); await a.page.waitForTimeout(3000); await a.shot('new');
    return {ok: (await a.page.getByText(/Or Copy Another Job/).locator('visible=true').count()) >= 1};
  });
  for (const [w, h] of [[1440, 900], [430, 932]]) {
    await step('Home and check in at ' + w, async () => {
      await a.page.setViewportSize({width: w, height: h});
      await a.go('/sites/' + J.id, 9000); await a.page.waitForTimeout(3500); await a.shot('home-' + w);
      await a.go('/sites/' + J.id + '/checkin', 9000); await vis('Site Geofence').first().waitFor({timeout: 30000}); await a.page.waitForTimeout(1000); await a.shot('checkin-' + w);
      return {ok: true};
    });
  }
};
