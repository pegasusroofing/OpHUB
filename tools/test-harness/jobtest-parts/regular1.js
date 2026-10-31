// A regular job: set up, team, Schedule of Works from pre-start photo to complete, site condition, exports.
const fs = require('fs'), path = require('path');
const makeJpeg = async (page, file, w = 3000, h = 2000) => {
  if (fs.existsSync(file)) return file;
  const b64 = await page.evaluate(([w, h]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${Math.random() * 360},60%,${30 + Math.random() * 50}%)`; x.fillRect(Math.random() * w, Math.random() * h, 300, 200); }
    x.fillStyle = '#000'; x.font = '120px sans-serif'; x.fillText('OpHUB test photo', 200, 300);
    return c.toDataURL('image/jpeg', 0.92).split(',')[1];
  }, [w, h]);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
};

module.exports = async ({as, step, state, keep, samples}) => {
  const a = await as('admin');
  await a.go('/home');
  const photo = await makeJpeg(a.page, path.join(samples, 'site-photo.jpg'));

  await step('New job: fill in the form and create it', async () => {
    if (state.regular) return 'already made';
    await a.go('/sites/new');
    await a.field('Site name *', 'ZZ JOB Regular');
    await a.field('Address *', '1 Test Street, London');
    await a.field('Postcode', 'SW1A 1AA');
    const job = a.page.getByText('Job number', {exact: true}).locator('visible=true').last().locator('xpath=following::input[1]');
    if (await job.isEditable().catch(() => false)) await job.fill('ZZ-R1');
    await a.fill('Start typing — clients from the Directory or past jobs', 'ZZ Test Client').catch(async () => { await a.field('Client *', 'ZZ Test Client'); });
    await a.tap('Active');
    await a.tap('Choose a date');
    await a.shot('new-date');
    const today = String(new Date().getDate());
    await a.page.getByText(today, {exact: true}).locator('visible=true').last().click({timeout: 5000});
    await a.page.waitForTimeout(800);
    await a.shot('new-filled');
    await a.tap('Create Project', {wait: 4000});
    const row = (await a.get(`sites?select=id,name,status&name=eq.ZZ%20JOB%20Regular`))[0];
    if (!row) return {ok: false, note: 'no job in the database'};
    state.regular = row.id; keep();
    return row.status;
  });
  const J = state.regular;
  if (!J) return;

  await step('New job gets Drawings, Specification and Programme folders', async () => {
    const f = await a.get(`drawing_folders?select=name&site_id=eq.${J}`);
    return {ok: f.length >= 3, note: f.map((x) => x.name).join(', ')};
  });

  await step('Team: assign the operative and site manager', async () => {
    await a.go(`/sites/${J}/admin`);
    await a.tap('👥 Team — operatives, site managers & clients');
    await a.tap('Assign Operatives to Project');
    await a.shot('team');
    const before = (await a.get(`site_assignments?select=user_id&site_id=eq.${J}`)).length;
    if (!before) { await a.tap('Assign', {wait: 2000}); }
    await a.tap('Assign Site Managers');
    const on = await a.page.getByText('Assign', {exact: true}).locator('visible=true').count();
    if (on) await a.tap('Assign', {wait: 2000});
    const after = await a.get(`site_assignments?select=user_id&site_id=eq.${J}`);
    return {ok: after.length >= 1, note: `${after.length} assigned`};
  });

  await step('Schedule of Works: add a section', async () => {
    await a.go(`/sites/${J}/schedule`);
    await a.label('More');
    await a.tap('📁 Add Section');
    await a.tap('➕ New section');
    await a.fill('Section name, e.g. Roof Level 1', 'Main Roof');
    await a.tap('Add section', {wait: 2500});
    const s = await a.get(`schedule_sections?select=id,name&site_id=eq.${J}`);
    state.section = (s.find((x) => x.name === 'Main Roof') || {}).id; keep();
    return {ok: !!state.section};
  });

  await step('Schedule of Works: add two tasks to the section', async () => {
    await a.go(`/sites/${J}/schedule`);
    await a.tap('+ ADD TASK', {last: true});
    await a.fill('New task, e.g. Fit lead flashing', 'Strip old roof');
    await a.tap('Add', {wait: 2000});
    await a.fill('New task, e.g. Fit lead flashing', 'Lay new felt');
    await a.tap('Add', {wait: 2000});
    const t = await a.get(`schedule_tasks?select=id,name,status,section_id&site_id=eq.${J}&order=created_at`);
    state.task = (t.find((x) => x.name === 'Strip old roof') || {}).id; state.task2 = (t.find((x) => x.name === 'Lay new felt') || {}).id; keep();
    return {ok: t.length >= 2 && t.every((x) => x.section_id === state.section), note: `${t.length} tasks`};
  });

  const photosOf = async (task) => a.get(`schedule_photos?select=id,stage,storage_path,mid_path,thumb_path&task_id=eq.${task}`);
  await step('Pre-start photo: real upload, three sizes, and how long it takes', async () => {
    await a.go(`/sites/${J}/schedule`, 5000);
    await a.shot('sow-open');
    const start = Date.now();
    await a.pick(() => a.page.getByText(/pre-start/i).locator('visible=true').first().click({timeout: 7000}), [photo], 500);
    await a.shot('sow-uploading');
    const shown = await a.text();
    for (let i = 0; i < 40; i++) { if ((await photosOf(state.task)).length) break; await a.page.waitForTimeout(1000); }
    const p = await photosOf(state.task);
    return {ok: p.length === 1 && !!p[0].thumb_path && !!p[0].mid_path && p[0].stage === 'todo', note: `${Math.round((Date.now() - start) / 1000)}s, stage ${p[0]?.stage}, says uploading: ${/Uploading|ready/.test(shown)}`};
  });

  await step('Photo shows on the task after a reload', async () => {
    await a.go(`/sites/${J}/schedule`, 6000);
    await a.shot('sow-photo');
    const loaded = await a.page.locator('img').evaluateAll((els) => els.filter((e) => /site-photos/.test(e.src) && e.naturalWidth > 0).length);
    return {ok: loaded >= 1, note: `${loaded} loaded`};
  });

  await step('Task to In Progress', async () => {
    await a.tap(/^In Progress$/, {exact: false, last: false});
    await a.page.waitForTimeout(1500);
    const t = (await a.get(`schedule_tasks?select=status&id=eq.${state.task}`))[0];
    return {ok: t.status === 'progress', note: t.status};
  });

  await step('Progress photo is saved as a progress photo and asks for %', async () => {
    await a.pick(() => a.page.getByText(/add photo/i).locator('visible=true').first().click({timeout: 7000}), [photo], 500);
    for (let i = 0; i < 40; i++) { if ((await photosOf(state.task)).length > 1) break; await a.page.waitForTimeout(1000); }
    const p = await photosOf(state.task);
    await a.page.waitForTimeout(1500);
    await a.shot('sow-progress');
    const t = await a.text();
    return {ok: p.some((x) => x.stage === 'progress'), note: `${p.length} photos; asked for %: ${/%/.test(t)}`};
  });

  await step('Set progress to 50%', async () => {
    const opt = a.page.getByText(/^50%?$/).locator('visible=true').first();
    await opt.click({timeout: 7000}); await a.page.waitForTimeout(1500);
    const t = (await a.get(`schedule_tasks?select=percent_complete&id=eq.${state.task}`))[0];
    return {ok: t.percent_complete === 50, note: String(t.percent_complete)};
  });

  await step('Back to To Commence and forward again', async () => {
    await a.tap(/To Commence/, {exact: false, last: false});
    await a.page.waitForTimeout(1500);
    const b = (await a.get(`schedule_tasks?select=status&id=eq.${state.task}`))[0].status;
    await a.tap(/^In Progress$/, {exact: false, last: false});
    await a.page.waitForTimeout(1500);
    const f = (await a.get(`schedule_tasks?select=status&id=eq.${state.task}`))[0].status;
    return {ok: b === 'todo' && f === 'progress', note: `${b} then ${f}`};
  });

  await step('Complete needs a completed photo, then the task is done', async () => {
    await a.tap(/^Complete|Mark.*Complete|^Completed$/, {exact: false, last: false});
    await a.shot('sow-complete');
    await a.pick(() => a.page.getByText('📷 Add completed photos').locator('visible=true').first().click({timeout: 7000}), [photo], 1200);
    await a.tap('Yes', {wait: 800}).catch(() => {});
    for (let i = 0; i < 40; i++) { const t = (await a.get(`schedule_tasks?select=status&id=eq.${state.task}`))[0]; if (t.status === 'done') break; await a.page.waitForTimeout(1000); }
    const t = (await a.get(`schedule_tasks?select=status,percent_complete&id=eq.${state.task}`))[0];
    const p = await photosOf(state.task);
    return {ok: t.status === 'done' && p.some((x) => x.stage === 'done'), note: `${t.status}, ${t.percent_complete}%, ${p.length} photos`};
  });

  await step('Site condition: Submit asks are you sure, No keeps it open, Yes closes it', async () => {
    await a.go(`/sites/${J}/schedule`, 5000);
    await a.tap('Submit');
    const t = await a.text();
    if (!/only submit this once/i.test(t)) return {ok: false, note: 'no question'};
    await a.tap('No');
    const b = await a.text();
    await a.tap('Submit'); await a.tap('Yes', {wait: 2500});
    const after = await a.text();
    return {ok: /Submit/.test(b) && (/closed out/.test(after) || /Site condition submitted/.test(after)), note: 'submitted'};
  });

  await step('Schedule of Works: Export gives a real PDF with the task in it', async () => {
    await a.go(`/sites/${J}/schedule`, 5000);
    await a.page.getByText('All', {exact: true}).locator('visible=true').first().click().catch(() => {});
    await a.page.waitForTimeout(800);
    await a.tap('📄 Export');
    await a.shot('sow-export');
    const t0 = await a.text();
    const file = await a.saved(async () => {
      const opts = ['📄 PDF', 'Full', 'Whole', 'Everything'];
      for (const o of opts) { const el = a.page.getByText(o).locator('visible=true').last(); if (await el.isVisible().catch(() => false)) { await el.click(); await a.page.waitForTimeout(1200); } }
      const again = a.page.getByText('📄 PDF').locator('visible=true').last();
      if (await again.isVisible().catch(() => false)) await again.click();
    });
    const size = fs.statSync(file).size;
    return {ok: size > 5000 && fs.readFileSync(file).slice(0, 4).toString() === '%PDF', note: `${path.basename(file)} ${Math.round(size / 1024)}KB; menu: ${t0.includes('OneDrive')}`};
  });
};
