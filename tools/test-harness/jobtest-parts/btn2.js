// Screenshots of the new buttons (style A) where several sit together. Read only.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {}); };
  const [J] = await a.get(`sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1`);
  const [S] = await a.get(`sites?select=id&status=eq.active&order=job_number.desc&limit=1`);
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Project Admin, lower half', async () => {
    await a.go(`/fin/job/${J.id}?tab=setup`, 6000); await clear(); await a.page.waitForTimeout(1500);
    await a.page.mouse.move(800, 500); await a.page.mouse.wheel(0, 900); await a.page.waitForTimeout(600); await a.shot('admin2');
    return {ok: true, note: 'shot'};
  });
  await step('Project overview: grey buttons row', async () => {
    await a.go(`/fin/job/${J.id}`, 6000); await clear(); await a.page.waitForTimeout(1500); await a.shot('overview');
    return {ok: true, note: 'shot'};
  });
  await step('Projects side: material requests', async () => {
    await a.go(`/sites/${S.id}/materials/requests`, 6000); await clear(); await a.page.waitForTimeout(2000); await a.shot('requests');
    return {ok: true, note: 'shot'};
  });
  await step('Phone: Finance Directory', async () => {
    await a.page.setViewportSize({width: 375, height: 812});
    await a.go('/fin/directory?kind=client', 6000); await clear(); await a.page.waitForTimeout(2000); await a.shot('phone');
    return {ok: true, note: 'shot'};
  });
};
