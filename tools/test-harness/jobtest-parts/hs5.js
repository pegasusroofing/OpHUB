// Five photos at once (one stuck on "Not sent yet" earlier), permit PDF, HAVS as the site manager.
const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, keep, samples, OUT}) => {
  const a = await as('admin'), m = await as('sm');
  const J = state.regular, C = state.mc, photo = path.join(samples, 'site-photo.jpg');
  const say = async (p, n = 300) => (await p.text()).replace(/\s+/g, ' ').slice(0, n);
  const pdfChoice = async (p) => { await p.page.waitForTimeout(1500); const c = p.page.getByText('📄 PDF', {exact: true}).locator('visible=true').last(); if (await c.isVisible().catch(() => false)) await c.click({timeout: 5000}); };

  await step('Schedule: five photos at once on a task all arrive, none left stuck', async () => {
    const tasks = await a.get(`schedule_tasks?select=id,name&site_id=eq.${J}&name=eq.${encodeURIComponent('ZZ imported task two')}`);
    const T = tasks[0].id;
    const count = async () => (await a.get(`schedule_photos?select=id&task_id=eq.${T}`)).length;
    const before = await count();
    await a.go(`/sites/${J}/schedule`, 5000);
    const card = a.page.getByText('ZZ imported task two', {exact: true}).locator('visible=true').first().locator('xpath=ancestor::div[3]');
    const [fc] = await Promise.all([a.page.waitForEvent('filechooser', {timeout: 12000}), (async () => {
      await card.getByText(/Add pre-start photos/).first().click({timeout: 6000});
      await a.page.waitForTimeout(800);
      const lib = a.page.getByText(/choose from|library/i).locator('visible=true').last();
      if (await lib.isVisible().catch(() => false)) await lib.click();
    })()]);
    await fc.setFiles([photo, photo, photo, photo, photo]);
    const t0 = Date.now(); let n = before, sawStuck = false;
    while (Date.now() - t0 < 45000) { await a.page.waitForTimeout(2500); n = await count(); if (/Not sent yet/.test(await a.text())) sawStuck = true; if (n >= before + 5) break; }
    const secs = Math.round((Date.now() - t0) / 1000);
    const errs = await a.page.evaluate(() => Object.keys(localStorage).filter((k) => /queue|upload/i.test(k)).map((k) => (localStorage.getItem(k) || '').match(/"lastError":"[^"]{0,160}/g)).flat().filter(Boolean));
    await a.shot('s5');
    return {ok: n === before + 5 && !sawStuck, note: `${before}→${n} in ${secs}s, stuck message: ${sawStuck}, errors: ${JSON.stringify(errs).slice(0, 240)}`};
  });

  await step('Permit: issue one; its PDF is stored; Export gives a real PDF', async () => {
    await a.go(`/sites/${C}/mc/permits`, 4500);
    await a.tap('+ Issue Permit');
    await a.shot('p00');
    await a.page.getByText('ZZ Subbie Ltd', {exact: true}).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(800);
    await a.page.getByText(/☐ andy subbie/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(300);
    await a.fill('e.g. Hot works to re-felt the plant room roof', 'ZZ second permit for the PDF test');
    await a.shot('p0');
    await a.page.getByText('Issue Permit', {exact: true}).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(8000);
    const ps = await a.get(`permits?select=id,description,permit_type&site_id=eq.${C}&order=issued_at.desc&limit=1`);
    state.permit = ps[0]?.id; keep();
    await a.go(`/sites/${C}/mc/permits/${state.permit}`, 4500);
    await a.shot('p1');
    const f = await a.saved(async () => { await a.tap('📄 Export', {wait: 300}); await pdfChoice(a); });
    fs.copyFileSync(f, path.join(OUT, 'permit-sample.pdf'));
    return {ok: /second permit/.test(ps[0]?.description || '') && fs.readFileSync(f).slice(0, 5).toString() === '%PDF-', note: `${ps[0]?.permit_type}, ${path.basename(f)} ${fs.statSync(f).size} bytes`};
  });

  await step('HAVS: site manager logs an operative’s minutes and they save', async () => {
    await m.go(`/sites/${J}/hs/havs`, 5000);
    await m.shot('h10');
    const t0 = await say(m);
    await m.page.getByText(/Mon/).locator('visible=true').nth(0).click({timeout: 6000}).catch(() => {});
    await m.page.waitForTimeout(900);
    await m.shot('h11');
    const box = m.page.locator('input[placeholder="Mins"]').locator('visible=true').first();
    if (!(await box.isVisible().catch(() => false))) return {ok: false, note: t0};
    await box.fill('45');
    await m.tap('Save Minutes', {wait: 3000});
    await m.shot('h12');
    const r = await a.get(`havs_entries?select=minutes&site_id=eq.${J}`);
    return {ok: r.some((x) => x.minutes === 45), note: `${r.length} entries | ${await say(m, 200)}`};
  }, 'sm');
};
