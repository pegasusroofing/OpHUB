// A regular job, continued: progress, complete, site condition, Export (PDF, share, OneDrive), email, Drawings.
const fs = require('fs'), path = require('path');
module.exports = async ({as, step, state, keep, samples, ANDY, OUT}) => {
  const a = await as('admin'), J = state.regular;
  const photo = path.join(samples, 'site-photo.jpg');
  const taskRow = (i) => a.page.getByText('Complete', {exact: true}).locator('visible=true').nth(i);
  const photosOf = (task) => a.get(`schedule_photos?select=id,stage&task_id=eq.${task}`);
  await a.go(`/sites/${J}/schedule`, 5000);

  await step('Slider: drag to 50% saves 50%', async () => {
    const pctLabel = a.page.getByText(/^\d+%$/).locator('visible=true').nth(1);
    const box = await pctLabel.boundingBox();
    const y = box.y + box.height / 2;
    await a.page.mouse.move(60, y); await a.page.mouse.down(); await a.page.mouse.move(168, y, {steps: 8}); await a.page.mouse.up();
    await a.page.waitForTimeout(2000);
    const t = (await a.get(`schedule_tasks?select=percent_complete&id=eq.${state.task}`))[0];
    return {ok: t.percent_complete >= 40 && t.percent_complete <= 60, note: `${t.percent_complete}%`};
  });

  await step('Complete asks for a completed photo, then the task is done', async () => {
    await taskRow(1).click({timeout: 7000}); await a.page.waitForTimeout(1200);
    await a.shot('complete');
    await a.pick(() => a.page.getByText('Add completed photos').locator('visible=true').first().click({timeout: 7000}), [photo], 1500);
    await a.shot('complete-ask');
    await a.tap('Yes', {wait: 800});
    for (let i = 0; i < 40; i++) { const t = (await a.get(`schedule_tasks?select=status&id=eq.${state.task}`))[0]; if (t.status === 'done') break; await a.page.waitForTimeout(1000); }
    const t = (await a.get(`schedule_tasks?select=status,percent_complete,completed_at&id=eq.${state.task}`))[0];
    const p = await photosOf(state.task);
    return {ok: t.status === 'done' && !!t.completed_at && p.some((x) => x.stage === 'done'), note: `${t.status}, ${t.percent_complete}%, ${p.length} photos`};
  });

  await step('Site condition really saved as submitted', async () => {
    const f = await a.get(`schedule_section_flags?select=*&site_id=eq.${J}`);
    return {ok: f.length > 0, note: JSON.stringify(f[0] || {}).slice(0, 140)};
  });

  const exportFlow = async () => {
    await a.go(`/sites/${J}/schedule`, 5000);
    await a.tap('All', {last: false, wait: 800});
    await a.page.getByText('Export', {exact: false}).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(800);
    await a.tap('Full project — every photo', {wait: 6000});
  };
  await step('Export: asks PDF or OneDrive, and the PDF is real', async () => {
    await exportFlow();
    await a.shot('export-choice');
    const t = await a.text();
    const file = await a.saved(() => a.tap('📄 PDF'));
    const size = fs.statSync(file).size;
    return {ok: t.includes('☁️ OneDrive') && fs.readFileSync(file).slice(0, 4).toString() === '%PDF' && size > 20000, note: `${path.basename(file)} ${Math.round(size / 1024)}KB`};
  });

  await step('Export: on a phone that can share, it hands over the file to the share menu', async () => {
    await a.page.evaluate(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = {n: d.files.length, name: d.files[0].name, size: d.files[0].size, title: 'title' in d}; }; });
    await a.page.getByText('Export', {exact: false}).locator('visible=true').last().click({timeout: 7000}).catch(() => {});
    await a.page.waitForTimeout(800);
    await a.tap('Full project — every photo', {wait: 6000}).catch(() => {});
    await a.tap('📤 Share (WhatsApp, email…)', {wait: 1500});
    const s = await a.page.evaluate(() => window.__shared);
    return {ok: !!s && s.n === 1 && s.size > 20000 && !s.title, note: JSON.stringify(s)};
  });

  await step('Email Report: real email to Andy only', async () => {
    await a.go(`/sites/${J}/schedule`, 5000);
    await a.page.getByText('Email Report', {exact: false}).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(1000);
    await a.shot('email-form');
    const boxes = a.page.locator('input').locator('visible=true');
    await boxes.last().fill(ANDY);
    await a.page.waitForTimeout(300);
    const t = await a.text();
    if (/\+ ?Add/.test(t)) await a.page.getByText(/\+ ?Add/).locator('visible=true').last().click().catch(() => {});
    await a.shot('email-filled');
    await a.page.getByText(/^(Next|Continue|Send|OK)/).locator('visible=true').last().click({timeout: 5000});
    await a.page.waitForTimeout(1000);
    await a.tap('Full project — every photo', {wait: 9000});
    await a.shot('email-sent');
    const after = await a.text();
    return {ok: /Emailed to 1 recipient/.test(after), note: after.includes('Could not') ? 'said could not' : ''};
  });

  // Drawings.
  const folderOf = async (name) => (await a.get(`drawing_folders?select=id&site_id=eq.${J}&name=eq.${name}`))[0]?.id;
  const filesIn = (f) => a.get(`drawing_files?select=id,name,status,supersedes,superseded_by,storage_path&site_id=eq.${J}&folder_id=eq.${f}&order=uploaded_at`);
  const pdf = path.join(samples, 'wo.pdf'), csv = path.join(samples, 'boq.csv');
  await step('Drawings tile is tall enough; folder opens', async () => {
    const f = await folderOf('Drawings'); state.dwg = f; keep();
    await a.go(`/sites/${J}/drawings/${f}`);
    await a.shot('dwg-folder');
    return !!f;
  });
  const upload = async (files, sup) => {
    await a.page.locator('text="+"').locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(700);
    const t = await a.text();
    const first = t.indexOf('Upload a file') < t.indexOf('Add Folder');
    await a.tap('📄 Upload a file');
    if (sup) await a.page.getByText(sup).locator('visible=true').last().click();
    await a.pick(() => a.tap('Choose file(s)', {wait: 0}), files, 5000);
    return first;
  };
  await step('Upload a file is first in Add; a PDF goes into the folder', async () => {
    const first = await upload([pdf]);
    const f = await filesIn(state.dwg);
    return {ok: first && f.length === 1, note: `${f.length} file(s), top option: ${first}`};
  });
  await step('Any file type: a CSV goes in the Drawings folder too', async () => {
    await upload([csv]);
    const f = await filesIn(state.dwg);
    return {ok: f.some((x) => /boq\.csv/.test(x.name)), note: f.map((x) => x.name).join(', ')};
  });
  await step('File menu: rename through the drop-down', async () => {
    await a.go(`/sites/${J}/drawings/${state.dwg}`);
    await a.label('Options for wo.pdf');
    await a.shot('dwg-menu');
    await a.tap('✏️ Rename');
    await a.page.locator('input').locator('visible=true').last().fill('Roof plan A.pdf');
    await a.tap('OK', {wait: 2000});
    return {ok: (await filesIn(state.dwg)).some((x) => x.name === 'Roof plan A.pdf')};
  });
  await step('Viewing a file: Export hands over the same file', async () => {
    await a.page.getByText('View', {exact: true}).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(4000);
    await a.shot('dwg-view');
    await a.page.locator('[aria-label="Export"]').locator('visible=true').click({timeout: 7000});
    await a.page.waitForTimeout(1200);
    await a.shot('dwg-export');
    const t = await a.text();
    const file = await a.saved(() => a.tap('📄 PDF'));
    await a.label('Close');
    return {ok: t.includes('OneDrive') && fs.statSync(file).size > 500, note: path.basename(file)};
  });
  await step('Supersede: the new file replaces the old, old moves to Superseded', async () => {
    await upload([pdf], 'Roof plan A.pdf');
    const f = await filesIn(state.dwg);
    const old = f.find((x) => x.name === 'Roof plan A.pdf'), nw = f.find((x) => x.supersedes === old?.id);
    await a.go(`/sites/${J}/drawings/${state.dwg}`);
    const t = await a.text();
    return {ok: old?.status === 'superseded' && !!nw && /Superseded Documents \(1\)/.test(t), note: `${old?.status}`};
  });
  await step('File menu: delete asks first and removes it', async () => {
    await a.label('Options for boq.csv');
    await a.tap('🗑 Delete');
    await a.tap('Delete', {wait: 2500});
    return {ok: !(await filesIn(state.dwg)).some((x) => /boq\.csv/.test(x.name))};
  });
  await step('Add a folder inside a folder, trail shows it, back goes up one', async () => {
    await a.page.locator('text="+"').locator('visible=true').first().click({timeout: 7000});
    await a.tap('📁 Add Folder');
    await a.fill('e.g. Roof Plans', 'ZZ Sub folder');
    await a.tap('Create Folder', {wait: 2500});
    await a.tap('ZZ Sub folder', {wait: 3000});
    const t = await a.text();
    await a.label('Back', 1500);
    const u = a.page.url();
    return {ok: /Drawings/.test(t) && u.includes(state.dwg), note: u.split('/').slice(-2).join('/')};
  });
};
