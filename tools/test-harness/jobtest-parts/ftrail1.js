// Finance project page on Sandbox (Andy, 1 Nov): the trail shows the whole path and each step goes back; the Home button has gone;
// a Documents tab shows the job's OneDrive folder. Read only.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {}); };
  const url = () => new URL(a.page.url()).pathname + new URL(a.page.url()).search;
  const text = async () => (await a.text()).replace(/\s+/g, ' ');
  const [J] = await a.get(`sites?select=id,job_number,name&name=like.ZZ%20JOB%20Fin*&limit=1`);
  await a.page.setViewportSize({width: 1440, height: 800});
  await step('Project Admin: trail reads Finance › Projects › job › Project Admin, no Home button in the bar', async () => {
    await a.go(`/fin/job/${J.id}?tab=setup`, 6000); await clear(); await a.page.waitForTimeout(1500); await a.shot('setup');
    const t = await text();
    const trail = new RegExp(`Finance › Projects › ${J.job_number} [^›]+ › Project Admin`).test(t);
    const home = await a.page.getByText(/^Home$/).locator('visible=true').count();
    return {ok: trail && home <= 1, note: `trail ${trail}; "Home" seen ${home} time(s) (the side menu has one)`};
  });
  await step('Click the job in the trail: back to its Overview', async () => {
    // The title above also starts with the job number, so the trail's is the second one.
    await a.page.getByText(new RegExp(`^${J.job_number} `)).locator('visible=true').nth(1).click({timeout: 6000}); await a.page.waitForTimeout(1500);
    return {ok: url().startsWith(`/fin/job/${J.id}`) && !/tab=setup/.test(url()), note: url()};
  });
  await step('Bill of Quantities: trail ends with it, job step is a link', async () => {
    await a.go(`/fin/job/${J.id}/boq`, 6000); await clear(); await a.page.waitForTimeout(1500);
    const t = await text();
    await a.page.getByText(new RegExp(`^${J.job_number} `)).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(1500);
    return {ok: /› Bill of Quantities/.test(t) && url() === `/fin/job/${J.id}`, note: url()};
  });
  await step('Purchases › Purchase invoices in the trail, and Purchases is a link', async () => {
    await a.go('/fin/purchases?tab=invoices', 6000); await clear(); await a.page.waitForTimeout(1500); await a.shot('pinv');
    const t = await text();
    return {ok: /Finance › Purchases › Purchase invoices/.test(t), note: (t.match(/Finance › [^⋯]{0,60}/) || [''])[0]};
  });
  await step('Documents tab: the job folder or a plain note that there is none', async () => {
    await a.go(`/fin/job/${J.id}?tab=docs`, 6000); await clear(); await a.page.waitForTimeout(3000); await a.shot('docs');
    const t = await text();
    return {ok: /Add a file here|no OneDrive folder yet/i.test(t) && /› Documents/.test(t), note: (t.match(/(\d\. [A-Za-z &]+|no OneDrive folder yet[^.]*)/) || ['not seen'])[0]};
  });
};
