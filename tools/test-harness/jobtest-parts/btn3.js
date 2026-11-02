// The red Delete button, measured.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get(`sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1`);
  await step('Delete this project is soft red', async () => {
    await a.page.setViewportSize({width: 1440, height: 900});
    await a.go(`/fin/job/${J.id}?tab=setup`, 7000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {});
    await a.page.waitForTimeout(1500);
    const b = await a.page.evaluate(() => { const e = Array.from(document.querySelectorAll('[role=button]')).find((x) => /Delete this project/.test(x.textContent || '')); return e ? {bg: getComputedStyle(e).backgroundColor, t: JSON.stringify(e.textContent)} : null; });
    await a.page.mouse.move(800, 500); await a.page.mouse.wheel(0, 900); await a.page.waitForTimeout(600); await a.shot('red');
    return {ok: b?.bg === 'rgb(253, 236, 236)', note: JSON.stringify(b)};
  });
};
