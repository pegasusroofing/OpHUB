// Second go at the steps whose controls differ on screen, and how a subcontractor lands.
const fs = require('fs'), path = require('path');
module.exports = async ({as, step, state, keep, samples}) => {
  const a = await as('admin'), o = await as('op'), s = await as('sub');
  const J = state.regular, R = state.repair, C = state.mc, photo = path.join(samples, 'site-photo.jpg');
  const anyPhoto = async (p, press) => {
    const [fc] = await Promise.all([p.page.waitForEvent('filechooser', {timeout: 12000}), (async () => {
      await press(); await p.page.waitForTimeout(700);
      const lib = p.page.getByText(/choose from|library/i).locator('visible=true').last();
      if (await lib.isVisible().catch(() => false)) await lib.click();
    })()]);
    await fc.setFiles([photo]); await p.page.waitForTimeout(3000);
  };
  await step('Subcontractor: where they land, step by step', async () => {
    const seen = [];
    s.page.on('framenavigated', (f) => { if (f === s.page.mainFrame()) seen.push(f.url().replace('http://localhost:8081', '').replace(C, 'C').slice(0, 60)); });
    await s.go(`/sites/${C}`, 7000);
    await s.shot('sub-land');
    return {ok: s.page.url().includes('/subcontractors/'), note: `${seen.join(' → ')} | ${(await s.text()).replace(/\s+/g, ' ').slice(0, 120)}`};
  }, 'sub');
  await step('Variation: open it, then approve', async () => {
    await a.go(`/sites/${J}/snagging/variations`);
    await a.page.getByText('ZZ extra lead to chimney').locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(1000);
    await a.shot('var-open');
    await a.page.getByText(/Approve/i).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(1200);
    const y = a.page.getByText(/^(Yes|Approve|Confirm)/).locator('visible=true').last();
    if (await y.isVisible().catch(() => false)) await y.click();
    await a.page.waitForTimeout(2500);
    const v = await a.get(`variations?select=approval_status&id=eq.${state.variation}`);
    return {ok: /approv/.test(v[0]?.approval_status || ''), note: v[0]?.approval_status};
  });
  await step('PPE: operative requests gloves, manager sees it', async () => {
    await o.go(`/sites/${J}/ppe`, 5000);
    await o.tap('+ Request PPE');
    await o.tap('Gloves');
    await o.tap('Submit Request', {wait: 3000});
    const p = await a.get(`ppe_requests?select=item_name,status&site_id=eq.${J}`);
    return {ok: p.length >= 1, note: JSON.stringify(p[0] || {})};
  }, 'op');
  await step('Plant: add an item with its photo', async () => {
    await a.go(`/sites/${J}/plant`);
    await a.tap('+ Add Plant Item');
    await a.fill('Item name, e.g. Genie GS-1930 MEWP', 'ZZ Scissor lift');
    await anyPhoto(a, () => a.page.getByText(/Choose Photo/i).locator('visible=true').first().click({timeout: 7000}));
    await a.tap('Save Item', {wait: 4000});
    const p = await a.get('plant_items?select=name,current_site_id,photo_path&name=eq.ZZ%20Scissor%20lift');
    return {ok: p.length >= 1 && !!p[0].photo_path, note: JSON.stringify(p[0] || {}).slice(0, 110)};
  });
  await step('Repair: add a job', async () => {
    await a.go(`/sites/${R}/repairs`);
    await a.tap('+ Add Job');
    await a.fill('Address', '10 Repair Lane');
    await a.fill('Description of call out', 'ZZ leak over bathroom');
    await a.tap('Add Job', {wait: 3500});
    const r = await a.get(`repair_jobs?select=id,status&site_id=eq.${R}`);
    state.repairJob = r[0]?.id; keep();
    return {ok: r.length === 1, note: r[0]?.status};
  });
  const status = async () => (await a.get(`repair_jobs?select=status&id=eq.${state.repairJob}`))[0]?.status;
  await step('Repair: stages from survey to closed', async () => {
    const seen = [];
    await a.go(`/sites/${R}/repairs/job/${state.repairJob}`);
    await a.shot('rep-job');
    for (let round = 0; round < 8; round++) {
      let hit = null;
      for (const label of [/Mark Survey as Completed/, /Self-Authorise/, /✅ Approve/, /Mark Works as Completed/, /Sign Off & Close Job/]) {
        const el = a.page.getByText(label).locator('visible=true').first();
        if (await el.isVisible().catch(() => false)) { hit = label; await el.click(); break; }
      }
      if (!hit) break;
      await a.page.waitForTimeout(1500);
      const y = a.page.getByText(/^(Yes|Confirm|OK|Approve|Close Job)$/).locator('visible=true').last();
      if (await y.isVisible().catch(() => false)) await y.click();
      await a.page.waitForTimeout(2500);
      seen.push(`${hit.source.replace(/✅ /, '')}→${await status()}`);
      await a.shot(`rep-${round}`);
    }
    return {ok: seen.length >= 1, note: seen.join(' | ').slice(0, 280)};
  });
  await step('Repair: add a photo to the job', async () => {
    await a.go(`/sites/${R}/repairs/job/${state.repairJob}`);
    await a.shot('rep-photo');
    await anyPhoto(a, () => a.page.getByText(/photo/i).locator('visible=true').first().click({timeout: 7000}));
    await a.page.waitForTimeout(3000);
    const p = await a.get(`repair_job_photos?select=id&repair_job_id=eq.${state.repairJob}`);
    return {ok: p.length >= 1, note: `${p.length}`};
  });
  await step('Permit: issue a hot works permit to the subcontractor', async () => {
    await a.go(`/sites/${C}/mc/permits`);
    await a.tap('+ Issue Permit');
    await a.page.getByText(/Hot Works/).locator('visible=true').first().click();
    await a.page.waitForTimeout(500);
    await a.shot('permit-form');
    await a.page.getByText('Issue Permit', {exact: true}).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(3000);
    await a.shot('permit-done');
    const p = await a.get(`permits?select=id,status,permit_type&site_id=eq.${C}`);
    return {ok: p.length >= 1, note: JSON.stringify(p[0] || {}).slice(0, 110) || (await a.text()).slice(0, 100)};
  });
  await step('Client: sees the job, Schedule of Works, no edit buttons', async () => {
    await a.go(`/sites/${J}/admin`);
    await a.tap('👥 Team — operatives, site managers & clients');
    await a.tap('Assign Clients');
    await a.tap('Assign', {wait: 2000});
    const c = await as('client');
    await c.go(`/sites/${J}/schedule`, 6000);
    await c.shot('client-sow');
    const t = await c.text();
    return {ok: t.includes('Strip old roof') && !t.includes('+ ADD TASK'), note: t.includes('Strip old roof') ? 'sees tasks' : 'no tasks shown'};
  }, 'client');
  await step('Client: Finance and prices are refused', async () => {
    const c = await as('client');
    const inv = await c.get(`fin_invoices?select=id&limit=1`);
    await c.go(`/sites/${J}/price`, 5000);
    return {ok: inv.length === 0 && !c.page.url().includes('/price'), note: c.page.url().split('8081')[1]?.replace(J, 'J')};
  }, 'client');
  await step('Site manager: can open the job, schedule and add a snag', async () => {
    const m = await as('sm');
    await m.go(`/sites/${J}/snagging/list`, 6000);
    await m.fill('Issue', 'ZZ site manager snag');
    await m.fill('Location', 'Ridge');
    await m.tap('Add Snag', {wait: 4000});
    const n = await a.get(`snags?select=title&site_id=eq.${J}`);
    return {ok: n.some((x) => x.title === 'ZZ site manager snag'), note: `${n.length} snags`};
  }, 'sm');
  await step('Driver: their day opens; no project pages', async () => {
    const d = await as('driver');
    await d.go('/home', 6000);
    await d.shot('driver-home');
    await d.go(`/sites/${J}/price`, 5000);
    return {ok: !d.page.url().includes('/price'), note: d.page.url().split('8081')[1]?.replace(J, 'J')};
  }, 'driver');
};
