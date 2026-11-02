// Publish twice, % to quantity, edits kept on reopening, on Sandbox's ZZ job. Publishes one draft and changes it.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {}); };
  const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
  const latest = async () => (await a.get('fin_applications?select=*&site_id=eq.' + J.id + '&order=number.desc&limit=1'))[0];
  const publish = async () => { await a.go('/fin/job/' + J.id + '/boq', 7000); await clear(); await a.page.waitForTimeout(1500); await a.page.getByText('Publish to Application for Payment', {exact: true}).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(6000); };
  await a.page.setViewportSize({width: 375, height: 812});
  let app;
  await step('Publishing twice keeps one draft', async () => {
    await publish(); const one = await latest(); await publish(); app = await latest();
    return {ok: one.id === app.id && app.status === 'draft', note: 'no. ' + one.number + ' then ' + app.number};
  });
  await step('Tap % to enter by quantity; the % follows', async () => {
    await a.page.getByLabel('Enter by quantity').first().click({timeout: 6000}); await a.page.waitForTimeout(500);
    const q = a.page.getByLabel('Quantity done').first(); const was = await q.inputValue(); await q.fill('50'); await a.page.waitForTimeout(500); await a.shot('qty');
    await a.page.getByText(/^Save$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(2500);
    const r = await latest(); const l = r.lines.filter((x) => x.qty)[0];
    return {ok: Number(l.pct) === 50 && Number(l.qty) === 100, note: 'qty was ' + was + ', line ' + l.description + ' now ' + l.pct + '%'};
  });
  await step('A variation value changed on the draft survives reopening', async () => {
    const r0 = await latest(); const vars = r0.variations.map((v, i) => (i ? v : {...v, value: 777}));
    await a.go('/fin/job/' + J.id + '/application/' + r0.id, 6000); await clear(); await a.page.waitForTimeout(1500);
    const v = a.page.locator('input[placeholder="£ value"]').first(); await v.fill('777'); await a.page.waitForTimeout(300);
    await a.page.getByText(/^Save$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(2500);
    await a.go('/fin/job/' + J.id + '/application/' + r0.id, 6000); await a.page.waitForTimeout(1500); await a.shot('kept');
    const r = await latest();
    return {ok: Number(r.variations[0].value) === 777, note: 'value ' + r.variations[0].value + ' (' + vars.length + ' variations)'};
  });
};
