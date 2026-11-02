// Sales invoice booked to a plot, then the figures on Costs by plot and the Plot by plot report. Sandbox's ZZ JOB Multi only; makes one draft invoice.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Multi&limit=1');
  const [P] = await a.get('site_sub_addresses?select=id,name&site_id=eq.' + J.id + '&name=eq.Plot%202');
  await a.page.setViewportSize({width: 1440, height: 900});
  let inv;
  await step('New invoice: choose the plot', async () => {
    await a.go('/fin/job/' + J.id + '/invoice/new', 9000); await a.page.waitForTimeout(3500); await a.shot('draft');
    inv = new URL(a.page.url()).pathname.split('/').pop();
    await q('Not booked to one').first().click({timeout: 6000}); await a.page.waitForTimeout(500);
    await q('Plot 2').last().click({timeout: 5000}); await a.page.waitForTimeout(1500);
    const [r] = await a.get('fin_invoices?select=sub_job_id&id=eq.' + inv);
    return {ok: r.sub_job_id === P.id, note: String(r.sub_job_id)};
  });
  await step('A saved draft keeps it', async () => {
    await q('Save draft').first().click({timeout: 6000}); await a.page.waitForTimeout(2000);
    const [r] = await a.get('fin_invoices?select=sub_job_id&id=eq.' + inv);
    return {ok: r.sub_job_id === P.id, note: String(r.sub_job_id)};
  });
  await step('Costs by plot has invoiced columns and export', async () => {
    await a.go('/fin/job/' + J.id + '/parts', 7000); await a.page.waitForTimeout(3000); await a.shot('parts');
    return {ok: (await q('Invoiced').count()) >= 1 && (await q('Export to Excel').count()) === 1, note: 'ok'};
  });
  await step('Plot by plot report', async () => {
    await a.go('/fin/reports', 5000); await a.page.waitForTimeout(1500); await q('Plot by plot').first().click({timeout: 6000}); await a.page.waitForTimeout(4000); await a.shot('report');
    const n = await q('Invoiced less cost').count(), p = await q('Plot 2').count();
    return {ok: n >= 1 && p >= 1, note: 'plot rows ' + p};
  });
};
