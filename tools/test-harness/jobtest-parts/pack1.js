// The new job pack, for real, in a test folder inside OpHUB Progress Reports (Sandbox's rules point there).
const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, keep, samples}) => {
  const a = await as('admin');
  const photo = path.join(samples, 'site-photo.jpg');
  const say = async (p, n = 300) => (await p.text()).replace(/\s+/g, ' ').slice(0, n);
  const P = () => state.pack;

  await step('New job: making it sets up its OneDrive folder by itself', async () => {
    await a.go('/sites/new');
    await a.field('Site name *', 'ZZ JOB Pack Test');
    await a.field('Address *', '9 Pack Road, London');
    await a.fill('Start typing — clients from the Directory or past jobs', 'ZZ Test Client').catch(async () => { await a.field('Client *', 'ZZ Test Client'); });
    await a.tap('Active');
    await a.tap('Choose a date');
    await a.page.getByText(String(new Date().getDate()), {exact: true}).locator('visible=true').last().click({timeout: 5000});
    await a.page.waitForTimeout(800);
    await a.tap('Create Project', {wait: 4000});
    const row = (await a.get(`sites?select=id&name=eq.${encodeURIComponent('ZZ JOB Pack Test')}`))[0];
    if (!row) return {ok: false, note: await say(a)};
    state.pack = row.id; keep();
    let pack = null;
    for (let i = 0; i < 40 && !pack; i++) { await a.page.waitForTimeout(3000); pack = (await a.get(`sites?select=job_pack&id=eq.${P()}`))[0]?.job_pack; }
    return {ok: !!pack, note: pack ? `${pack.path}, week 1 from ${pack.week1}` : 'no pack saved after 2 minutes'};
  });

  await step('Documents tile: shows the folder for a project manager', async () => {
    await a.go(`/sites/${P()}`, 5000);
    await a.shot('d0');
    await a.page.getByText('Documents', {exact: true}).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(7000);
    await a.shot('d1');
    const t = await a.text();
    return {ok: /2\. Health & Safety/.test(t) && /8\. Handover/.test(t) && /Handover Checklist/.test(t), note: t.replace(/\s+/g, ' ').slice(60, 330)};
  });
  await step('Documents tile: goes into a folder and adds a file', async () => {
    await a.page.getByText('7. Main Contractor Docs', {exact: true}).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(6000);
    await a.pick(() => a.tap('⬆️ Add a file here', {wait: 0}), [path.join(samples, 'sds.pdf')], 7000);
    await a.shot('d2');
    return {ok: /sds\.pdf/.test(await a.text()), note: await say(a, 240)};
  });
};
