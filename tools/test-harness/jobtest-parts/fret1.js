// A project's Finance on Sandbox (Andy, 1 Nov): no Retention box on the Overview; the Retention tile opens Sales › Retention
// with the box and any retention invoices; Sales lists inside a project have no search bar or filter row on a laptop. Read only.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {}); };
  const text = async () => (await a.text()).replace(/\s+/g, ' ');
  const url = () => new URL(a.page.url()).pathname + new URL(a.page.url()).search;
  // A job billed by application, with retention held.
  const [J] = await a.get(`job_finance?select=site_id,billing_type&billing_type=eq.application&limit=1`);
  const sid = J?.site_id;
  await a.page.setViewportSize({width: 1440, height: 800});
  await step('Overview: no Retention box below Needs Attention', async () => {
    await a.go(`/fin/job/${sid}`, 6000); await clear(); await a.page.waitForTimeout(2000); await a.shot('ov');
    const t = await text();
    return {ok: !/Held to date/.test(t) && !/First half — at practical completion/.test(t), note: /Retention/.test(t) ? 'tile only' : 'no retention words'};
  });
  await step('Retention tile opens Sales › Retention with the box and release rows', async () => {
    await a.page.getByText(/^Retention$|^Released$|^Retention Taken$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(2000); await a.shot('ret');
    const t = await text();
    return {ok: /tab=sales/.test(url()) && /Held to date/.test(t) && /First half — at practical completion/.test(t) && /still held|No retention held/.test(t), note: url()};
  });
  await step('Invoices in a project: no search bar or filter row, table with column filters', async () => {
    await a.go(`/fin/job/${sid}?tab=sales&sub=invoices`, 6000); await clear(); await a.page.waitForTimeout(2000); await a.shot('inv');
    const search = await a.page.locator('input[placeholder^="Search invoice"]').locator('visible=true').count();
    const bar = await a.page.locator('[aria-label="Filter"]').locator('visible=true').count();
    const col = await a.page.locator('[aria-label="Filter Status"]').locator('visible=true').count();
    return {ok: search === 0 && bar === 0 && col >= 1, note: `search ${search}, filter button ${bar}, Status column filter ${col}`};
  });
  await step('Applications in a project: the same', async () => {
    await a.go(`/fin/job/${sid}?tab=sales&sub=apps`, 6000); await clear(); await a.page.waitForTimeout(2000); await a.shot('apps');
    const search = await a.page.locator('input[placeholder^="Search application"]').locator('visible=true').count();
    const bar = await a.page.locator('[aria-label="Filter"]').locator('visible=true').count();
    const t = await text();
    return {ok: search === 0 && bar === 0 && /Application|Nothing here/.test(t), note: `search ${search}, filter button ${bar}`};
  });
};
