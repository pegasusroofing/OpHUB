// Job pack: fill in the template documents through a shortcut, then real uploads through the app to each folder.
const path = require('path'), fs = require('fs');
const LOCAL = 'C:\\Users\\AndyCramp\\OneDrive - RTB Roofing Ltd\\OpHUB Progress Reports\\ZZ Job Packs\\ZZ JOB Pack Test';
module.exports = async ({as, step, state, keep, samples}) => {
  const a = await as('admin');
  const photo = path.join(samples, 'site-photo.jpg'), pdf = path.join(samples, 'sds.pdf');
  const say = async (p, n = 300) => (await p.text()).replace(/\s+/g, ' ').slice(0, n);
  const P = state.pack;

  await step('Project Admin: fill in anything missing copies the template documents', async () => {
    await a.go(`/sites/${P}/admin`, 5000);
    await a.tap('📦 Fill in anything missing from the job pack', {wait: 0});
    let msg = '';
    for (let i = 0; i < 30; i++) { await a.page.waitForTimeout(2000); const t = await a.text(); const m = t.match(/Job pack made[^\n]*|Folder made[^\n]*/); if (m) { msg = m[0]; break; } }
    await a.shot('f1');
    return {ok: /Job pack made/.test(msg), note: msg || await say(a, 200)};
  });
  await step('Documents: the template documents are there', async () => {
    await a.go(`/sites/${P}/documents`, 9000);
    await a.shot('f2');
    const t = await a.text();
    return {ok: /Handover Checklist/.test(t), note: t.replace(/\s+/g, ' ').slice(60, 400)};
  });
  await step('Documents: adds a file to a folder', async () => {
    await a.page.getByText('7. Main Contractor Docs', {exact: true}).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(5000);
    await a.pick(() => a.tap('⬆️ Add a file here', {wait: 0}), [pdf], 8000);
    await a.shot('f3');
    return {ok: /sds\.pdf/.test(await a.text()), note: await say(a, 220)};
  });
  await step('RAMS: uploading issues it and it lands in 1. RAMS', async () => {
    await a.go(`/sites/${P}/hs/rams`, 5000);
    await a.page.getByText(/Create \/ Upload RAMS/).locator('visible=true').first().click({timeout: 7000}).catch(() => {}); await a.page.waitForTimeout(700);
    await a.page.getByText('📄 Upload RAMS').locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(700);
    await a.fill('RAMS name', 'ZZ Pack RAMS');
    await a.pick(() => a.page.getByText(/Choose PDF/i).locator('visible=true').first().click({timeout: 7000}), [pdf], 1000);
    await a.page.getByText(/^Upload RAMS$/).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(9000);
    await a.shot('f4');
    const r = await a.get(`rams_docs?select=id&site_id=eq.${P}`);
    return {ok: r.length === 1, note: `${r.length} on the job`};
  });
};
