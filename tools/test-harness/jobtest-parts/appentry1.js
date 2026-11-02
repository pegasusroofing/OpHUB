// %, £ or qty for Applied and for Certified. Sandbox's ZZ JOB Fin C: makes a draft if there's none, and marks it applied. The certificate isn't saved.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  const pick = async (from, to) => { await q(from).first().click({timeout: 5000}); await a.page.waitForTimeout(400); await q(to).last().click({timeout: 5000}); await a.page.waitForTimeout(400); };
  const open = async (id) => { await a.go('/fin/job/' + J.id + '/application/' + id, 9000); await a.page.waitForTimeout(4000); await q('Line by line').first().click({timeout: 5000}); await a.page.waitForTimeout(600); };
  const line = (l) => (l.lines || []).find((x) => x.description === 'Strip tiles');
  let id;
  await step('Applied by £ on the draft', async () => {
    const [last] = await a.get('fin_applications?select=id,status&site_id=eq.' + J.id + '&order=number.desc&limit=1');
    if (last.status !== 'draft' && last.status !== 'submitted') { await a.go('/fin/job/' + J.id + '/application/new', 9000); await a.page.waitForTimeout(3000); id = new URL(a.page.url()).pathname.split('/').pop(); }
    else if (last.status === 'submitted') { await a.go('/fin/job/' + J.id + '/application/' + last.id, 9000); await a.page.waitForTimeout(3500); await q('Save certificate').first().click({timeout: 6000}).catch(() => {}); await a.page.waitForTimeout(3500); await a.go('/fin/job/' + J.id + '/application/new', 9000); await a.page.waitForTimeout(3000); id = new URL(a.page.url()).pathname.split('/').pop(); }
    else id = last.id;
    await open(id);
    await pick('Enter %', 'Enter £');
    await a.page.getByLabel('Amount done').first().fill('625'); await a.page.waitForTimeout(3000); await a.shot('draft-gbp');
    const [r] = await a.get('fin_applications?select=lines&id=eq.' + id);
    return {ok: Number(line(r).pct) === 50, note: 'pct ' + line(r).pct};
  });
  await step('Applied by qty on the draft', async () => {
    await pick('Enter £', 'Enter qty');
    await a.page.getByLabel('Quantity done').first().fill('75'); await a.page.waitForTimeout(3000); await a.shot('draft-qty');
    const [r] = await a.get('fin_applications?select=lines&id=eq.' + id);
    return {ok: Number(line(r).pct) === 75, note: 'pct ' + line(r).pct};
  });
  await step('Applied by % still works', async () => {
    await pick('Enter qty', 'Enter %');
    await a.page.getByLabel('Percent done').first().fill('80'); await a.page.waitForTimeout(3000);
    const [r] = await a.get('fin_applications?select=lines&id=eq.' + id);
    return {ok: Number(line(r).pct) === 80, note: 'pct ' + line(r).pct};
  });
  await step('Certified by £', async () => {
    await q('Mark as Applied').first().click({timeout: 5000}); await a.page.waitForTimeout(1500);
    await q('Mark applied').last().click({timeout: 5000}); await a.page.waitForTimeout(3500);
    await pick('Enter %', 'Enter £');
    await a.page.getByLabel('Certified amount').first().fill('625'); await a.page.waitForTimeout(500); await a.shot('cert-gbp');
    return {ok: (await q('£625.00').count()) >= 1 && (await q('Certified £').count()) >= 1, note: 'shows £625'};
  });
  await step('Certified by qty, then back to %: same figure', async () => {
    await pick('Enter £', 'Enter qty');
    const q1 = await a.page.getByLabel('Certified quantity').first().inputValue();
    await a.page.getByLabel('Certified quantity').first().fill('20'); await a.page.waitForTimeout(500); await a.shot('cert-qty');
    const shows = (await q('£250.00').count()) >= 1;
    await pick('Enter qty', 'Enter %'); await a.shot('cert-pct');
    const p = await a.page.getByLabel('Certified percent').first().inputValue();
    return {ok: q1 === '50' && shows && p === '20', note: 'qty showed ' + q1 + ', now ' + p + '%'};
  });
  await step('One line can switch on its own', async () => {
    await a.page.getByLabel('Enter by quantity').first().click({timeout: 5000}); await a.page.waitForTimeout(400); await a.shot('cert-one');
    return {ok: (await a.page.getByLabel('Certified quantity').count()) === 1, note: 'qty boxes ' + (await a.page.getByLabel('Certified quantity').count())};
  });
};
