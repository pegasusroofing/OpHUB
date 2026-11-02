// New certificate rules and phone layout, on Sandbox's ZZ job. Publishes a new application, applies it, certifies one line short.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {}); };
  const [J] = await a.get('sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1');
  const latest = async () => (await a.get('fin_applications?select=*&site_id=eq.' + J.id + '&order=number.desc&limit=1'))[0];
  await a.page.setViewportSize({width: 375, height: 812});
  let app;
  await step('Phone: published draft fits, tall shots', async () => {
    await a.go('/fin/job/' + J.id + '/boq', 7000); await clear(); await a.page.waitForTimeout(1500);
    await a.page.getByText('Publish to Application for Payment', {exact: true}).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(6000);
    app = await latest();
    await a.shot('p1'); for (let i = 2; i <= 3; i++) { await a.page.mouse.move(180, 400); await a.page.mouse.wheel(0, 650); await a.page.waitForTimeout(500); await a.shot('p' + i); }
    const wide = await a.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const over = await a.page.locator('input').locator('visible=true').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().right > window.innerWidth).length);
    return {ok: wide && over === 0, note: 'no. ' + app.number + ', boxes off screen ' + over};
  });
  await step('Certificate: no boxes to type totals, lines start at last certified, one line short follows through', async () => {
    await a.page.getByText(/^Mark as Applied/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(1200);
    await a.page.getByText(/^Mark applied$/).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(3000); await a.shot('c1');
    const t0 = (await a.text()).replace(/\s+/g, ' ');
    const typedNet = await a.page.locator('input[placeholder]').evaluateAll((els) => els.filter((e) => /^-?[0-9.]+$/.test(e.placeholder)).length);
    const boxes = a.page.locator('input').locator('visible=true');
    const n = await boxes.count(); const skip = boxes.nth(3); await skip.fill('50'); await a.page.waitForTimeout(600); await a.shot('c2');
    await a.page.getByText(/^Save certificate$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(3500);
    const r = await latest();
    console.log('cert', r.status, r.cert_gross, r.cert_retention, r.cert_previous, r.cert_net, JSON.stringify(r.cert_lines).slice(0, 220));
    return {ok: typedNet === 0 && Array.isArray(r.cert_lines) && r.cert_lines.length >= 4 && r.cert_lines.some((l) => l.pct === 50), note: 'boxes ' + n + '; ' + t0.slice(t0.indexOf('Net due'), t0.indexOf('Net due') + 30) + '; saved net ' + r.cert_net};
  });
  await step('Laptop: Quotes in the left menu opens the tracker', async () => {
    await a.page.setViewportSize({width: 1440, height: 900});
    await a.go('/home', 5000); await clear(); await a.page.waitForTimeout(1200); await a.shot('nav');
    await a.page.getByText(/^Quotes$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(1800);
    return {ok: new URL(a.page.url()).pathname === '/pm/quotes', note: new URL(a.page.url()).pathname};
  });
};
