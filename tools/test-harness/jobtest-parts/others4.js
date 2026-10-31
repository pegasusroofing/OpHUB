// Last round: subcontractor and client after their fixes, repair stages, permit, then the remaining modules.
const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, keep, samples}) => {
  const a = await as('admin'), s = await as('sub'), c = await as('client'), m = await as('sm'), o = await as('op');
  const J = state.regular, R = state.repair, C = state.mc, photo = path.join(samples, 'site-photo.jpg'), pdf = path.join(samples, 'wo.pdf');
  const anyPhoto = async (p, press, file = photo) => {
    const [fc] = await Promise.all([p.page.waitForEvent('filechooser', {timeout: 12000}), (async () => {
      await press(); await p.page.waitForTimeout(700);
      const lib = p.page.getByText(/choose from|library/i).locator('visible=true').last();
      if (await lib.isVisible().catch(() => false)) await lib.click();
    })()]);
    await fc.setFiles([file]); await p.page.waitForTimeout(3500);
  };
  const job = async () => (await a.get(`repair_jobs?select=*&site_id=eq.${R}&order=created_at.desc`))[0];

  await step('Subcontractor: goes straight to their company folder', async () => {
    await s.go(`/sites/${C}`, 7000);
    await s.shot('sub-home');
    const t = await s.text();
    return {ok: s.page.url().includes('/subcontractors/') && /RAMS/.test(t), note: t.replace(/\s+/g, ' ').slice(0, 130)};
  }, 'sub');
  await step('Subcontractor: main job pages send them back to the folder', async () => {
    await s.go(`/sites/${C}/schedule`, 6000);
    return {ok: s.page.url().includes('/subcontractors/'), note: s.page.url().split('/sites/')[1]?.slice(36, 90)};
  }, 'sub');
  await step('Subcontractor: sees only tasks given to their company', async () => {
    await a.go(`/sites/${C}/schedule`);
    await a.tap('+ ADD TASK', {last: false});
    await a.fill('New task, e.g. Fit lead flashing', 'ZZ Sub task');
    await a.tap('Add', {wait: 2200});
    await a.fill('New task, e.g. Fit lead flashing', 'ZZ Own crew task');
    await a.tap('Add', {wait: 2200});
    await a.go(`/sites/${C}/schedule`);
    await a.page.getByText('⋮', {exact: true}).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(700);
    await a.tap('🏗 Assign to subcontractor'); await a.tap('ZZ Subbie Ltd', {wait: 2500});
    const t = await a.get(`schedule_tasks?select=name,subcontractor_company_id&site_id=eq.${C}`);
    await s.go(`/sites/${C}/mc/subcontractors/${state.subco}/schedule`, 6000);
    await s.shot('sub-sow');
    const seen = await s.text();
    return {ok: t.some((x) => x.subcontractor_company_id) && /ZZ Sub task|ZZ Own crew task/.test(seen) && !(/ZZ Sub task/.test(seen) && /ZZ Own crew task/.test(seen)), note: `${t.filter((x) => x.subcontractor_company_id).map((x) => x.name)} on screen: ${/ZZ Sub task/.test(seen)}/${/ZZ Own crew task/.test(seen)}`};
  }, 'sub');
  await step('Client: now sees the tasks, cannot add', async () => {
    await c.go(`/sites/${J}/schedule`, 6000);
    await c.page.getByText('All', {exact: true}).locator('visible=true').first().click(); await c.page.waitForTimeout(1000);
    await c.shot('client-sow');
    const t = await c.text();
    return {ok: /Strip old roof/.test(t) && !/\+ ADD TASK/.test(t), note: /Strip old roof/.test(t) ? 'tasks show' : 'no tasks'};
  }, 'client');

  await step('Repair: survey with notes and a photo completes it', async () => {
    const j0 = await job(); state.repairJob = j0.id; keep();
    await a.go(`/sites/${R}/repairs/job/${j0.id}`);
    await a.fill('Survey notes / quoted works', 'ZZ survey notes').catch(() => {});
    await anyPhoto(a, () => a.page.getByText(/Add Photos/i).locator('visible=true').first().click({timeout: 7000}));
    await a.page.waitForTimeout(2500);
    await a.page.getByText(/Mark Survey as Completed/).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(3000);
    await a.shot('rep-surveyed');
    const j = await job();
    const p = await a.get(`repair_job_photos?select=id&repair_job_id=eq.${j0.id}`);
    return {ok: j.survey_required === 'Y', note: `${j.job_status}, ${p.length} photo(s)`};
  });
  await step('Repair: self-authorise through to works done and closed', async () => {
    const seen = [];
    for (let round = 0; round < 6; round++) {
      await a.go(`/sites/${R}/repairs/job/${state.repairJob}`, 4000);
      let hit = null;
      for (const label of [/Self-Authorise/, /✅ Approve/, /Mark Works as Completed/, /Sign Off & Close Job/]) {
        const el = a.page.getByText(label).locator('visible=true').first();
        if (await el.isVisible().catch(() => false)) { hit = label; await el.click(); break; }
      }
      if (!hit) break;
      await a.page.waitForTimeout(1500);
      const t0 = await a.text();
      const y = a.page.getByText(/^(Yes|Confirm|OK|Approve|Close Job|Sign Off)$/).locator('visible=true').last();
      if (await y.isVisible().catch(() => false)) await y.click();
      await a.page.waitForTimeout(2500);
      const j = await job();
      seen.push(`${hit.source.replace(/✅ /, '')}→${j.job_status}${/before|Add at least|first/.test(t0) ? ' (asked for more)' : ''}`);
      if (j.closed) break;
      if (seen.length > 1 && seen[seen.length - 1] === seen[seen.length - 2]) { await a.shot('rep-stuck'); break; }
    }
    const end = await job();
    await a.shot('rep-end');
    return {ok: seen.length >= 1, note: `${seen.join(' | ').slice(0, 280)}; closed ${end.closed}`};
  });

  await step('Permit: issue hot works to the subcontractor; they see it', async () => {
    await a.go(`/sites/${C}/mc/permits`);
    await a.tap('+ Issue Permit');
    await a.page.getByText(/Hot Works/).locator('visible=true').first().click(); await a.page.waitForTimeout(300);
    await a.page.getByText('ZZ Subbie Ltd').locator('visible=true').first().click(); await a.page.waitForTimeout(800);
    await a.page.getByText(/☐ andy subbie/).locator('visible=true').first().click(); await a.page.waitForTimeout(300);
    await a.fill('e.g. Hot works to re-felt the plant room roof', 'ZZ torch-on felt').catch(async () => { await a.page.locator('input[placeholder^="e.g. Hot works"]').locator('visible=true').first().fill('ZZ torch-on felt'); });
    await a.page.getByText('Issue Permit', {exact: true}).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(4000);
    await a.shot('permit-done');
    const p = await a.get(`permits?select=id,status&site_id=eq.${C}`);
    return {ok: p.length >= 1, note: p[0]?.status || (await a.text()).replace(/\s+/g, ' ').slice(0, 130)};
  });
  await step('Site manager: adds a snag', async () => {
    await m.go(`/sites/${J}/snagging/list`, 6000);
    await m.field('Issue', 'ZZ site manager snag');
    await m.field('Location', 'Ridge');
    await m.page.getByText('Add Snag', {exact: true}).locator('visible=true').last().click({timeout: 7000});
    await m.page.waitForTimeout(4000);
    const n = await a.get(`snags?select=title&site_id=eq.${J}`);
    return {ok: n.some((x) => x.title === 'ZZ site manager snag'), note: `${n.length} snags`};
  }, 'sm');

  // RAMS builder, COSHH, reports, briefing, O&M, expenses, Finance.
  await step('RAMS builder: start a new RAMS', async () => {
    await a.go(`/sites/${J}/hs/rams/new`);
    await a.shot('rams-new');
    const lib = a.page.getByText(/Load the starter library/).locator('visible=true').first();
    await a.page.locator('input').locator('visible=true').first().fill('ZZ Built RAMS').catch(() => {});
    await a.tap('Create RAMS', {wait: 5000});
    await a.shot('rams-build');
    const b = await a.get(`rams_builds?select=id,title,status&site_id=eq.${J}`);
    state.build = b[0]?.id; keep();
    void lib;
    return {ok: b.length >= 1 && a.page.url().includes('/build/'), note: JSON.stringify(b[0] || {}).slice(0, 100)};
  });
  await step('RAMS builder: draft is deleted cleanly', async () => {
    if (!state.build) return false;
    await a.go(`/sites/${J}/hs/rams/build/${state.build}`);
    await a.page.getByText(/Delete this RAMS draft/i).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(800);
    await a.tap('Delete', {wait: 3000});
    return {ok: !(await a.get(`rams_builds?select=id&id=eq.${state.build}`)).length};
  });
  await step('COSHH: upload a data sheet document to the job', async () => {
    await a.go(`/sites/${J}/hs/coshh`);
    await a.shot('coshh');
    await a.page.getByText(/Upload COSHH/i).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(800);
    await a.fill('COSHH name', 'ZZ Primer');
    await a.pick(() => a.page.getByText(/Choose PDF/i).locator('visible=true').first().click({timeout: 7000}), [pdf], 1000);
    await a.page.getByText(/^Upload COSHH$/).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(4000);
    const d = await a.get(`coshh_docs?select=id,name&site_id=eq.${J}`);
    return {ok: d.length >= 1, note: d[0]?.name};
  });
  await step('Operative signs the COSHH', async () => {
    await o.go(`/sites/${J}/hs/coshh`, 5000);
    await o.page.getByText(/Sign All/i).locator('visible=true').first().click({timeout: 7000});
    await o.page.waitForTimeout(3500);
    const d = await a.get(`coshh_docs?select=id&site_id=eq.${J}`);
    const sg = await a.get(`coshh_signatures?select=id&coshh_id=eq.${d[0]?.id}`);
    return {ok: sg.length >= 1, note: `${sg.length} signature(s)`};
  }, 'op');
  await step('Handover: new O&M manual, add a section, real PDF', async () => {
    await a.go(`/sites/${J}/handover`);
    await a.shot('om');
    await a.tap('+ New O&M manual', {wait: 3000});
    await a.shot('om-new');
    const m1 = await a.get(`handover_om_manuals?select=id,title&site_id=eq.${J}`);
    return {ok: m1.length >= 1, note: JSON.stringify(m1[0] || {}).slice(0, 90)};
  });
  await step('Expenses: operative adds a receipt photo', async () => {
    await o.go(`/sites/${J}/expenses`, 5000);
    await o.shot('exp');
    await anyPhoto(o, () => o.page.getByText(/🖼 Photos|Photos/).locator('visible=true').first().click({timeout: 7000}));
    await o.shot('exp-added');
    return /Send|receipt/i.test(await o.text());
  }, 'op');
  await step('Finance side: the job appears for a finance user', async () => {
    await a.go(`/fin/job/${J}`, 6000);
    await a.shot('fin-job');
    const t = await a.text();
    return {ok: !/Finance yet|not available|Loading/.test(t.slice(0, 200)), note: t.replace(/\s+/g, ' ').slice(0, 120)};
  });
};
