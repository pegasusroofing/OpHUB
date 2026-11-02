// Project Financials: the application date calendar, differing days, overheads filled in, Client wording. Sandbox; nothing is saved.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20B&limit=1');
  const [S] = await a.get('fin_settings?select=ohp_pct');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Form', async () => {
    await a.go('/fin/job/' + J.id + '?tab=setup', 7000); await a.page.waitForTimeout(2500);
    await a.page.getByText(/Edit Project Financials/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(800); await a.shot('form');
    const client = await q('Client').count(), old = await q('Bill to (client)').count();
    const values = await a.page.evaluate(() => [...document.querySelectorAll('input')].map((e) => e.value));
    return {ok: client > 0 && old === 0 && values.includes(String(S?.ohp_pct ?? 0)), note: 'client ' + client + ', old ' + old + ', overheads box filled ' + values.includes(String(S?.ohp_pct ?? 0))};
  });
  await step('Stays open after a mistake and a click outside', async () => {
    await a.page.locator('input').locator('visible=true').nth(1).fill('abc'); await a.page.waitForTimeout(200);
    await q('Save').last().click({timeout: 5000}); await a.page.waitForTimeout(1200); await a.shot('error');
    const msg = await a.page.getByText(/Enter the contract value/).locator('visible=true').count();
    await a.page.mouse.click(30, 450); await a.page.waitForTimeout(600);
    const open = await q('Project Financials').count();
    await a.page.locator('input').locator('visible=true').nth(1).fill('20000');
    return {ok: msg === 1 && open > 0, note: 'message ' + msg + ', form open ' + open};
  });
  await step('Calendar gives a day; link opens the months', async () => {
    await a.page.getByLabel('Application date (day of month)').first().click({timeout: 5000}); await a.page.waitForTimeout(500); await a.shot('calendar');
    await q('25').last().click({timeout: 5000}); await a.page.waitForTimeout(500);
    const set = await q('25th of each month').count();
    await a.page.getByLabel('Application date (day of month)').first().click({timeout: 5000}); await a.page.waitForTimeout(500);
    await q('Set a differing day for some months').first().click({timeout: 5000}); await a.page.waitForTimeout(800); await a.shot('months');
    const months = await q('Monthly application dates').count();
    return {ok: set > 0 && months > 0, note: 'day ' + set + ', months ' + months};
  });
};
