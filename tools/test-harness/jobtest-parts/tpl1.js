// Settings › Templates and the email pop-up's template drop-down. Sandbox only: makes one template, uses it in the pop-up (nothing sent), then removes it.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  await a.page.setViewportSize({width: 1440, height: 900});
  const NAME = 'ZZ Test template';
  await step('Templates tab after Cost Codes', async () => {
    await a.go('/fin/settings', 6000); await a.page.waitForTimeout(2500);
    const c = await q('Cost Codes').first().boundingBox(), t = await q('Templates').first().boundingBox();
    await q('Templates').first().click({timeout: 5000}); await a.page.waitForTimeout(2500); await a.shot('page');
    return {ok: t.x > c.x && a.page.url().includes('/fin/templates') && (await q('Application for payment').count()) >= 1, note: a.page.url().split('/fin/')[1]};
  });
  await step('Make a default application template', async () => {
    await q('+ New Template').first().click({timeout: 5000}); await a.page.waitForTimeout(600);
    await a.page.getByPlaceholder('e.g. Standard application').fill(NAME);
    const subj = a.page.locator('input:visible').nth(1); await subj.fill('ZZ {project} application {number}');
    await a.shot('form');
    await q('Save').last().click({timeout: 5000}); await a.page.waitForTimeout(2500); await a.shot('saved');
    const rows = await a.get('fin_email_templates?select=id,is_default,subject&name=eq.' + encodeURIComponent(NAME));
    return {ok: rows.length === 1 && rows[0].is_default && rows[0].subject.startsWith('ZZ {project}'), note: JSON.stringify(rows)};
  });
  await step('Email pop-up picks it and fills in the job', async () => {
    const [J] = await a.get('sites?select=id,name&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
    const [app] = await a.get('fin_applications?select=id,number&site_id=eq.' + J.id + '&status=eq.submitted&cert_net=is.null&order=number.desc&limit=1');
    if (!app) return {ok: true, note: 'no applied application on Fin C to try'};
    await a.go('/fin/job/' + J.id + '/application/' + app.id, 8000); await a.page.waitForTimeout(3500);
    await q('Email Application').first().click({timeout: 5000}); await a.page.waitForTimeout(1500); await a.shot('popup');
    const vals = await a.page.locator('input:visible').evaluateAll((els) => els.map((e) => e.value));
    const picked = await q(NAME + ' (default)').count();
    await q('Cancel').last().click({timeout: 5000});
    return {ok: picked >= 1 && vals.some((v) => v === 'ZZ ' + J.name + ' application ' + app.number), note: 'picked ' + picked + ', ' + vals.filter(Boolean).join(' | ').slice(0, 160)};
  });
  await step('Remove the test template', async () => {
    await a.go('/fin/templates', 6000); await a.page.waitForTimeout(2500);
    await q(NAME).first().click({timeout: 5000}); await a.page.waitForTimeout(600);
    await q('Remove').last().click({timeout: 5000}); await a.page.waitForTimeout(600); await q('Remove').last().click({timeout: 5000}); await a.page.waitForTimeout(2000);
    const rows = await a.get('fin_email_templates?select=id&name=eq.' + encodeURIComponent(NAME));
    return {ok: rows.length === 0, note: 'left ' + rows.length};
  });
  await step('Phone: Templates page fits', async () => {
    await a.page.setViewportSize({width: 390, height: 844}); await a.page.waitForTimeout(800); await a.shot('phone');
    const over = await a.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await a.page.setViewportSize({width: 1440, height: 900});
    return {ok: over <= 1, note: 'over ' + over};
  });
};
