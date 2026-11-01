// New project on Sandbox: the financials pop-up, saving it, and the prompt going away. Makes one ZZ job.
module.exports = async ({as, step, state, keep}) => {
  const a = await as('admin');
  const text = async () => (await a.text()).replace(/\\s+/g, ' ');
  const name = 'ZZ JOB Setup ' + (Date.now() % 100000);
  await a.page.setViewportSize({width: 1440, height: 1000});
  await step('Creating a project opens the financials pop-up', async () => {
    await a.go('/fin/newjob', 6000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {}); await a.page.waitForTimeout(1500);
    await a.page.locator('[aria-label="Project name *"], input').locator('visible=true').nth(1).fill(name).catch(() => {});
    await a.page.getByText(/^Choose…$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(400);
    await a.page.getByText(/^Application for payment$/).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(400);
    await a.page.getByText(/^Create project$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(6000); await a.shot('pop');
    const t = await text();
    return {ok: /Project Financials/.test(t) && /fin\/job\//.test(a.page.url()), note: new URL(a.page.url()).pathname + ' ' + t.slice(0, 60)};
  });
  await step('Closing it leaves the prompt on the Overview', async () => {
    await a.page.locator('[aria-label="Close"]').locator('visible=true').last().click({timeout: 6000}).catch(() => {}); await a.page.waitForTimeout(1000); await a.shot('prompt');
    return {ok: /Set up the project financials/.test(await text()), note: 'prompt'};
  });
  await step('Set up, save: prompt goes', async () => {
    await a.page.getByText(/^Set up$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(800);
    await a.page.getByText(/^Save/).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(3500); await a.shot('saved');
    return {ok: !/Set up the project financials/.test(await text()), note: 'after save'};
  });
};
