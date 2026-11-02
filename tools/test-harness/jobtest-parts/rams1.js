// RAMS: a template plus tasks of your own, on Sandbox's ZZ job. Makes one draft RAMS; nothing issued or sent.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {}); };
  const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
  const name = 'ZZ RAMS ' + (Date.now() % 100000);
  const latest = async () => (await a.get('rams_builds?select=*&site_id=eq.' + J.id + '&order=created_at.desc&limit=1'))[0];
  await a.page.setViewportSize({width: 375, height: 812});
  let tplName = '';
  await step('Template and own task together', async () => {
    await a.go('/sites/' + J.id + '/hs/rams/new', 6000); await clear(); await a.page.waitForTimeout(1500); await a.shot('new');
    await a.page.locator('input').locator('visible=true').first().fill(name);
    const t = a.page.getByText(/^📋 /).locator('visible=true').first();
    if (await t.count()) { tplName = await t.innerText(); await t.click({timeout: 5000}); }
    await a.page.locator('[aria-label="Tasks not in the library"]').first().fill('ZZ Install roof lantern'); await a.shot('new2');
    await a.page.getByText(/^Create RAMS$/).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(5000); await a.shot('ms');
    const r = await latest();
    const own = (r.sections || []).find((s) => s.title === 'ZZ Install roof lantern');
    return {ok: r.title === name && !!own && own.part === 'method', note: (tplName || 'no template').slice(0, 50) + '; ' + (r.hazards || []).length + ' hazards, ' + (r.sections || []).length + ' sections'};
  });
  await step('Library search: not listed writes a new one', async () => {
    await a.page.getByText(/^\+ Add from library$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(800);
    await a.page.getByPlaceholder('Search…').first().fill('ZZ Lead welding'); await a.page.waitForTimeout(400);
    await a.page.getByText(/^Not listed\? Write new/).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(800); await a.shot('newitem');
    await a.page.getByText(/^Done$/).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(2500);
    const r = await latest();
    return {ok: (r.sections || []).some((s) => s.title === 'ZZ Lead welding'), note: (r.sections || []).length + ' sections'};
  });
};
