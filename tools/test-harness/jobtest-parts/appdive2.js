// The certificate to draft invoice route from the list, on Sandbox's ZZ job: the invoice must take off what's previously certified.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {}); };
  const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
  const latest = async () => (await a.get('fin_applications?select=*&site_id=eq.' + J.id + '&order=number.desc&limit=1'))[0];
  await a.page.setViewportSize({width: 1440, height: 900});
  let app = await latest();
  await step('Save the certificate as applied', async () => {
    await a.go('/fin/job/' + J.id + '/application/' + app.id, 6000); await clear(); await a.page.waitForTimeout(1500);
    await a.page.getByText(/^Save certificate$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(3000);
    app = await latest();
    return {ok: app.cert_net != null, note: 'status ' + app.status + ', cert net ' + app.cert_net + ', previous ' + app.cert_previous};
  });
  await step('Raise from the list makes a draft with the previous taken off', async () => {
    await a.go('/fin/job/' + J.id + '?tab=sales&sub=apps', 6000); await clear(); await a.page.waitForTimeout(2000); await a.shot('list');
    await a.page.getByText(/^Raise invoice$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(800);
    await a.page.getByText(/^Raise draft$/).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(4000); await a.shot('inv');
    const r = await latest(); const inv = (await a.get('fin_invoices?select=*&id=eq.' + r.invoice_id))[0];
    const words = JSON.stringify(inv && inv.lines || []);
    return {ok: !!inv && inv.status === 'draft' && Math.abs(Number(inv.net) - Number(r.cert_net)) < 0.01 && /revious/.test(words), note: inv ? inv.status + ', invoice net ' + inv.net + ' against cert net ' + r.cert_net : 'no invoice'};
  });
};
