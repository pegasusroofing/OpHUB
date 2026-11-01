// The bold line in the top bar, clicked on Sandbox: job home to Projects, a job's page to its home, Finance pages to Finance home.
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
  await step('Job page: bold line goes to the job home', async () => {
    await a.go(`/sites/${site}/materials`, 5000); await clear();
    await bold().click({timeout: 6000}); await a.page.waitForTimeout(2000);
    return {ok: url().endsWith(site), note: url()};
  });
  await step('Finance page: bold line goes to Finance home', async () => {
    await a.go('/fin/purchases', 5000); await clear();
    await bold().click({timeout: 6000}); await a.page.waitForTimeout(2000);
    return {ok: url().replace(/\/$/, '') === '/fin', note: url()};
  });
};
