// With the ZZ-PLOT-1 test invoice (net 1000, gross 1200, 300 paid) on Plot 2 of ZZ JOB Multi: the report and Costs by plot show it. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Multi&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  const row = () => a.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await step('Plot by plot report', async () => {
    await a.go('/fin/reports?id=plots', 8000); await a.page.waitForTimeout(4000); await a.shot('report');
    const t = await row();
    return {ok: /Plot 2 £1,000\.00 £1,000\.00 £750\.00/.test(t), note: (t.match(/Plot 2.{0,60}/) || [''])[0]};
  });
  await step('Costs by plot', async () => {
    await a.go('/fin/job/' + J.id + '/parts', 7000); await a.page.waitForTimeout(3500); await a.shot('parts');
    const t = await row();
    return {ok: /Plot 2.*£1,000\.00.*£750\.00/.test(t), note: (t.match(/Plot 2.{0,60}/) || [''])[0]};
  });
};
