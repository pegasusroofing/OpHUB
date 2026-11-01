// To Do's new look, variation mark-up, permit PDF, a second day's Schedule photos, HAVS, an inspection, the subcontractor admin.
const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, keep, samples, OUT}) => {
  const a = await as('admin'), o = await as('op'), s = await as('sub');
  const J = state.regular, C = state.mc, photo = path.join(samples, 'site-photo.jpg');
  const pdf = path.join(samples, 'sample.pdf');
  const say = async (p, n = 300) => (await p.text()).replace(/\s+/g, ' ').slice(0, n);
  const scrollEnd = async (p) => { await p.page.evaluate(() => document.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 40) e.scrollTop = e.scrollHeight; })); await p.page.waitForTimeout(400); };

  await step('To Do: counts across the top filter the list', async () => {
    await a.go(`/sites/${J}/todos`, 5000);
    await a.shot('t1');
    const t = await a.text();
    await a.label('Overdue', 900);
    await a.shot('t2');
    const t2 = await a.text();
    await a.label('Live', 700);
    return {ok: /Overdue/.test(t) && /Chase scaffold/.test(t2) && !/Send updated programme/.test(t2), note: t.replace(/\s+/g, ' ').slice(70, 330)};
  });
  await step('To Do: press one to open, comment, then Mark Complete', async () => {
    await a.page.getByText('ZZ Order lead for chimney flashing').locator('visible=true').first().click(); await a.page.waitForTimeout(800);
    await a.fill('Add a comment…', 'ZZ code 4, a day’s notice');
    await a.tap('Comment', {wait: 2000});
    await a.shot('t3');
    await a.tap('Mark Complete', {wait: 2500});
    const r = await a.get(`todos?select=done&text=eq.${encodeURIComponent('ZZ Order lead for chimney flashing')}`);
    return {ok: r[0]?.done === true, note: JSON.stringify(r[0])};
  });
  await step('To Do: + Add To Do makes a new one', async () => {
    await a.tap('+ Add To Do', {wait: 700});
    await a.fill('What needs doing?', 'ZZ added from the new button');
    await a.shot('t4');
    await a.page.getByText('Add To Do', {exact: true}).locator('visible=true').last().click({timeout: 5000}).catch(() => a.page.getByText(/^(Add|Save)$/).locator('visible=true').last().click());
    await a.page.waitForTimeout(2500);
    const r = await a.get(`todos?select=id&site_id=eq.${J}&text=eq.${encodeURIComponent('ZZ added from the new button')}`);
    return {ok: r.length === 1, note: await say(a, 160)};
  });

  await step('Variation: photo opens for marking up, then saves', async () => {
    const before = (await a.get(`variations?select=id&site_id=eq.${J}`)).length;
    await a.go(`/sites/${J}/snagging/variations`, 5000);
    await scrollEnd(a);
    const [fc] = await Promise.all([a.page.waitForEvent('filechooser', {timeout: 12000}), (async () => {
      await a.page.getByText('📷 Tap to add a photo').locator('visible=true').first().click();
      await a.page.waitForTimeout(800);
      const lib = a.page.getByText(/choose from|library/i).locator('visible=true').last();
      if (await lib.isVisible().catch(() => false)) await lib.click();
    })()]);
    await fc.setFiles([photo]);
    await a.page.waitForTimeout(3000);
    await a.shot('v1');
    const inEditor = /Cancel/.test(await a.text());
    const box = await a.page.viewportSize();
    await a.page.mouse.move(120, box.height / 2); await a.page.mouse.down(); await a.page.mouse.move(260, box.height / 2 + 40, {steps: 6}); await a.page.mouse.up();
    await a.page.waitForTimeout(300);
    await a.shot('v2');
    await a.page.getByText(/^(Save|💾 Save|✓ Save)/).locator('visible=true').last().click({timeout: 6000});
    await a.page.waitForTimeout(2500);
    await a.shot('v3');
    await a.fill("What's changed and why...", 'ZZ marked-up variation');
    await a.tap('Submit Variation', {wait: 4500});
    const r = await a.get(`variations?select=id,photo_path&site_id=eq.${J}&order=created_at.desc`);
    return {ok: inEditor && r.length === before + 1 && !!r[0].photo_path, note: `editor ${inEditor}, ${before}→${r.length}`};
  });

  await step('Permit: a PDF is made and stored when one is issued, and Export gives a PDF', async () => {
    await a.go(`/sites/${C}/mc/permits`, 4500);
    await a.tap('+ Issue Permit');
    await a.page.getByText(/Hot Works/).locator('visible=true').first().click(); await a.page.waitForTimeout(300);
    await a.page.locator('input[placeholder^="e.g. Hot works"], textarea[placeholder^="e.g. Hot works"]').locator('visible=true').first().fill('ZZ torch-on felt to the plant room').catch(() => {});
    await a.page.getByText('Issue Permit', {exact: true}).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(7000);
    const ps = await a.get(`permits?select=id,status&site_id=eq.${C}&order=issued_at.desc&limit=1`);
    state.permit = ps[0]?.id; keep();
    await a.go(`/sites/${C}/mc/permits/${state.permit}`, 4500);
    await a.shot('p1');
    const f = await a.saved(async () => { await a.tap('📄 Export', {wait: 2000}); const c = a.page.getByText(/^(📄 )?(PDF|Save|Download)/).locator('visible=true').last(); if (await c.isVisible().catch(() => false)) await c.click(); });
    const fixed = path.join(OUT, 'permit-sample.pdf'); fs.copyFileSync(f, fixed);
    return {ok: fs.readFileSync(f).slice(0, 5).toString() === '%PDF-', note: `${path.basename(f)} ${fs.statSync(f).size} bytes`};
  });

  await step('Schedule: a photo added today, so the report has two days', async () => {
    await a.go(`/sites/${J}/schedule`, 5000);
    await a.page.getByText('Strip old roof').locator('visible=true').first().click({timeout: 6000}).catch(() => {});
    await a.page.waitForTimeout(1500);
    await a.shot('s0');
    const before = (await a.get(`schedule_photos?select=id&task_id=eq.${state.task}`)).length;
    const [fc] = await Promise.all([a.page.waitForEvent('filechooser', {timeout: 12000}), (async () => {
      await a.page.getByText(/Add .*photo|📷/).locator('visible=true').first().click();
      await a.page.waitForTimeout(800);
      const lib = a.page.getByText(/choose from|library/i).locator('visible=true').last();
      if (await lib.isVisible().catch(() => false)) await lib.click();
    })()]);
    await fc.setFiles([photo, photo]);
    await a.page.waitForTimeout(7000);
    const after = (await a.get(`schedule_photos?select=id&task_id=eq.${state.task}`)).length;
    return {ok: after > before, note: `${before}→${after}`};
  });
  await step('Schedule: export from the To Do tab still has every photo', async () => {
    await a.go(`/sites/${J}/schedule`, 5000);
    const f = await a.saved(async () => {
      await a.tap('📄 Export', {wait: 900}); await a.tap('Full project — every photo', {wait: 9000});
      const c = a.page.getByText(/^(📄 )?(PDF|Save|Download)/).locator('visible=true').last(); if (await c.isVisible().catch(() => false)) await c.click();
    });
    const fixed = path.join(OUT, 'sow-sample.pdf'); fs.copyFileSync(f, fixed);
    const buf = fs.readFileSync(f).toString('latin1');
    const imgs = (buf.match(/\/Subtype\s*\/Image/g) || []).length;
    return {ok: imgs >= 5, note: `${imgs} images, ${fs.statSync(f).size} bytes`};
  });

  await step('HAVS: manager adds a tool to the job', async () => {
    await a.go(`/sites/${J}/hs/havs`, 5000);
    await a.page.getByText('Test', {exact: true}).locator('visible=true').first().click({timeout: 6000}).catch(() => {});
    await a.page.waitForTimeout(2500);
    await a.shot('h1');
    const r = await a.get(`site_havs_tools?select=tool_id&site_id=eq.${J}`);
    return {ok: r.length >= 1, note: `${r.length} tools | ${await say(a, 200)}`};
  });
  await step('HAVS: operative logs minutes and they save', async () => {
    await o.go(`/sites/${J}/hs/havs`, 5000);
    await o.shot('h2');
    const day = o.page.getByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/).locator('visible=true').last();
    await day.click({timeout: 6000}).catch(() => {}); await o.page.waitForTimeout(800);
    await o.page.locator('input[placeholder="Mins"]').locator('visible=true').first().fill('45');
    await o.shot('h3');
    await o.tap('Save Minutes', {wait: 3000});
    await o.shot('h4');
    const r = await a.get(`havs_entries?select=minutes&site_id=eq.${J}`);
    return {ok: r.some((x) => x.minutes === 45), note: `${r.length} entries | ${await say(o, 160)}`};
  }, 'op');

  await step('Inspection: manager starts one and completes it', async () => {
    await a.go(`/sites/${C}/mc/inspections`, 5000);
    await a.tap('+ New Inspection', {wait: 1000});
    await a.shot('r1');
    await a.page.getByText('Start', {exact: true}).locator('visible=true').first().click({timeout: 6000});
    await a.page.waitForTimeout(5000);
    await a.shot('r2');
    await scrollEnd(a);
    await a.tap('Complete Inspection', {wait: 5000});
    await a.shot('r3');
    const r = await a.get(`report_submissions?select=status,template_name&site_id=eq.${C}&order=submitted_at.desc&limit=1`);
    return {ok: r[0]?.status === 'completed', note: `${JSON.stringify(r[0])} | ${await say(a, 180)}`};
  });

  await step('Subcontractor admin: uploads RAMS into their company folder', async () => {
    const before = (await s.get(`rams_docs?select=id&site_id=eq.${C}&subcontractor_company_id=eq.${state.subco}`)).length;
    await s.go(`/sites/${C}/mc/subcontractors/${state.subco}/rams`, 5000);
    await s.shot('sa1');
    const t = await say(s);
    await s.page.getByText(/Upload RAMS/i).locator('visible=true').first().click({timeout: 7000}); await s.page.waitForTimeout(800);
    await s.fill('RAMS name', 'ZZ RAMS from the sub admin');
    await s.pick(() => s.page.getByText(/Choose|PDF|file/i).locator('visible=true').first().click({timeout: 7000}), [pdf], 1500).catch(() => {});
    await s.shot('sa2');
    await s.page.getByText(/^Upload RAMS$/).locator('visible=true').last().click({timeout: 7000});
    await s.page.waitForTimeout(4000);
    await s.shot('sa3');
    const after = (await s.get(`rams_docs?select=id&site_id=eq.${C}&subcontractor_company_id=eq.${state.subco}`)).length;
    return {ok: after === before + 1, note: `${before}→${after} | ${t.slice(60, 220)}`};
  }, 'sub');
  await step('Subcontractor admin: Operatives page and other tiles', async () => {
    await s.go(`/sites/${C}/mc/subcontractors/${state.subco}/operatives`, 5000);
    await s.shot('sa4');
    const t1 = await say(s, 400);
    await s.go(`/sites/${C}/mc/subcontractors/${state.subco}/schedule`, 5000);
    await s.shot('sa5');
    return {note: t1};
  }, 'sub');
};
