// The bottom + Add offers Section and Item. Nothing saved: closed without choosing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Bottom + Add', async () => {
    await a.go(`/fin/job/${J.id}/boq`, 7000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {}); await a.page.waitForTimeout(1500); await a.shot('page');
    const old = await a.page.getByText(/^\+ (Item|Section)$/).locator('visible=true').count();
    await a.page.getByText(/^\+ Add$/).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(500); await a.shot('menu');
    const sec = await a.page.getByText(/^Section$/).locator('visible=true').count(), item = await a.page.getByText(/^Item$/).locator('visible=true').count();
    return {ok: old === 0 && sec > 0 && item > 0, note: `old ${old}, section ${sec}, item ${item}`};
  });
};
