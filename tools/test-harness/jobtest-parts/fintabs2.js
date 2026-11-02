// Screenshots of the Finance tabs with the line above and below, on Sandbox, laptop. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Tabs', async () => {
    const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
    await a.go('/fin', 6000); await a.page.waitForTimeout(2500); await a.shot('overview');
    await a.go('/fin/job/' + J.id, 6000); await a.page.waitForTimeout(2500); await a.shot('job');
    return {ok: true, note: 'screenshots'};
  });
};
