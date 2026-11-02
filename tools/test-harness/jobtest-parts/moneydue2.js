// Auto-run for real on Sandbox (REPORT_TEST=1): saves Money due into the ZZ Job Packs folder already on Sandbox's schedule row. Adds one file there; auto-run stays off.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const row = async () => (await a.get('fin_report_schedules?select=*&report_id=eq.moneydue'))[0];
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Save and run now, from the box', async () => {
    await a.go('/fin/reports?id=moneydue', 8000); await a.page.waitForTimeout(2500);
    const seen = []; a.page.on('response', (r) => { if (r.url().includes('finance-report-run')) seen.push(r.status()); });
    await a.page.getByText(/^Auto-run: /).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(800);
    await a.page.getByRole('button', {name: 'Save and run now'}).click({timeout: 8000, force: true}); await a.page.waitForTimeout(25000); await a.shot('ran');
    const r = await row();
    return {ok: r.last_ok === true && r.folder_name === 'ZZ Job Packs' && r.active === false, note: 'status ' + seen.join(',') + '; ' + String(r.last_message)};
  });
};
