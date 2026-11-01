// Andy's list of 1 Nov, looked at on Sandbox. Nothing is sent: the rain delay pop-up is opened and closed.
module.exports = async ({as, step, state}) => {
  const a = await as('admin');
  const site = state.regular;
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {}); };
  const url = () => new URL(a.page.url()).pathname;
  await step('Tabs: full words, and they stay on Collections', async () => {
    await a.go(`/sites/${site}/materials/requests`, 5000); await clear(); await a.shot('tabs1');
    await a.page.locator('[role=tab]').filter({hasText: /^Collections/}).first().click({timeout: 6000}); await a.page.waitForTimeout(2500); await a.shot('tabs2');
    const t = await a.text();
    return {ok: /Material Requests/.test(t) && /Completed/.test(t) && !/Suppliers/.test(t.slice(0, 500)), note: url()};
  });
  await step('Header: bold line goes to Projects, small line shows Copied with no pop-up', async () => {
    await a.go(`/sites/${site}/materials`, 5000); await clear();
    await a.page.getByText(/test street/i).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(400); await a.shot('copied');
    const c = /Copied/.test(await a.text());
    await a.page.waitForTimeout(1500);
    await a.page.getByText(/^Materials$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(2500);
    return {ok: c && url() === '/sites', note: url()};
  });
  await step('Finance header: bold line goes to Finance home', async () => {
    await a.go('/fin/purchases', 5000); await clear();
    await a.page.getByText(/^Purchases$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(2000);
    return {note: url()};
  });
  await step('Job home: no Finance tile, weather swaps in, rain delay pop-up filled in', async () => {
    await a.go(`/sites/${site}`, 5000); await clear();
    const tile = await a.page.getByText(/^Finance$/).locator('visible=true').count();
    let found = false;
    for (let i = 0; i < 14 && !found; i++) { await a.page.waitForTimeout(1500); found = await a.page.locator('[aria-label="Weather"]').locator('visible=true').count() > 0; }
    await a.shot('wx1');
    if (!found) return {ok: false, note: 'no weather tile'};
    await a.page.locator('[aria-label="Weather"]').locator('visible=true').first().click({timeout: 4000}); await a.page.waitForTimeout(1200); await a.shot('wx2');
    const msg = await a.page.locator('[aria-label="Message"]').first().inputValue().catch(() => '');
    await a.page.locator('[aria-label="Close"]').locator('visible=true').first().click({timeout: 4000}).catch(() => {});
    return {ok: !tile && /adverse weather/.test(msg) && /additional time to the programme/.test(msg), note: msg.slice(0, 200)};
  });
  await step('Client page: details with Edit, or locked if Finance set it', async () => {
    await a.go(`/sites/${site}/client`, 5000); await clear(); await a.shot('cl1');
    return {note: (await a.text()).replace(/\s+/g, ' ').slice(0, 260)};
  });
  await step('Deliveries and home: new bar, no HUB tile', async () => {
    await a.go('/pm/deliveries', 5000); await clear(); await a.shot('dl1');
    await a.go('/home', 4000); await clear(); await a.shot('hm1');
    return {ok: await a.page.getByText(/^Notifications & messages$/).count() === 0, note: 'seen'};
  });
};
