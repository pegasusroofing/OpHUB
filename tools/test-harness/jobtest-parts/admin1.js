// As Sandbox's real admin: the rules and settings that only an admin can save, against the real database.
module.exports = async ({as, step, state, keep}) => {
  const a = await as('admin');
  const say = async (n = 240) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const rules = async () => (await a.get('job_pack_settings?select=enabled,config&limit=1'))[0];
  const sets = async () => (await a.get('quote_settings?select=*&limit=1'))[0];

  await step('Signed in as Sandbox’s admin, with Finance', async () => {
    await a.go('/home', 5000);
    const me = (await a.get('profiles?select=role,email,finance_enabled&email=eq.andy.cramp%2Bdemo@rtbroofinglimited.com'))[0];
    return {ok: me?.role === 'admin', note: `${me?.role}, finance ${me?.finance_enabled}`};
  });
  await step('Job pack rules: opens from Admin › OneDrive with what’s saved', async () => {
    await a.go('/pm/admin/onedrive', 4500);
    await a.shot('o1');
    await a.page.getByText(/Change the rules/i).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(3000);
    await a.shot('o2');
    return {ok: /jobpack/.test(a.page.url()) && /ZZ Job Packs/.test(await a.page.locator('input').first().inputValue()), note: await a.page.locator('input').first().inputValue()};
  });
  await step('Job pack rules: a change saves to the real database, then back', async () => {
    const before = await rules();
    await a.page.locator('[aria-label="Incidents: Incident submitted"]').first().click(); await a.page.waitForTimeout(400);
    await a.tap('Save', {wait: 2500});
    const after = await rules();
    const changed = after.config.rules.incident.on !== before.config.rules.incident.on;
    await a.go('/pm/admin/jobpack', 4000);
    await a.page.locator('[aria-label="Incidents: Incident submitted"]').first().click(); await a.page.waitForTimeout(400);
    await a.tap('Save', {wait: 2500});
    const back = await rules();
    return {ok: changed && back.config.rules.incident.on === before.config.rules.incident.on && after.config.folders.length === before.config.folders.length, note: `incident ${before.config.rules.incident.on} → ${after.config.rules.incident.on} → ${back.config.rules.incident.on}`};
  });
  await step('Quote settings: saves to the real database, and the chaser switch stays off', async () => {
    await a.go('/pm/quotes/settings', 4500);
    await a.shot('q1');
    await a.field('Then every, days', '21');
    await a.tap('Save', {wait: 2500});
    const s = await sets();
    await a.field('Then every, days', '14');
    await a.tap('Save', {wait: 2500});
    const b = await sets();
    return {ok: s.chase_every_days === 21 && b.chase_every_days === 14 && b.chase_enabled === false, note: `21 then ${b.chase_every_days}, automatic ${b.chase_enabled}`};
  });
  await step('Quotes: admin sees the settings button, and the list', async () => {
    await a.go('/pm/quotes', 5000);
    await a.shot('q2');
    return {ok: /Quote settings/i.test(await a.text()), note: await say(160)};
  });
};
