// The job pack rules not yet run, for real, on ZZ JOB Pack Test: each is checked on the laptop's synced folder afterwards.
// Also: OneDrive folder picker, drawings coming in, "I've emailed it", and a PM adding a subcontractor.
const path = require('path'), fs = require('fs');
const ROOT = 'C:\\Users\\AndyCramp\\OneDrive - RTB Roofing Ltd\\OpHUB Progress Reports\\ZZ Job Packs\\ZZ JOB Pack Test';
module.exports = async ({as, step, state, keep, samples}) => {
  const a = await as('admin');
  const J = state.pack, photo = path.join(samples, 'site-photo.jpg'), pdf = path.join(samples, 'sds.pdf');
  const say = async (n = 260) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const only = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
  const run = (name, fn) => (!only || only.test(name) ? step(name, fn) : null);
  const anyPhoto = async (press) => {
    const [fc] = await Promise.all([a.page.waitForEvent('filechooser', {timeout: 12000}), (async () => { await press(); await a.page.waitForTimeout(800); const lib = a.page.getByText(/choose from|library/i).locator('visible=true').last(); if (await lib.isVisible().catch(() => false)) await lib.click(); })()]);
    await fc.setFiles([photo]); await a.page.waitForTimeout(3000);
  };

  await run('Toolbox talk: issued one lands in 3. Toolbox Talks, a banked one doesn’t', async () => {
    await a.go(`/sites/${J}/hs/tbt`, 5000);
    await a.fill('Title, e.g. Week 24 — Manual Handling', 'ZZ Pack Talk').catch(async () => { await a.page.getByText(/Upload/i).locator('visible=true').first().click(); await a.page.waitForTimeout(700); await a.fill('Title, e.g. Week 24 — Manual Handling', 'ZZ Pack Talk'); });
    await a.pick(() => a.page.getByText(/Choose PDF/i).locator('visible=true').first().click({timeout: 7000}), [pdf], 800);
    await a.page.getByText(/^UPLOAD$|^Upload$/).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(3500);
    const t = (await a.get(`toolbox_talks?select=id,title,status&site_id=eq.${J}`)).find((x) => /ZZ Pack Talk/.test(x.title));
    await a.go(`/sites/${J}/hs/tbt/${t.id}`, 4000);
    await a.page.getByText(/Issue for Signing/i).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(5000);
    return {ok: true, note: 'check folder after'};
  });
  await run('COSHH: added to the job lands in 2. COSHH', async () => {
    await a.go(`/sites/${J}/hs/coshh`, 5000);
    await a.page.getByText('📄 Upload COSHH').locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(800);
    await a.shot('co1');
    await a.page.locator('input').locator('visible=true').first().fill('ZZ Pack COSHH');
    await a.pick(() => a.page.getByText(/Choose PDF/i).locator('visible=true').first().click({timeout: 7000}), [pdf], 800);
    await a.page.getByText(/^Upload COSHH$/).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(6000);
    const r = await a.get(`coshh_docs?select=id&site_id=eq.${J}`);
    return {ok: r.length >= 1, note: `${r.length} on the job`};
  });
  await run('Variation: approved one puts its photo in 3. Variations', async () => {
    await a.go(`/sites/${J}/snagging/variations`, 5000);
    await anyPhoto(() => a.page.getByText('📷 Tap to add a photo').locator('visible=true').first().click());
    await a.tap('Cancel', {wait: 800}).catch(() => {});
    await a.fill("What's changed and why...", 'ZZ Pack Variation');
    await a.tap('Submit Variation', {wait: 4500});
    await a.page.getByText('ZZ Pack Variation').locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(1000);
    await a.page.getByText(/Approve/i).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(1200);
    const y = a.page.getByText(/^(Yes|Approve|Confirm)/).locator('visible=true').last();
    if (await y.isVisible().catch(() => false)) await y.click();
    await a.page.waitForTimeout(5000);
    const v = await a.get(`variations?select=approval_status&site_id=eq.${J}`);
    return {ok: v.some((x) => /approv/.test(x.approval_status || '')), note: JSON.stringify(v).slice(0, 100)};
  });
  await run('Permit: closed one lands in 3. Permits to Work', async () => {
    await a.go(`/sites/${J}/mc/permits`, 5000);
    await a.shot('p0');
    await a.tap('+ Issue Permit');
    await a.shot('p1');
    await a.page.getByText(/Height|Roof|Confined|Excavation|General/i).locator('visible=true').first().click({timeout: 5000}).catch(() => {}); await a.page.waitForTimeout(300);
    const who = a.page.getByText(/^☐ /).locator('visible=true').first();
    if (await who.isVisible().catch(() => false)) await who.click();
    await a.fill('e.g. Hot works to re-felt the plant room roof', 'ZZ pack permit');
    await a.shot('p2');
    await a.page.getByText('Issue Permit', {exact: true}).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(8000);
    const ps = await a.get(`permits?select=id,status,assigned_user_ids&site_id=eq.${J}&order=issued_at.desc&limit=1`);
    if (!ps[0]) return {ok: false, note: `no permit: ${await say()}`};
    await a.go(`/sites/${J}/mc/permits/${ps[0].id}`, 4500);
    await a.shot('p3');
    await a.page.getByText(/Close (this permit|down|permit)/i).locator('visible=true').last().click({timeout: 7000}); await a.page.waitForTimeout(1200);
    await a.shot('p4');
    const yes = a.page.getByText(/^(Yes|Close|Close anyway)/).locator('visible=true').last();
    if (await yes.isVisible().catch(() => false)) await yes.click();
    await a.page.waitForTimeout(9000);
    await a.shot('p5');
    const after = await a.get(`permits?select=status&id=eq.${ps[0].id}`);
    return {ok: after[0]?.status === 'closed', note: `${after[0]?.status} | ${(await say(160))}`};
  });
  await run('Briefing: completed one lands in the week folder', async () => {
    await a.go(`/sites/${J}/hs/briefings`, 4500);
    await a.tap('+ New Briefing', {wait: 5000});
    await a.page.evaluate(() => document.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 40) e.scrollTop = e.scrollHeight; })); await a.page.waitForTimeout(400);
    await a.tap('Complete Briefing', {wait: 9000});
    const s = await a.get(`report_submissions?select=status&site_id=eq.${J}&order=submitted_at.desc&limit=1`);
    return {ok: s[0]?.status === 'completed', note: s[0]?.status};
  });
  await run('Drawing: added in the app lands in Project Drawings', async () => {
    const f = (await a.get(`drawing_folders?select=id,name&site_id=eq.${J}&name=eq.Drawings`))[0];
    await a.go(`/sites/${J}/drawings/${f.id}`, 5000);
    await a.shot('dw0');
    await a.page.locator('text="+"').locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(800);
    await a.shot('dw1');
    await a.pick(() => a.page.getByText(/Upload/i).locator('visible=true').first().click({timeout: 7000}), [pdf], 2500);
    await a.shot('dw2');
    const save = a.page.getByText(/^(Upload|Save|Add)/).locator('visible=true').last();
    if (await save.isVisible().catch(() => false)) await save.click().catch(() => {});
    await a.page.waitForTimeout(8000);
    await a.shot('dw3');
    const r = await a.get(`site_drawings?select=id&site_id=eq.${J}`).catch(() => []);
    return {note: `${r.length} rows | ${await say(160)}`};
  });
  await run('Schedule: Export then OneDrive lands in the week folder', async () => {
    await a.go(`/sites/${J}/schedule`, 5000);
    await a.tap('📄 Export', {wait: 900});
    await a.tap('Full project — every photo', {wait: 500});
    const od = a.page.getByText('☁️ OneDrive', {exact: true}).locator('visible=true').last();
    await od.waitFor({timeout: 60000}); await od.click(); await a.page.waitForTimeout(9000);
    await a.shot('so1');
    return {ok: /Saved to OneDrive/i.test(await a.text()), note: await say(140)};
  });
  await run('Folder picker: a quote links to a folder already there', async () => {
    await a.go('/pm/quotes/new', 4500);
    await a.field('Client *', 'ZZ Flow Client');
    await a.field('Project name *', 'ZZ JOB Picker');
    await a.page.getByText('Create Enquiry').locator('visible=true').last().click();
    for (let i = 0; i < 30 && !/quotes\/[0-9a-f-]{36}/.test(a.page.url()); i++) await a.page.waitForTimeout(1500);
    return {note: a.page.url().slice(-40)};
  });
  await run('I’ve emailed it: marks sent and files the folder, with no email', async () => {
    await a.go('/pm/quotes/new', 4500);
    await a.field('Client *', 'ZZ Flow Client');
    await a.field('Project name *', 'ZZ JOB Self Sent');
    await a.page.getByText('Create Enquiry').locator('visible=true').last().click();
    for (let i = 0; i < 40 && !/quotes\/[0-9a-f-]{36}/.test(a.page.url()); i++) await a.page.waitForTimeout(1500);
    const id = (a.page.url().match(/quotes\/([0-9a-f-]{36})/) || [])[1];
    await a.go(`/pm/quotes/${id}`, 5000);
    await a.shot('se1');
    await a.page.getByText('📨 Send & submit').locator('visible=true').first().click(); await a.page.waitForTimeout(700);
    await a.field('Value £ *', '12345');
    await a.page.getByText('Submit', {exact: true}).locator('visible=true').last().click(); await a.page.waitForTimeout(900);
    await a.page.getByText('Submit', {exact: true}).locator('visible=true').last().click();
    let q; for (let i = 0; i < 20; i++) { await a.page.waitForTimeout(1500); q = (await a.get(`quotes?select=status,filed_at,value,chase_count&id=eq.${id}`))[0]; if (q.filed_at) break; }
    await a.shot('se2');
    return {ok: q.status === 'returned' && !!q.filed_at && Number(q.value) === 12345 && q.chase_count === 0, note: JSON.stringify(q)};
  });
  await run('PM adds a subcontractor: it reaches the company library', async () => {
    await a.go(`/sites/${state.mc}/mc/subcontractors`, 5000);
    await a.tap('+ Add Subcontractor');
    await a.fill('e.g. Acme Scaffolding', 'ZZ Library Subbie');
    await a.tap('Add', {wait: 4000});
    await a.shot('sb1');
    const c = await a.get(`subcontractor_companies?select=id,name&site_id=eq.${state.mc}&name=eq.${encodeURIComponent('ZZ Library Subbie')}`);
    const p = await a.get(`subcontractor_company_profiles?select=id,name&name=eq.${encodeURIComponent('ZZ Library Subbie')}`);
    return {ok: c.length === 1 && p.length >= 1, note: `on job ${c.length}, in library ${p.length} | ${(await say(120))}`};
  });
  await new Promise((r) => setTimeout(r, 30000));
  const files = []; (function w(d, rel) { for (const e of fs.readdirSync(d, {withFileTypes: true})) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) w(path.join(d, e.name), r); else files.push(r); } })(ROOT, '');
  console.log(files.filter((f) => !/Handover Checklist|Tracker|Application for Payment|Sub Contractor Price|Programme Template|Delivery_Schedule/.test(f)).join('\n'));
};
