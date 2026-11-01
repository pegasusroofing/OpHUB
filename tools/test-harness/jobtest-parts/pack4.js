// Job pack: template documents, and a progress photo reaching its week folder.
const path = require('path');
module.exports = async ({as, step, state, samples}) => {
  const a = await as('admin');
  const photo = path.join(samples, 'site-photo.jpg');
  const P = state.pack;
  if (!process.env.WEEK_ONLY) await step('Project Admin: fill in anything missing copies the template documents', async () => {
    await a.go(`/sites/${P}/admin`, 5000);
    await a.page.getByText(/Site set up/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(1000);
    await a.tap('📦 Fill in anything missing from the job pack', {wait: 0});
    let msg = '';
    for (let i = 0; i < 60 && !msg; i++) { await a.page.waitForTimeout(1000); msg = ((await a.text()).match(/Job pack made[^\n]*|Folder made[^\n]*/) || [''])[0]; }
    await a.shot('j1');
    return {ok: /Job pack made/.test(msg), note: msg};
  });
  await step('Schedule: an in-progress photo is sent', async () => {
    await a.go(`/sites/${P}/schedule`, 5000);
    const before = (await a.get(`schedule_photos?select=id&storage_path=like.${P}*`)).length;
    const [fc] = await Promise.all([a.page.waitForEvent('filechooser', {timeout: 12000}), (async () => {
      await a.page.getByText('📷 Add photos').locator('visible=true').first().click({timeout: 7000});
      await a.page.waitForTimeout(800);
      const lib = a.page.getByText(/choose from|library/i).locator('visible=true').last();
      if (await lib.isVisible().catch(() => false)) await lib.click();
    })()]);
    await fc.setFiles([photo]);
    await a.page.waitForTimeout(14000);
    const after = (await a.get(`schedule_photos?select=id&storage_path=like.${P}*`)).length;
    return {ok: after === before + 1, note: `${before}→${after}`};
  });
};
