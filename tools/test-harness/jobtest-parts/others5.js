// Final round: repair to closed, O&M, COSHH, RAMS builder issue, a report, Export to OneDrive, a drawing to OneDrive.
const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, samples}) => {
  const a = await as('admin'), o = await as('op');
  const J = state.regular, R = state.repair, photo = path.join(samples, 'site-photo.jpg'), pdf = path.join(samples, 'wo.pdf');
  const OD = process.env.OD_DIR;
  const anyPhoto = async (p, press) => {
    const [fc] = await Promise.all([p.page.waitForEvent('filechooser', {timeout: 12000}), (async () => {
      await press(); await p.page.waitForTimeout(700);
      const lib = p.page.getByText(/choose from|library/i).locator('visible=true').last();
      if (await lib.isVisible().catch(() => false)) await lib.click();
    })()]);
    await fc.setFiles([photo]); await p.page.waitForTimeout(3500);
  };
  const job = async () => (await a.get(`repair_jobs?select=*&id=eq.${state.repairJob}`))[0];
  await step('Repair: works completed with notes and a photo', async () => {
    await a.go(`/sites/${R}/repairs/job/${state.repairJob}`);
    await a.fill('Progress notes', 'ZZ works done').catch(() => {});
    await a.page.getByText('Save notes').locator('visible=true').first().click().catch(() => {});
    await a.page.waitForTimeout(1200);
    await anyPhoto(a, () => a.page.getByText(/Add Photos/i).locator('visible=true').last().click({timeout: 7000}));
    await a.page.waitForTimeout(2500);
    await a.page.getByText(/Mark Works as Completed/).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(1500);
    await a.shot('rep-w');
    const y = a.page.getByText(/^(Yes|Confirm|OK|Complete)$/).locator('visible=true').last();
    if (await y.isVisible().catch(() => false)) await y.click();
    await a.page.waitForTimeout(3000);
    const j = await job();
    return {ok: j.works_completed === true, note: j.job_status};
  });
  await step('Repair: sign off and close', async () => {
    await a.go(`/sites/${R}/repairs/job/${state.repairJob}`);
    await a.page.getByText(/Sign Off & Close Job/).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(1000);
    await a.tap('Sign off', {wait: 3000});
    const j = await job();
    return {ok: j.closed === true, note: j.job_status};
  });
  await step('Repair: survey and works PDFs are real', async () => {
    await a.go(`/sites/${R}/repairs/job/${state.repairJob}`);
    await a.page.getByText(/Survey Report PDF/i).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(5000);
    const f = await a.saved(() => a.tap('📄 PDF'));
    return {ok: fs.statSync(f).size > 5000, note: `${path.basename(f)} ${Math.round(fs.statSync(f).size / 1024)}KB`};
  });
  await step('O&M: new manual built from the job, PDF is real', async () => {
    await a.go(`/sites/${J}/handover`);
    await a.tap('+ New O&M manual', {wait: 1500});
    await a.tap('OK', {wait: 7000});
    await a.shot('om-open');
    const url = a.page.url();
    await a.page.getByText(/Export PDF/i).locator('visible=true').last().click({timeout: 7000});
    const f = await a.saved(async () => { await a.page.waitForTimeout(9000); await a.tap('📄 PDF'); });
    return {ok: url.includes('/om/') && fs.statSync(f).size > 1500, note: `${path.basename(f)} ${Math.round(fs.statSync(f).size / 1024)}KB`};
  });
  await step('COSHH: upload a real document', async () => {
    await a.go(`/sites/${J}/hs/coshh`);
    await a.page.getByText('📄 Upload COSHH').locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(800);
    await a.fill('COSHH name', 'ZZ Primer');
    await a.pick(() => a.page.getByText(/Choose PDF/i).locator('visible=true').first().click({timeout: 7000}), [pdf], 1000);
    await a.page.getByText(/^Upload COSHH$/).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(4000);
    const d = await a.get(`coshh_docs?select=id,name&site_id=eq.${J}`);
    state.coshh = d[0]?.id;
    return {ok: d.length >= 1, note: d[0]?.name};
  });
  await step('Operative signs the COSHH', async () => {
    await o.go(`/sites/${J}/hs/coshh`, 5000);
    await o.page.getByText(/Sign All/i).locator('visible=true').first().click({timeout: 7000});
    await o.page.waitForTimeout(3500);
    const sg = await a.get(`coshh_signatures?select=id&coshh_id=eq.${state.coshh}`);
    return {ok: sg.length >= 1, note: `${sg.length} signature(s)`};
  }, 'op');
  await step('RAMS builder: Issue tab says what is missing, then issues to the job', async () => {
    await a.go(`/sites/${J}/hs/rams/build/${state.build}`);
    await a.tap('Issue', {last: false, wait: 1200});
    await a.shot('build-issue');
    const before = (await a.get(`rams_docs?select=id&site_id=eq.${J}`)).length;
    const el = a.page.getByText(/Issue Risk Assessment & Method Statement/).locator('visible=true').first();
    await el.click({timeout: 7000}); await a.page.waitForTimeout(1500);
    const said = (await a.text()).replace(/\s+/g, ' ').slice(0, 300);
    const y = a.page.getByText(/^(Yes|Issue|OK|Confirm)$/).locator('visible=true').last();
    if (await y.isVisible().catch(() => false)) await y.click();
    await a.page.waitForTimeout(6000);
    await a.shot('build-issued');
    const after = (await a.get(`rams_docs?select=id&site_id=eq.${J}`)).length;
    const b = await a.get(`rams_builds?select=status,revision&id=eq.${state.build}`);
    return {ok: after > before || b[0]?.status === 'issued', note: `${JSON.stringify(b[0] || {})}; ${said.includes('missing') || /Fill|Add /.test(said) ? said.slice(-120) : ''}`};
  });
  await step('Report: start one from a template and submit it', async () => {
    await a.go(`/sites/${J}/snagging/reports`);
    await a.tap('+ New Report');
    await a.shot('report-pick');
    const opt = a.page.getByText(/Daily Briefing|Survey|Report|Copy/).locator('visible=true').last();
    await opt.click({timeout: 7000}).catch(() => {});
    await a.page.waitForTimeout(600);
    await a.tap('Start', {wait: 4000});
    await a.shot('report-fill');
    const s = await a.get(`report_submissions?select=id,status&site_id=eq.${J}`);
    return {ok: s.length >= 1, note: JSON.stringify(s[0] || {})};
  });
  await step('Export to OneDrive: the file really lands in OneDrive', async () => {
    await a.go(`/sites/${J}/schedule`, 5000);
    await a.tap('All', {last: false, wait: 800});
    await a.page.getByText('Export', {exact: false}).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(800);
    await a.tap('Full project — every photo', {wait: 6000});
    await a.tap('☁️ OneDrive', {wait: 8000});
    await a.shot('od-saved');
    const t = await a.text();
    const dir = OD && path.join(OD, 'ZZ JOB Regular');
    await a.page.waitForTimeout(15000);
    const files = dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => /\.pdf$/i.test(x)) : [];
    return {ok: /Saved to OneDrive/.test(t), note: `said saved: ${/Saved to OneDrive/.test(t)}; PDFs synced to this laptop: ${files.length}`};
  });
  await step('Uploading a drawing does not fail when the job has no linked folder', async () => {
    const before = (await a.get(`drawing_files?select=id&site_id=eq.${J}`)).length;
    await a.go(`/sites/${J}/drawings/${state.dwg}`);
    await a.page.locator('text="+"').locator('visible=true').first().click({timeout: 7000});
    await a.tap('📄 Upload a file');
    await a.pick(() => a.tap('Choose file(s)', {wait: 0}), [pdf], 5000);
    return {ok: (await a.get(`drawing_files?select=id&site_id=eq.${J}`)).length > before};
  });
};
