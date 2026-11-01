// Job pack: template documents through a shortcut, the Documents tile, and photos reaching Pre Start and a week folder.
const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, samples}) => {
  const a = await as('admin');
  const photo = path.join(samples, 'site-photo.jpg'), pdf = path.join(samples, 'sds.pdf');
  const say = async (p, n = 300) => (await p.text()).replace(/\s+/g, ' ').slice(0, n);
  const P = state.pack;
  const addPhoto = async (label) => {
    const [fc] = await Promise.all([a.page.waitForEvent('filechooser', {timeout: 12000}), (async () => {
      await a.page.getByText(label).locator('visible=true').first().click({timeout: 7000});
      await a.page.waitForTimeout(800);
      const lib = a.page.getByText(/choose from|library/i).locator('visible=true').last();
      if (await lib.isVisible().catch(() => false)) await lib.click();
    })()]);
    await fc.setFiles([photo]);
    await a.page.waitForTimeout(12000);
  };

  await step('Project Admin: fill in anything missing copies the template documents', async () => {
    await a.go(`/sites/${P}/admin`, 5000);
    const opener = a.page.getByText(/OneDrive/).locator('visible=true').first();
    if (await opener.isVisible().catch(() => false)) { await opener.click(); await a.page.waitForTimeout(800); }
    await a.shot('g0');
    await a.tap('📦 Fill in anything missing from the job pack', {wait: 0});
    let msg = '';
    for (let i = 0; i < 40 && !msg; i++) { await a.page.waitForTimeout(1000); msg = ((await a.text()).match(/Job pack made[^\n]*|Folder made[^\n]*/) || [''])[0]; }
    await a.shot('g1');
    return {ok: /Job pack made/.test(msg), note: msg || await say(a, 200)};
  });
  await step('Documents: the template documents are there', async () => {
    await a.page.waitForTimeout(8000);
    await a.go(`/sites/${P}/documents`, 9000);
    await a.shot('g2');
    const t = await a.text();
    return {ok: /Handover Checklist/.test(t), note: t.replace(/\s+/g, ' ').slice(60, 420)};
  });
  await step('Documents: adds a file to a folder', async () => {
    await a.page.getByText('7. Main Contractor Docs', {exact: true}).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(5000);
    await a.pick(() => a.tap('⬆️ Add a file here', {wait: 0}), [pdf], 9000);
    await a.shot('g3');
    return {ok: /sds\.pdf/.test(await a.text()), note: await say(a, 220)};
  });
  await step('Schedule: a pre-start photo is sent', async () => {
    await a.go(`/sites/${P}/schedule`, 5000);
    await a.shot('g4');
    await addPhoto(/Add pre-start photos/);
    const r = await a.get(`schedule_photos?select=id,stage&storage_path=like.${P}*`);
    return {ok: r.some((x) => x.stage === 'todo'), note: `${r.length} photos`};
  });
  await step('Schedule: an in-progress photo is sent', async () => {
    await a.tap('In Progress', {wait: 2000});
    const skip = a.page.getByText(/^(Skip|Not now|Cancel)$/).locator('visible=true').last();
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await a.page.waitForTimeout(1200);
    await a.shot('g5');
    await addPhoto(/Add progress photos|Add photos|progress/i);
    await a.shot('g6');
    const r = await a.get(`schedule_photos?select=id,stage&storage_path=like.${P}*`);
    return {ok: r.some((x) => x.stage === 'progress'), note: JSON.stringify(r.map((x) => x.stage))};
  });
};
