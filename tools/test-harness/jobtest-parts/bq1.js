// Bill of Quantities on Sandbox: closed lines, click to open, Tab out to close, Add button. Nothing saved on purpose beyond what's open.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
  const inputs = () => a.page.locator('input,textarea').locator('visible=true').count();
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Lines start closed, one click opens one', async () => {
    await a.go(`/fin/job/${J.id}/boq`, 7000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {}); await a.page.waitForTimeout(1500); await a.shot('top');
    const n0 = await inputs();
    await a.page.getByText('Strip and re-slate').first().click({timeout: 6000}); await a.page.waitForTimeout(600); await a.shot('open');
    const n1 = await inputs();
    return {ok: n1 > n0 + 3, note: `boxes ${n0} then ${n1}`};
  });
  await step('Tab through the line closes it', async () => {
    const before = await inputs();
    for (let i = 0; i < 12 && await inputs() >= before; i++) { await a.page.keyboard.press('Tab'); await a.page.waitForTimeout(220); }
    const after = await inputs();
    return {ok: after < before, note: `boxes ${before} then ${after}`};
  });
  await step('+ Add under a section offers Item and Sub-section; no main + Sub-section', async () => {
    await a.page.mouse.move(800, 500); await a.page.mouse.wheel(0, 5000); await a.page.waitForTimeout(600); await a.shot('bottom');
    const main = await a.page.getByText(/^\+ Sub-section$/).locator('visible=true').count();
    await a.page.getByText(/^\+ Add$/).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(500); await a.shot('add');
    const ok = await a.page.getByText(/^Sub-section$/).locator('visible=true').count();
    await a.page.locator('[aria-label="Close"]').locator('visible=true').last().click({timeout: 3000}).catch(() => {});
    return {ok: main === 0 && ok > 0, note: `main ${main}, offered ${ok}`};
  });
};
