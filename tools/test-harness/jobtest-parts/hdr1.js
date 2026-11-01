// The bold line in the top bar, clicked on Sandbox: the first page of each part of the app, from anywhere in it.
module.exports = async ({as, step, state}) => {
  const a = await as('admin');
  const site = state.regular;
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {}); };
  const url = () => new URL(a.page.url()).pathname;
  const bold = () => a.page.locator('[role=link]').locator('visible=true').first();
  await step('Job home: bold line goes to Projects', async () => {
    await a.go(`/sites/${site}`, 5000); await clear();
    await bold().click({timeout: 6000}); await a.page.waitForTimeout(2000);
    return {ok: url() === '/sites', note: url()};
  });
  await step('Job page: bold line goes to Projects', async () => {
    await a.go(`/sites/${site}/materials`, 5000); await clear();
    await bold().click({timeout: 6000}); await a.page.waitForTimeout(2000);
    return {ok: url() === '/sites', note: url()};
  });
  await step('Finance job page: bold line goes to Finance home', async () => {
    const [J] = await a.get(`sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1`);
    await a.go(`/fin/job/${J.id}`, 5000); await clear();
    await bold().click({timeout: 6000}); await a.page.waitForTimeout(2000);
    return {ok: url().replace(/\/$/, '') === '/fin', note: url()};
  });
  await step('Quotes page: bold line goes to the Quotes list', async () => {
    await a.go('/pm/quotes/settings', 5000); await clear();
    await bold().click({timeout: 6000}); await a.page.waitForTimeout(2000);
    return {ok: url() === '/pm/quotes', note: url()};
  });
  await step('Finance page: bold line goes to Finance home', async () => {
    await a.go('/fin/purchases', 5000); await clear();
    await bold().click({timeout: 6000}); await a.page.waitForTimeout(2000);
    return {ok: url().replace(/\/$/, '') === '/fin', note: url()};
  });
};
