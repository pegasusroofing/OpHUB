// Look only: the ddf retention release application (No. 3). The variation isn't new, and certifying starts at what was certified. Nothing saved.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  await a.page.setViewportSize({width: 430, height: 932});
  const [J] = await a.get('sites?select=id&job_number=eq.SBX-126&limit=1');
  const [app] = await a.get('fin_applications?select=id&site_id=eq.' + J.id + '&number=eq.3');
  const text = () => a.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await step('Overview: nothing new on variations', async () => {
    await a.go('/fin/job/' + J.id + '/application/' + app.id, 8000); await a.page.getByText('Line By Line', {exact: true}).locator('visible=true').first().waitFor({timeout: 30000}); await a.page.waitForTimeout(1500); await a.shot('overview');
    const t = await text(), v = (t.match(/Variations £[\d,.]+ £[\d,.]+ £[\d,.]+/) || [''])[0];
    return {ok: /Variations £100\.00 £100\.00 £0\.00/.test(t), note: v};
  });
  await step('Certify: certified to date starts at last time', async () => {
    await q('Certify').last().click({timeout: 8000}); await a.page.waitForTimeout(800); await q('Overview').last().click(); await a.page.waitForTimeout(800); await a.shot('certifying');
    const t = await text(), m = (t.match(/Subtotal £[\d,.]+ £[\d,.]+ £[\d,.]+ [−-]?£[\d,.]+/) || [''])[0];
    return {ok: /Subtotal £710\.00 £710\.00 £710\.00 £0\.00/.test(t), note: m};
  });
};
