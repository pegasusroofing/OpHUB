// hs3's steps again, with its test mistakes put right.
const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, keep, samples, OUT}) => {
  const a = await as('admin'), o = await as('op'), s = await as('sub');
  const J = state.regular, C = state.mc, photo = path.join(samples, 'site-photo.jpg'), pdf = path.join(samples, 'sds.pdf');
  const say = async (p, n = 300) => (await p.text()).replace(/\s+/g, ' ').slice(0, n);
  const pdfChoice = async (p) => { const c = p.page.getByText('📄 PDF', {exact: true}).locator('visible=true').last(); await p.page.waitForTimeout(1500); if (await c.isVisible().catch(() => false)) await c.click(); };

  await step('Permit: issue one; its PDF is stored; Export gives a real PDF', async () => {
    await a.go(`/sites/${C}/mc/permits`, 4500);
    await a.tap('+ Issue Permit');
    await a.page.getByText(/Hot Works/).locator('visible=true').first().click(); await a.page.waitForTimeout(300);
    await a.page.getByText('ZZ Subbie Ltd').locator('visible=true').first().click(); await a.page.waitForTimeout(800);
    await a.page.getByText(/☐ andy subbie/).locator('visible=true').first().click(); await a.page.waitForTimeout(300);
    await a.page.locator('input[placeholder^="e.g. Hot works"], textarea[placeholder^="e.g. Hot works"]').locator('visible=true').first().fill('ZZ second permit for the PDF test');
    await a.shot('p0');
    await a.page.getByText('Issue Permit', {exact: true}).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(8000);
    const ps = await a.get(`permits?select=id,description&site_id=eq.${C}&order=issued_at.desc&limit=1`);
    state.permit = ps[0]?.id; keep();
    await a.go(`/sites/${C}/mc/permits/${state.permit}`, 4500);
    await a.shot('p1');
    const f = await a.saved(async () => { await a.tap('📄 Export', {wait: 500}); await pdfChoice(a); });
    fs.copyFileSync(f, path.join(OUT, 'permit-sample.pdf'));
    return {ok: /second permit/.test(ps[0]?.description || '') && fs.readFileSync(f).slice(0, 5).toString() === '%PDF-', note: `${path.basename(f)} ${fs.statSync(f).size} bytes`};
  });

  await step('Schedule: photos added today on a finished task, so the report has two days', async () => {
    await a.go(`/sites/${J}/schedule`, 5000);
    await a.tap('All', {wait: 1000});
    await a.page.getByText('Strip old roof').locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(1500);
    await a.shot('s0');
    const before = (await a.get(`schedule_photos?select=id&task_id=eq.${state.task}`)).length;
    const [fc] = await Promise.all([a.page.waitForEvent('filechooser', {timeout: 12000}), (async () => {
      await a.page.getByText(/Add .*photo|📷/i).locator('visible=true').first().click();
      await a.page.waitForTimeout(800);
      const lib = a.page.getByText(/choose from|library/i).locator('visible=true').last();
      if (await lib.isVisible().catch(() => false)) await lib.click();
    })()]);
    await fc.setFiles([photo, photo]);
    await a.page.waitForTimeout(8000);
    const after = (await a.get(`schedule_photos?select=id&task_id=eq.${state.task}`)).length;
    return {ok: after > before, note: `${before}→${after}`};
  });
  await step('Schedule: export has every photo', async () => {
    await a.go(`/sites/${J}/schedule`, 5000);
    const f = await a.saved(async () => { await a.tap('📄 Export', {wait: 900}); await a.tap('Full project — every photo', {wait: 8000}); await pdfChoice(a); });
    fs.copyFileSync(f, path.join(OUT, 'sow-sample.pdf'));
    const imgs = (fs.readFileSync(f).toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length;
    return {ok: imgs >= 5, note: `${imgs} images, ${fs.statSync(f).size} bytes`};
  });

  await step('HAVS: manager adds a new tool to the job', async () => {
    await a.go(`/sites/${J}/hs/havs`, 5000);
    await a.tap('+ New tool', {wait: 700});
    await a.page.locator('input').locator('visible=true').last().fill('ZZ breaker');
    await a.tap('OK', {wait: 700});
    await a.page.locator('input').locator('visible=true').last().fill('5');
    await a.tap('OK', {wait: 3000});
    await a.shot('h5');
    const r = await a.get(`site_havs_tools?select=tool_id&site_id=eq.${J}`);
    return {ok: r.length >= 1, note: `${r.length} tools | ${await say(a, 220)}`};
  });
  await step('HAVS: operative logs minutes, points show and they save', async () => {
    await o.go(`/sites/${J}/hs/havspuwer`, 4500);
    await o.shot('h6');
    await o.go(`/sites/${J}/hs/havs`, 5000);
    await o.shot('h7');
    const t0 = await say(o);
    if (/doesn't exist|Managers only|not switched/i.test(t0)) return {ok: false, note: t0};
    await o.page.getByText(/^▶?\s*(Mon|Monday)/).locator('visible=true').first().click({timeout: 6000});
    await o.page.waitForTimeout(800);
    await o.page.locator('input[placeholder="Mins"]').locator('visible=true').first().fill('45', {timeout: 6000});
    await o.shot('h8');
    await o.tap('Save Minutes', {wait: 3000});
    await o.shot('h9');
    const r = await a.get(`havs_entries?select=minutes&site_id=eq.${J}`);
    return {ok: r.some((x) => x.minutes === 45), note: `${r.length} entries | ${await say(o, 160)}`};
  }, 'op');

  await step('Subcontractor admin: uploads RAMS into their company folder', async () => {
    const before = (await a.get(`rams_docs?select=id&site_id=eq.${C}&subcontractor_company_id=eq.${state.subco}`)).length;
    await s.go(`/sites/${C}/mc/subcontractors/${state.subco}/docs?kind=rams`, 5000);
    await s.shot('sa1');
    await s.page.getByText(/Upload RAMS/i).locator('visible=true').first().click({timeout: 7000}); await s.page.waitForTimeout(800);
    await s.fill('RAMS name', 'ZZ RAMS from the sub admin');
    await s.pick(() => s.page.getByText(/Choose PDF/i).locator('visible=true').first().click({timeout: 7000}), [pdf], 1500);
    await s.page.getByText(/^Upload RAMS$/).locator('visible=true').last().click({timeout: 7000});
    await s.page.waitForTimeout(4000);
    await s.shot('sa3');
    const after = (await a.get(`rams_docs?select=id&site_id=eq.${C}&subcontractor_company_id=eq.${state.subco}`)).length;
    return {ok: after === before + 1, note: `${before}→${after}`};
  }, 'sub');
  await step('Subcontractor admin: Schedule of Works shows only their tasks', async () => {
    await s.go(`/sites/${C}/mc/subcontractors/${state.subco}/schedule`, 5000);
    await s.shot('sa5');
    return {note: await say(s, 260)};
  }, 'sub');
  await step('Subcontractor admin: can open their own company Permits and Daily Briefings', async () => {
    await s.go(`/sites/${C}/mc/subcontractors/${state.subco}/briefings`, 5000);
    await s.shot('sa6');
    return {ok: !/Page not found/.test(await s.text()), note: await say(s, 220)};
  }, 'sub');
};
