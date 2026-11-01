// Bill of Quantities row heights, measured. Read only.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Heading and closed line rows match', async () => {
    await a.go(`/fin/job/${J.id}/boq`, 7000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {}); await a.page.waitForTimeout(1500); await a.shot('rows');
    const hs = await a.page.locator('[aria-label="Tick"]').evaluateAll((els) => els.map((e) => Math.round(e.parentElement.parentElement.getBoundingClientRect().height)));
    return {ok: hs.length > 2 && new Set(hs).size === 1, note: hs.join(',')};
  });
};
