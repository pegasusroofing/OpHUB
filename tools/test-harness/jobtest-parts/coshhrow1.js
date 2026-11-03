// COSHH in the RAMS layout and the data sheet upload on Create COSHH (3 Nov). Looks only on ZZ JOB Regular: nothing uploaded or issued.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Regular&limit=1');
  await step('COSHH list and create', async () => {
    await a.page.setViewportSize({width: 1440, height: 900});
    await a.go('/sites/' + J.id + '/hs/coshh', 9000); await a.page.waitForTimeout(3500); await a.shot('list');
    await a.go('/sites/' + J.id + '/hs/coshh/new', 9000); await a.page.waitForTimeout(3500); await a.shot('new');
    return {ok: (await a.page.getByText('📄 Upload Safety Data Sheet(s)').count()) >= 1};
  });
};
