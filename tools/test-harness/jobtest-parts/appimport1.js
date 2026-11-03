// Applied: Email Application pop-up (nothing sent) and Import Certificate from our own exported Excel. Sandbox's ZZ JOB Fin C only; may make and apply one application.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  let [app] = await a.get('fin_applications?select=id&site_id=eq.' + J.id + '&status=eq.submitted&cert_net=is.null&order=number.desc&limit=1');
  await step('An applied application to work on', async () => {
    if (!app) {
      const [d] = await a.get('fin_applications?select=id&site_id=eq.' + J.id + '&status=eq.draft&limit=1');
      await a.go('/fin/job/' + J.id + '/application/' + (d ? d.id : 'new'), 9000); await a.page.waitForTimeout(3500);
      const id = new URL(a.page.url()).pathname.split('/').pop();
      await q('Line By Line').first().click({timeout: 5000}); await a.page.waitForTimeout(500);
      await q('Set All To 100%').first().click({timeout: 5000}); await a.page.waitForTimeout(3500);
      await q('Apply For Payment').first().click({timeout: 5000}); await a.page.waitForTimeout(1500);
      await q('Apply For Payment').last().click({timeout: 5000}); await a.page.waitForTimeout(3500);
      app = {id};
    }
    const [r] = await a.get('fin_applications?select=status&id=eq.' + app.id);
    return {ok: r.status === 'submitted', note: r.status};
  });
  await step('Email Application pop-up: client email, CC Me ticked, Email Me Only', async () => {
    await a.go('/fin/job/' + J.id + '/application/' + app.id, 8000); await a.page.waitForTimeout(3500);
    await q('Email Application').first().click({timeout: 5000}); await a.page.waitForTimeout(800); await a.shot('email');
    const cc = await a.page.getByText(/^CC Me \(/).locator('visible=true').count(), only = await q('Email Me Only').count(), send = await q('Send').count();
    await q('Cancel').last().click({timeout: 5000}); await a.page.waitForTimeout(400);
    return {ok: cc === 1 && only === 1 && send === 1, note: 'cc ' + cc + ', me only ' + only + ', send ' + send};
  });
  await step('Import Certificate reads our exported Excel', async () => {
    const dl = a.page.waitForEvent('download', {timeout: 20000});
    await q('Export To Excel').first().click({timeout: 5000}); await a.page.waitForTimeout(1200);
    const sow = await a.page.getByText(/^No — just the application/).locator('visible=true').count(); if (sow) { await a.page.getByText(/^No — just the application/).first().click(); await a.page.waitForTimeout(800); }
    await a.page.getByText(/Download$/).locator('visible=true').first().click({timeout: 6000}).catch(() => {});
    const file = await (await dl).path();
    const chooser = a.page.waitForEvent('filechooser', {timeout: 10000});
    await q('Import Certificate').first().click({timeout: 5000});
    await (await chooser).setFiles(file); await a.page.waitForTimeout(3500); await a.shot('imported');
    const boxes = await a.page.getByLabel('Certified percent').count(), note = await a.page.getByText(/Read from the client’s Excel|doesn’t look like/).locator('visible=true').count();
    return {ok: boxes >= 1 && note >= 1, note: 'certified boxes ' + boxes + ', note ' + note};
  });
};
