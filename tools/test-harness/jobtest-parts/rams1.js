// RAMS: a template from the closed drop-down (4 Nov 2026), on Sandbox's ZZ job; the emergency contact is the job's PM.
// Then the builder on a phone: paired buttons the same height, and the Safe System editor with its title and no part switch.
// Makes one draft RAMS; nothing issued or sent.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {}); };
  const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
  const name = 'ZZ RAMS ' + (Date.now() % 100000);
  const latest = async () => (await a.get('rams_builds?select=*&site_id=eq.' + J.id + '&order=created_at.desc&limit=1'))[0];
  await a.page.setViewportSize({width: 375, height: 812});
  let tplName = '';
  await step('Template from the drop-down, emergency contact = the job PM', async () => {
    await a.go('/sites/' + J.id + '/hs/rams/new', 6000); await clear(); await a.page.waitForTimeout(1500); await a.shot('new');
    const gone = await a.page.locator('[aria-label="Tasks not in the library"]').count() === 0;
    await a.page.locator('input').locator('visible=true').first().fill(name);
    await a.page.getByText(/^Start From A Template/).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(500);
    const t = a.page.getByText(/^📋 /).locator('visible=true').first();
    if (await t.count()) { tplName = await t.innerText(); await t.click({timeout: 5000}); }
    await a.shot('new2');
    await a.page.getByText(/^Create RAMS$/).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(5000); await a.shot('info');
    const r = await latest();
    const [site] = await a.get('sites?select=responsible_pm_id&id=eq.' + J.id);
    const [pm] = site && site.responsible_pm_id ? await a.get('profiles?select=name,phone&id=eq.' + site.responsible_pm_id) : [null];
    const d = r.details || {};
    const pmOk = pm ? d.emergencyName === pm.name && (d.emergencyPhone || '') === (pm.phone || '') : !!d.emergencyName;
    const who = (d.emergencyName || '-') + ' ' + (d.emergencyPhone || '(no phone)') + (pm ? '' : ' (job has no PM)');
    return {ok: gone && r.title === name && pmOk, note: 'tasks box gone ' + gone + ' · ' + (tplName || 'no template').slice(0, 40) + ' · emergency ' + who};
  });
  const heights = () => a.page.evaluate(() => [...document.querySelectorAll('[role="button"]')].filter((b) => /^(Done|Save To Library)$/.test(b.innerText.trim())).map((b) => Math.round(b.getBoundingClientRect().height)));
  await step('Hazard editor: Done and Save To Library the same height', async () => {
    await a.page.getByText(/^RA \(/).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(800);
    await a.page.getByText(/^\+ New Hazard$/).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(800); await a.shot('hazard-edit');
    const h = await heights();
    await a.page.getByText(/^Done$/).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(1500);
    return {ok: h.length >= 2 && h[0] === h[1], note: 'heights ' + h.join(' / ')};
  });
  await step('Safe System editor: a title, no part switch, buttons the same height', async () => {
    await a.page.getByText(/^SSOW/).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(800);
    await a.page.getByText(/^\+ New Safe System$/).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(800); await a.shot('ssow-edit');
    const t = await a.page.evaluate(() => document.body.innerText);
    const h = await heights();
    const ok = /Safe System Of Work/.test(t) && !/Method statement \(step/.test(t) && h.length >= 2 && h[0] === h[1];
    await a.page.getByText(/^Done$/).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(1500);
    return {ok, note: 'heights ' + h.join(' / ')};
  });
  await step('Library search: not listed writes a new one', async () => {
    await a.page.getByText(/^MS \(/).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(800);
    await a.page.getByText(/^\+ Add From Library$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(800);
    await a.page.getByPlaceholder('Search…').first().fill('ZZ Lead welding'); await a.page.waitForTimeout(400);
    await a.page.getByText(/^Not listed\? Write new/).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(800); await a.shot('newitem');
    await a.page.getByText(/^Done$/).locator('visible=true').first().click({timeout: 5000}); await a.page.waitForTimeout(2500);
    const r = await latest();
    return {ok: (r.sections || []).some((s) => s.title === 'ZZ Lead welding' && s.part === 'method'), note: (r.sections || []).length + ' sections'};
  });
};
