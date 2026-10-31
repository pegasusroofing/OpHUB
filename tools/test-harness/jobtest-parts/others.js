// The rest of the regular job, then a repair contract, a multi-site job and a main contractor job with a subcontractor.
const fs = require('fs'), path = require('path');
module.exports = async ({as, step, state, keep, samples}) => {
  const a = await as('admin'), o = await as('op'), J = state.regular, photo = path.join(samples, 'site-photo.jpg'), pdf = path.join(samples, 'wo.pdf');
  const anyPhoto = async (press) => {
    // Straight to the file picker on some pages, a menu first on others.
    const [fc] = await Promise.all([a.page.waitForEvent('filechooser', {timeout: 12000}), (async () => {
      await press(); await a.page.waitForTimeout(700);
      const lib = a.page.getByText(/choose from|library/i).locator('visible=true').last();
      if (await lib.isVisible().catch(() => false)) await lib.click();
    })()]);
    await fc.setFiles([photo]); await a.page.waitForTimeout(3000);
  };
  const newJob = async (key, name, tick) => {
    if (state[key]) return state[key];
    await a.go('/sites/new');
    await a.field('Site name *', name);
    await a.field('Address *', '2 Test Road, London');
    await a.fill('Start typing — clients from the Directory or past jobs', 'ZZ Test Client').catch(async () => { await a.field('Client *', 'ZZ Test Client'); });
    if (tick) await a.page.getByText(tick).locator('visible=true').first().click();
    await a.tap('Active');
    await a.tap('Choose a date');
    await a.page.getByText(String(new Date().getDate()), {exact: true}).locator('visible=true').last().click({timeout: 5000});
    await a.page.waitForTimeout(700);
    await a.tap('Create Project', {wait: 4000});
    state[key] = (await a.get(`sites?select=id&name=eq.${encodeURIComponent(name)}`))[0]?.id; keep();
    return state[key];
  };
  const assign = async (job, person, heading = 'Assign Operatives to Project') => {
    await a.go(`/sites/${job}/admin`);
    await a.tap('👥 Team — operatives, site managers & clients');
    await a.tap(heading);
    const row = a.page.getByText(person, {exact: true}).locator('visible=true').last().locator('xpath=ancestor::div[2]');
    await row.getByText('Assign', {exact: true}).click({timeout: 7000});
    await a.page.waitForTimeout(2000);
  };

  await step('Variation: raise with a photo', async () => {
    await a.go(`/sites/${J}/snagging/variations`);
    await anyPhoto(() => a.page.getByText(/Tap to add a photo/).locator('visible=true').first().click({timeout: 7000}));
    await a.fill("What's changed and why...", 'ZZ extra lead to chimney');
    await a.fill('e.g. 850', '850');
    await a.tap('Submit Variation', {wait: 5000});
    const v = await a.get(`variations?select=id,status,approval_status,cost_impact,photo_path&site_id=eq.${J}`);
    state.variation = v[0]?.id; keep();
    return {ok: v.length === 1 && !!v[0].photo_path, note: JSON.stringify(v[0] || {}).slice(0, 120)};
  });
  await step('Variation: approve it', async () => {
    await a.go(`/sites/${J}/snagging/variations`);
    await a.shot('var-list');
    await a.page.getByText(/Approve/i).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(1200);
    const y = a.page.getByText(/^(Yes|Approve|Confirm)/).locator('visible=true').last();
    if (await y.isVisible().catch(() => false)) await y.click();
    await a.page.waitForTimeout(2500);
    const v = await a.get(`variations?select=approval_status&id=eq.${state.variation}`);
    return {ok: /approv/.test(v[0]?.approval_status || ''), note: v[0]?.approval_status};
  });
  await step('Operative checks in, and the record has the place and phone', async () => {
    await o.ctx.grantPermissions(['geolocation']);
    await o.ctx.setGeolocation({latitude: 51.5, longitude: -0.14});
    await o.go(`/sites/${J}/checkin`, 5000);
    const btn = o.page.getByText('Check In', {exact: true}).locator('visible=true');
    await btn.first().click({timeout: 7000});
    await o.page.waitForTimeout(4000);
    await o.shot('op-checked');
    const c = await a.get(`checkins?select=type,device_id,lat&site_id=eq.${J}&order=ts.desc&limit=1`);
    return {ok: c[0]?.type === 'in' && !!c[0]?.device_id, note: JSON.stringify(c[0] || {}).slice(0, 110)};
  }, 'op');
  await step('Operative checks out', async () => {
    await o.page.getByText(/Check Out/i).locator('visible=true').first().click({timeout: 7000});
    await o.page.waitForTimeout(1500);
    const y = o.page.getByText(/^(Yes|Check Out)/).locator('visible=true').last();
    if (await y.isVisible().catch(() => false)) await y.click();
    await o.page.waitForTimeout(3000);
    const c = await a.get(`checkins?select=type&site_id=eq.${J}&order=ts.desc&limit=1`);
    return {ok: c[0]?.type === 'out', note: c[0]?.type};
  }, 'op');
  await step('PPE: operative requests gloves, manager sees it', async () => {
    await o.go(`/sites/${J}/ppe`, 5000);
    await o.tap('Gloves');
    await o.tap('Submit Request', {wait: 3000});
    const p = await a.get(`ppe_requests?select=item_name,status&site_id=eq.${J}`);
    return {ok: p.length >= 1, note: JSON.stringify(p[0] || {})};
  }, 'op');
  await step('Plant: add an item to the job', async () => {
    await a.go(`/sites/${J}/plant`);
    await a.tap('+ Add Plant Item');
    await a.fill('Item name, e.g. Genie GS-1930 MEWP', 'ZZ Scissor lift');
    await a.shot('plant-form');
    await a.page.getByText(/^(Add|Save|Add Item|Add Plant)/i).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(3000);
    const p = await a.get('plant_items?select=name,current_site_id&name=eq.ZZ%20Scissor%20lift');
    return {ok: p.length >= 1, note: JSON.stringify(p[0] || {}).slice(0, 110)};
  });

  // Repair contract.
  const R = await newJob('repair', 'ZZ JOB Repair', /Repair \/ maintenance contract/);
  await step('Repair contract: job created as a repair contract', async () => {
    const s = (await a.get(`sites?select=repair_contract&id=eq.${R}`))[0];
    return {ok: s?.repair_contract === true};
  });
  const repairs = () => a.get(`repair_jobs?select=id,status,job_number,address&site_id=eq.${R}`);
  await step('Repair: add a job', async () => {
    await a.go(`/sites/${R}/repairs`);
    await a.tap('+ Add Job');
    await a.shot('rep-form');
    await a.page.locator('input,textarea').locator('visible=true').first().fill('10 Repair Lane').catch(() => {});
    await a.fill('Description of call out', 'ZZ leak over bathroom').catch(async () => { await a.field('Description of call out', 'ZZ leak over bathroom'); });
    await a.tap('Add Job', {wait: 3500});
    const r = await repairs();
    state.repairJob = r[0]?.id; keep();
    return {ok: r.length === 1, note: JSON.stringify(r[0] || {}).slice(0, 110)};
  });
  await step('Repair: work through the job stages', async () => {
    if (!state.repairJob) return false;
    const seen = [];
    await a.go(`/sites/${R}/repairs/job/${state.repairJob}`);
    await a.shot('rep-job');
    for (const label of [/Self-Authorise/, /Mark Survey as Completed/, /Approve$/, /Mark Works as Completed/, /Sign Off & Close Job/]) {
      const el = a.page.getByText(label).locator('visible=true').first();
      if (await el.isVisible().catch(() => false)) {
        await el.click(); await a.page.waitForTimeout(1500);
        const y = a.page.getByText(/^(Yes|Confirm|OK)$/).locator('visible=true').last();
        if (await y.isVisible().catch(() => false)) await y.click();
        await a.page.waitForTimeout(2000);
        seen.push(`${label.source}→${(await repairs())[0]?.status}`);
      }
    }
    await a.shot('rep-end');
    return {ok: seen.length > 0, note: seen.join(' | ').slice(0, 230)};
  });
  await step('Repair: add a photo to the job', async () => {
    await a.go(`/sites/${R}/repairs/job/${state.repairJob}`);
    await anyPhoto(() => a.page.getByText(/photo/i).locator('visible=true').first().click({timeout: 7000}));
    await a.page.waitForTimeout(2000);
    const p = await a.get(`repair_job_photos?select=id&repair_job_id=eq.${state.repairJob}`);
    return {ok: p.length >= 1, note: `${p.length}`};
  });
  await step('Repair: Excel export is real', async () => {
    await a.go(`/sites/${R}/repairs`);
    await a.page.getByText(/Export Excel/).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(2000);
    const file = await a.saved(() => a.tap('⬇️ Download'));
    return {ok: fs.statSync(file).size > 1000, note: path.basename(file)};
  });

  // Multi-site.
  const M = await newJob('multi', 'ZZ JOB Multi', /Multi-site job/);
  await step('Multi-site: add two addresses', async () => {
    await a.go(`/sites/${M}/admin`);
    await a.tap('⚙ Site set up — name & address, main contractor, multi-site');
    await a.tap('Multi-Site');
    for (const n of ['Plot 1', 'Plot 2']) {
      await a.tap('+ Add Address');
      await a.fill('e.g. 12 High Street', n);
      await a.page.getByText(/^(Add Address|Save)/).locator('visible=true').last().click({timeout: 7000});
      await a.page.waitForTimeout(2200);
    }
    const r = await a.get(`site_sub_addresses?select=id,name&site_id=eq.${M}`);
    state.plots = r.map((x) => x.id); keep();
    return {ok: r.length === 2, note: r.map((x) => x.name).join(', ')};
  });
  await step('Multi-site: task linked to Plot 1, seen under that address', async () => {
    await a.go(`/sites/${M}/schedule`);
    await a.tap('+ ADD TASK', {last: false});
    await a.fill('New task, e.g. Fit lead flashing', 'ZZ Plot task');
    await a.page.getByText('Plot 1').locator('visible=true').last().click();
    await a.tap('Add', {wait: 2500});
    const t = await a.get(`schedule_tasks?select=id,sub_site_id&site_id=eq.${M}`);
    return {ok: t.length === 1 && t[0].sub_site_id === state.plots.find(Boolean) || !!t[0]?.sub_site_id, note: JSON.stringify(t[0] || {}).slice(0, 110)};
  });
  await step('Multi-site: operative checks in at Plot 1', async () => {
    await assign(M, 'andy op');
    await o.go(`/sites/${M}/checkin`, 5000);
    await o.shot('multi-checkin');
    await o.page.getByText('Plot 1').locator('visible=true').first().click({timeout: 7000});
    await o.page.waitForTimeout(2500);
    await o.shot('multi-plot');
    await o.page.getByText('Check In', {exact: true}).locator('visible=true').first().click({timeout: 7000});
    await o.page.waitForTimeout(4000);
    const c = await a.get(`checkins?select=type,sub_site_id&site_id=eq.${M}&order=ts.desc&limit=1`);
    return {ok: c[0]?.type === 'in' && !!c[0]?.sub_site_id, note: JSON.stringify(c[0] || {}).slice(0, 110)};
  }, 'op');

  // Main contractor, and the subcontractor's side.
  const C = await newJob('mc', 'ZZ JOB Main Contractor');
  const s = await as('sub');
  await step('Main contractor: switch on and open the tile', async () => {
    await a.go(`/sites/${C}/admin`);
    await a.tap('⚙ Site set up — name & address, main contractor, multi-site');
    await a.tap('Main Contractor');
    await a.page.getByText('Acting as a Main Contractor?').locator('visible=true').first().click();
    await a.page.waitForTimeout(2500);
    const f = (await a.get(`sites?select=acting_as_main_contractor&id=eq.${C}`))[0];
    await a.go(`/sites/${C}/mc`);
    await a.shot('mc');
    return {ok: f?.acting_as_main_contractor === true, note: (await a.text()).replace(/\s+/g, ' ').slice(90, 280)};
  });
  await step('Main contractor: add a subcontractor company', async () => {
    await a.go(`/sites/${C}/mc/subcontractors`);
    await a.tap('+ Add Subcontractor');
    await a.fill('e.g. Acme Scaffolding', 'ZZ Subbie Ltd');
    await a.tap('Add', {wait: 3000});
    const c = await a.get(`subcontractor_companies?select=id,name&site_id=eq.${C}`);
    state.subco = c[0]?.id; keep();
    return {ok: c.length === 1, note: c[0]?.name};
  });
  await step('Main contractor: subcontractor person attached to the company', async () => {
    await a.go(`/sites/${C}/admin`);
    await a.tap('👥 Team — operatives, site managers & clients');
    await a.tap('Assign Operatives to ZZ Subbie Ltd');
    await a.shot('mc-assign');
    const row = a.page.getByText('andy subbie', {exact: true}).locator('visible=true').last().locator('xpath=ancestor::div[2]');
    await row.getByText('Assign', {exact: true}).click({timeout: 7000});
    await a.page.waitForTimeout(2500);
    const so = await a.get(`subcontractor_operatives?select=id,is_admin,subcontractor_company_id&site_id=eq.${C}`);
    return {ok: so.length === 1, note: JSON.stringify(so[0] || {}).slice(0, 120)};
  });
  await step('Subcontractor: logs in and lands on their company folder', async () => {
    await s.go(`/sites/${C}`, 6000);
    await s.shot('sub-home');
    const t = await s.text();
    return {ok: /ZZ Subbie/.test(t) && s.page.url().includes('/subcontractors/'), note: s.page.url().split('/sites/')[1]?.slice(36, 110)};
  }, 'sub');
  await step('Subcontractor: cannot open the main job pages', async () => {
    await s.go(`/sites/${C}/schedule`, 5000);
    return {ok: s.page.url().includes('/mc/'), note: s.page.url().split('/sites/')[1]?.slice(36, 90)};
  }, 'sub');
  await step('Main contractor: issue RAMS to the subcontractor folder', async () => {
    await a.go(`/sites/${C}/mc/subcontractors/${state.subco}/docs?kind=rams`);
    await a.shot('mc-rams');
    await a.page.getByText(/Upload RAMS/i).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(800);
    await a.fill('RAMS name', 'ZZ Sub RAMS');
    await a.pick(() => a.page.getByText(/Choose PDF/i).locator('visible=true').first().click({timeout: 7000}), [pdf], 1000);
    await a.page.getByText(/^Upload RAMS$/).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(4000);
    const r = await a.get(`rams_docs?select=id,subcontractor_company_id&site_id=eq.${C}`);
    return {ok: r.length === 1 && r[0].subcontractor_company_id === state.subco, note: `${r.length}`};
  });
  await step('Subcontractor: sees the RAMS and signs it', async () => {
    await s.go('/signature', 5000);
    await s.page.mouse.move(80, 300); await s.page.mouse.down(); for (let i = 0; i < 12; i++) await s.page.mouse.move(80 + i * 18, 300 + (i % 2) * 30); await s.page.mouse.up();
    await s.page.waitForTimeout(500);
    await s.tap('Save Signature', {wait: 3500});
    await s.go(`/sites/${C}/mc/subcontractors/${state.subco}/docs?kind=rams`, 5000);
    await s.shot('sub-rams');
    await s.page.getByText(/Sign All/i).locator('visible=true').first().click({timeout: 7000});
    await s.page.waitForTimeout(3500);
    const r = await a.get(`rams_docs?select=id&site_id=eq.${C}`);
    const sig = await a.get(`rams_signatures?select=id&rams_id=eq.${r[0]?.id}`);
    return {ok: sig.length >= 1, note: `${sig.length} signature(s)`};
  }, 'sub');
  await step('Main contractor: permit to work issued to the subcontractor', async () => {
    await a.go(`/sites/${C}/mc/permits`);
    await a.tap('+ Issue Permit');
    await a.shot('permit-form');
    return (await a.text()).includes('Issue Permit');
  });
};
