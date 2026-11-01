// New project form and project tabs, on Sandbox. Nothing is created.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('job_finance?select=site_id&billing_type=eq.application&limit=1');
  const text = async () => (await a.text()).replace(/\s+/g, ' ');
  await a.page.setViewportSize({width: 1440, height: 1000});
  await step('Form order, drop-downs, company colour on the chosen chip', async () => {
    await a.go('/fin/newjob', 6000); await a.page.getByText(/^not now$/i).first().click({timeout: 800}).catch(() => {}); await a.page.waitForTimeout(1500); await a.shot('form');
    const t = await text();
    const order = ['Project number', 'Start date', 'Project name', 'Site address', 'Postcode', 'Status', 'Project manager', 'Payment Procedure', 'Project Type'].map((x) => t.indexOf(x));
    const bg = await a.page.evaluate(() => { const e = Array.from(document.querySelectorAll('div')).find((x) => x.textContent === 'Live' && getComputedStyle(x).borderRadius === '999px'); return e ? getComputedStyle(e).backgroundColor : null; });
    return {ok: order.every((n, i) => n >= 0 && (!i || n > order[i - 1])) && bg && bg !== 'rgb(17, 24, 39)', note: 'chip ' + bg + ' ' + order.join(',')};
  });
  await step('Project Admin is the last tab', async () => {
    await a.go('/fin/job/' + J.site_id, 6000); await a.page.waitForTimeout(1500);
    const t = await text();
    return {ok: /Documents Project Admin/.test(t), note: (t.match(/Overview Sales.{0,110}/) || [''])[0]};
  });
};
