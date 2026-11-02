// Overview, then line by line, through the stages. Sandbox's ZZ JOB Fin C only; makes one application and certifies it.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  const text = () => a.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const ready = await a.get('fin_applications?select=id,status,number,cert_net&site_id=eq.' + J.id + '&order=number.desc&limit=1');
  let id = ready[0] && ready[0].status === 'draft' ? ready[0].id : null;
  await step('Draft opens on the overview', async () => {
    if (!id && ready[0] && ready[0].status === 'submitted' && ready[0].cert_net == null) id = ready[0].id;
    await a.go('/fin/job/' + J.id + '/application/' + (id || 'new'), 9000); await a.page.waitForTimeout(4000); id = new URL(a.page.url()).pathname.split('/').pop(); await a.shot('overview');
    const t = await text();
    return {ok: /Valuation/.test(t) && /Contract works/.test(t) && /Total due/.test(t) && /Line by line/.test(t), note: (t.match(/Contract works.{0,60}/) || [''])[0]};
  });
  await step('Line by line has the lines and a totals bar', async () => {
    await q('Line by line').first().click({timeout: 5000}); await a.page.waitForTimeout(800); await a.shot('lines');
    const [r] = await a.get('fin_applications?select=status&id=eq.' + id);
    const boxes = r.status === 'draft' ? await a.page.getByLabel('Percent done').count() : await q('Applied %').count();
    return {ok: boxes >= 1 && (await a.page.getByLabel('Totals').count()) === 1, note: 'boxes ' + boxes};
  });
  await step('Mark applied, stays on line by line with certified boxes', async () => {
    const [r] = await a.get('fin_applications?select=status&id=eq.' + id);
    if (r.status === 'draft') {
      await a.page.getByLabel('Percent done').first().fill('50'); await a.page.waitForTimeout(2800);
      await q('Mark as Applied').first().click({timeout: 5000}); await a.page.waitForTimeout(1500);
      await q('Mark applied').last().click({timeout: 5000}); await a.page.waitForTimeout(3500);
    }
    await a.shot('applied-lines'); await q('Certify').first().click({timeout: 5000}); await a.page.waitForTimeout(600);
    return {ok: (await a.page.getByLabel('Certified percent').count()) >= 1, note: 'boxes ' + (await a.page.getByLabel('Certified percent').count())};
  });
  await step('Certified as applied, then the overview shows both columns', async () => {
    await q('Certified as applied').first().click({timeout: 5000}); await a.page.waitForTimeout(600); await a.shot('applied-filled');
    await q('Overview').last().click({timeout: 5000}); await a.page.waitForTimeout(800); await a.shot('applied-overview');
    const t = await text();
    return {ok: /Certified to date/.test(t) && /This certificate/.test(t) && /Matches what was applied for/.test(t), note: (t.match(/Balance.{0,70}/) || [''])[0]};
  });
  await step('Save certificate: overview keeps the figures', async () => {
    await q('Save certificate').first().click({timeout: 5000}); await a.page.waitForTimeout(4500); await a.shot('certified');
    const [r] = await a.get('fin_applications?select=status,cert_net,net_due&id=eq.' + id);
    const t = await text();
    return {ok: r.cert_net != null && Number(r.cert_net) === Number(r.net_due) && /Raise invoice/.test(t) && /Certified to date/.test(t), note: r.status + ' cert ' + r.cert_net + ' applied ' + r.net_due};
  });
  await step('Phone: overview fits', async () => {
    await a.page.setViewportSize({width: 390, height: 800}); await a.page.waitForTimeout(800); await a.shot('phone');
    const over = await a.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await a.page.setViewportSize({width: 1440, height: 900});
    return {ok: over <= 1, note: 'over by ' + over};
  });
};
