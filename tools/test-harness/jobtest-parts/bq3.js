// Bill of Quantities: Import / Export menu and alignment. Menu closed without choosing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Left edges line up; Import / Export offers the options', async () => {
    await a.go(`/fin/job/${J.id}/boq`, 7000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {}); await a.page.waitForTimeout(1500); await a.shot('page');
    const x = async (re) => Math.round((await a.page.getByText(re).locator('visible=true').last().locator('..').boundingBox()).x);
    const inner = await x(/^\+ Add$/), save = await x(/^Save Bill of Quantities$/), io = await x(/^Import \/ Export$/);
    const first = await a.page.getByText(/^\+ Add$/).locator('visible=true').first().locator('..').boundingBox();
    await a.page.getByText(/^Import \/ Export$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(500); await a.shot('menu');
    const t = await a.text();
    return {ok: /Copy in tasks/.test(t) && /Send to the operatives/.test(t) && /Import a breakdown/.test(t) && Math.abs(first.x - save) <= 1 && Math.abs(io - save) <= 1, note: `in border ${Math.round(first.x)}, add ${inner}, save ${save}, import ${io}`};
  });
};
