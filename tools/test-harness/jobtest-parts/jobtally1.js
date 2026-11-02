// Finance > Projects: the value tally follows the filter, laptop and phone, on Sandbox. Changes nothing.
const gbp = (n) => '£' + n.toLocaleString('en-GB', {maximumFractionDigits: 0});
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const sum = async (st) => { const sites = await a.get('sites?select=id,status'); const jf = await a.get('job_finance?select=site_id,contract_value'); const by = Object.fromEntries(jf.map((j) => [j.site_id, Number(j.contract_value || 0)])); const key = (s) => (s === 'active' || s === 'live' ? 'live' : s === 'closed' ? 'closed' : 'upcoming'); return sites.filter((s) => st.includes(key(s.status))).reduce((t, s) => t + (by[s.id] || 0), 0); };
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Laptop: starts on Live; old totals gone', async () => {
    await a.go('/fin/jobs', 6000); await a.page.waitForTimeout(2500); await a.shot('laptop');
    const want = 'Value of works ' + gbp(await sum(['live']));
    const got = await a.page.getByText(want, {exact: true}).locator('visible=true').count();
    const old = await a.page.getByText(/^(Invoiced|Owed|Overdue) £/).locator('visible=true').count();
    return {ok: got > 0 && old === 0, note: want + '; old totals ' + old};
  });
  await step('Laptop: adding Closed and Upcoming changes the tally', async () => {
    await a.page.getByLabel('Filter Status').first().click({timeout: 5000}); await a.page.waitForTimeout(400);
    await a.page.getByRole('checkbox', {name: 'Upcoming'}).click({timeout: 4000}); await a.page.getByRole('checkbox', {name: 'Closed'}).click({timeout: 4000});
    await a.page.getByText('Done', {exact: true}).locator('visible=true').first().click({timeout: 4000}); await a.page.waitForTimeout(800); await a.shot('laptop2');
    const want = 'Value of works ' + gbp(await sum(['live', 'upcoming', 'closed']));
    return {ok: (await a.page.getByText(want, {exact: true}).locator('visible=true').count()) > 0, note: want};
  });
  await step('Phone: tally at the bottom', async () => {
    await a.page.setViewportSize({width: 375, height: 812}); await a.go('/fin/jobs', 6000); await a.page.waitForTimeout(2500); await a.shot('phone');
    const want = 'Value of works ' + gbp(await sum(['live']));
    const r = await a.page.getByText(want, {exact: true}).locator('visible=true').count();
    await a.page.setViewportSize({width: 1440, height: 900});
    return {ok: r > 0, note: want};
  });
};
