// Publish to Application for Payment on Sandbox: makes a draft application on a ZZ job with the Bill's lines.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
  await a.page.setViewportSize({width: 375, height: 812});
  await step('Publishes every line', async () => {
    await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {}); await a.page.waitForTimeout(1500);
    await a.page.getByText('Publish to Application for Payment', {exact: true}).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(7000); await a.shot('app');
    const t = (await a.text()).replace(/\s+/g, ' ');
    const u = new URL(a.page.url()).pathname;
    return {ok: /application\/[0-9a-f-]{36}/.test(u) && ['Strip and re-slate', 'Lead flashing', 'Scaffold weeks', 'Skip hire'].every((x) => t.includes(x)), note: u.slice(-50)};
  });
};
