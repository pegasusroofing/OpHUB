// Five photos at once (one stuck on "Not sent yet" earlier), permit PDF, HAVS as the site manager.
const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, keep, samples, OUT}) => {
  const a = await as('admin'), m = await as('sm');
  const J = state.regular, C = state.mc, photo = path.join(samples, 'site-photo.jpg');
  const say = async (p, n = 300) => (await p.text()).replace(/\s+/g, ' ').slice(0, n);
  const pdfChoice = async (p) => { await p.page.waitForTimeout(1500); const c = p.page.getByText('📄 PDF', {exact: true}).locator('visible=true').last(); if (await c.isVisible().catch(() => false)) await c.click({timeout: 5000}); };

  await step('Schedule: five photos at once on a task all arrive, none left stuck', async () => {
    const tasks = await a.get(`schedule_tasks?select=id,name&site_id=eq.${J}&name=eq.${encodeURIComponent('ZZ imported task one')}`);
    const T = tasks[0].id;
    const count = async () => (await a.get(`schedule_photos?select=id&task_id=eq.${T}`)).length;
    const before = await count(); const fails=[]; a.page.on('requestfailed',(r)=>fails.push(r.method()+' '+r.url().split('?')[0].slice(-70)+' '+(r.failure()||{}).errorText));
    await a.go(`/sites/${J}/schedule`, 3000); await a.page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('upload-queue')).forEach((k) => localStorage.removeItem(k))); await a.go(`/sites/${J}/schedule`, 5000);
    const card = a.page.getByText('ZZ imported task one', {exact: true}).locator('visible=true').first().locator('xpath=ancestor::div[3]');
    const [fc] = await Promise.all([a.page.waitForEvent('filechooser', {timeout: 12000}), (async () => {
      await card.getByText(/Add pre-start photos/).first().click({timeout: 6000});
      await a.page.waitForTimeout(800);
      const lib = a.page.getByText(/choose from|library/i).locator('visible=true').last();
      if (await lib.isVisible().catch(() => false)) await lib.click();
    })()]);
    await fc.setFiles([photo, photo, photo, photo, photo]);
    const t0 = Date.now(); let n = before, sawStuck = false, reloaded = false;
    while (Date.now() - t0 < 45000) { await a.page.waitForTimeout(2500); n = await count(); if (/Not sent yet/.test(await a.text())) sawStuck = true; if (n >= before + 5) break; }
    const secs = Math.round((Date.now() - t0) / 1000);
    const errs = await a.page.evaluate(() => Object.keys(localStorage).filter((k) => /queue|upload/i.test(k)).map((k) => (localStorage.getItem(k) || '').match(/"lastError":"[^"]{0,160}/g)).flat().filter(Boolean));
    await a.page.waitForTimeout(12000); await a.shot('s5');
    return {ok: n === before + 5 && !sawStuck, note: `${before}→${n} in ${secs}s, stuck message: ${sawStuck}, failed: ${JSON.stringify(fails).slice(0, 700)}`};
  });

};
