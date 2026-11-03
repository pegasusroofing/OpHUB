// New project: client, number and email on one row; arrow keys + Tab pick a client. Job finance tiles; geofence row.
// Looks only: the new project is never saved, and the geofence on ZZ JOB Fin C is not changed.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const vis = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [c] = await a.get('fin_clients?select=name,email,phone&order=name&limit=1');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  await step('Client row and keys', async () => {
    await a.page.setViewportSize({width: 1440, height: 900});
    await a.go('/sites/new', 9000); await vis('Client number').first().waitFor({timeout: 30000});
    const box = a.page.getByPlaceholder('Start typing — clients from the Directory come up');
    await box.click(); await box.fill(''); await box.type(String(c.name).slice(0, 3), {delay: 60}); await a.page.waitForTimeout(600);
    await a.shot('client-list');
    await box.press('ArrowDown'); await a.page.waitForTimeout(200); await box.press('Tab'); await a.page.waitForTimeout(600);
    await a.shot('client-picked');
    const got = await box.inputValue();
    return {ok: got.length > 3, note: 'picked "' + got + '" (first client ' + c.name + ')'};
  });
  for (const [w, h] of [[1440, 900], [430, 932]]) {
    await step('Tiles and geofence at ' + w, async () => {
      await a.page.setViewportSize({width: w, height: h});
      await a.go('/sites/' + J.id, 9000); await a.page.waitForTimeout(3500); await a.shot('tiles-' + w);
      await a.go('/sites/' + J.id + '/checkin', 9000); await vis('Site Geofence').first().waitFor({timeout: 30000}); await a.page.waitForTimeout(1200);
      await vis('Site Geofence').first().scrollIntoViewIfNeeded(); await a.shot('fence-' + w);
      return {ok: (await vis('Save').count()) >= 1};
    });
  }
};
