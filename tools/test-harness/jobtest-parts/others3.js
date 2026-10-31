// Third go: the last steps, with the required fields filled, and the subcontractor and client traced.
const path = require('path');
module.exports = async ({as, step, state, keep, samples}) => {
  const a = await as('admin'), s = await as('sub'), c = await as('client'), m = await as('sm');
  const J = state.regular, R = state.repair, C = state.mc, photo = path.join(samples, 'site-photo.jpg');
  const anyPhoto = async (p, press) => {
    const [fc] = await Promise.all([p.page.waitForEvent('filechooser', {timeout: 12000}), (async () => {
      await press(); await p.page.waitForTimeout(700);
      const lib = p.page.getByText(/choose from|library/i).locator('visible=true').last();
      if (await lib.isVisible().catch(() => false)) await lib.click();
    })()]);
    await fc.setFiles([photo]); await p.page.waitForTimeout(3000);
  };
  const today = async (p, placeholder) => {
    await p.tap(placeholder);
    await p.page.getByText(String(new Date().getDate()), {exact: true}).locator('visible=true').last().click({timeout: 5000});
    await p.page.waitForTimeout(700);
  };
  await step('Subcontractor: trace where they land', async () => {
    await s.page.goto(`http://localhost:8081/sites/${C}`);
    const trail = [];
    for (let i = 0; i < 10; i++) { await s.page.waitForTimeout(800); const t = await s.text(); trail.push(`${s.page.url().split('/sites')[1]?.replace(C, 'C').slice(0, 30)}:${(t.match(/couldn.t be found|is closed|isn.t available|Loading|don.t have access/) || [''])[0]}`); }
    await s.shot('sub-trace');
    const so = await s.get(`subcontractor_operatives?select=subcontractor_company_id,site_id&user_id=not.is.null&site_id=eq.${C}`);
    const site = await s.get(`sites?select=id,status,acting_as_main_contractor,mc_hidden_tiles&id=eq.${C}`);
    return {ok: s.page.url().includes('/subcontractors/'), note: `${[...new Set(trail)].join(' > ')} | sees own row: ${so.length} | site ${JSON.stringify(site[0] || {}).slice(0, 110)}`};
  }, 'sub');
  await step('Client: what the database lets them read on the schedule', async () => {
    const sec = await c.get(`schedule_sections?select=id,name,visibility_mode&site_id=eq.${J}`);
    const tk = await c.get(`schedule_tasks?select=id,name,section_id&site_id=eq.${J}`);
    return {ok: sec.length > 0 && tk.length > 0, note: `sections ${sec.length}, tasks ${tk.length}`};
  }, 'client');
  await step('Plant: add an item with photo and inspection date', async () => {
    await a.go(`/sites/${J}/plant`);
    await a.tap('+ Add Plant Item');
    await a.fill('Item name, e.g. Genie GS-1930 MEWP', 'ZZ Scissor lift');
    await today(a, 'Next inspection due');
    await anyPhoto(a, () => a.page.getByText(/Choose Photo/i).locator('visible=true').first().click({timeout: 7000}));
    await a.tap('Save Item', {wait: 4000});
    const p = await a.get('plant_items?select=name,current_site_id,photo_path&name=eq.ZZ%20Scissor%20lift');
    return {ok: p.length >= 1 && !!p[0].photo_path, note: JSON.stringify(p[0] || {}).slice(0, 100)};
  });
  const job = async () => (await a.get(`repair_jobs?select=*&site_id=eq.${R}&order=created_at.desc`))[0];
  await step('Repair: stages from survey to closed', async () => {
    const seen = []; const j0 = await job(); state.repairJob = j0?.id; keep();
    await a.go(`/sites/${R}/repairs/job/${j0.id}`);
    await a.shot('rep-job');
    for (let round = 0; round < 8; round++) {
      let hit = null;
      for (const label of [/Mark Survey as Completed/, /Self-Authorise/, /✅ Approve/, /Mark Works as Completed/, /Sign Off & Close Job/]) {
        const el = a.page.getByText(label).locator('visible=true').first();
        if (await el.isVisible().catch(() => false)) { hit = label; await el.click(); break; }
      }
      if (!hit) break;
      await a.page.waitForTimeout(1500);
      await a.shot(`rep-${round}`);
      const y = a.page.getByText(/^(Yes|Confirm|OK|Approve|Close Job|Sign Off)$/).locator('visible=true').last();
      if (await y.isVisible().catch(() => false)) await y.click();
      await a.page.waitForTimeout(2500);
      seen.push(`${hit.source.replace(/✅ /, '')}→${(await job()).job_status}`);
    }
    const end = await job();
    await a.shot('rep-end');
    return {ok: seen.length >= 1, note: `${seen.join(' | ').slice(0, 240)}; closed ${end.closed}`};
  });
  await step('Repair: add a photo to the job', async () => {
    await a.go(`/sites/${R}/repairs/job/${state.repairJob}`);
    await a.shot('rep-photo');
    const before = (await a.text()).match(/[^\n]*photo[^\n]*/ig);
    await anyPhoto(a, () => a.page.getByText(/add.*photo|photo.*add|📷/i).locator('visible=true').first().click({timeout: 7000}));
    await a.page.waitForTimeout(3000);
    const p = await a.get(`repair_job_photos?select=id&job_id=eq.${state.repairJob}`);
    return {ok: p.length >= 1, note: `${p.length}; ${(before || []).join('/').slice(0, 80)}`};
  });
  await step('Project manager adopts a signature, then issues a hot works permit', async () => {
    await a.go('/signature', 4500);
    await a.page.mouse.move(80, 300); await a.page.mouse.down(); for (let i = 0; i < 12; i++) await a.page.mouse.move(80 + i * 18, 300 + (i % 2) * 30); await a.page.mouse.up();
    await a.page.waitForTimeout(500);
    await a.tap('Save Signature', {wait: 3500});
    await a.go(`/sites/${C}/mc/permits`);
    await a.tap('+ Issue Permit');
    await a.page.getByText(/Hot Works/).locator('visible=true').first().click();
    await a.page.waitForTimeout(500);
    await a.shot('permit-form');
    await a.page.getByText('Issue Permit', {exact: true}).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(3000);
    await a.shot('permit-done');
    const p = await a.get(`permits?select=*&site_id=eq.${C}`);
    return {ok: p.length >= 1, note: p.length ? p[0].status : (await a.text()).replace(/\s+/g, ' ').slice(0, 160)};
  });
  await step('Site manager: adds a snag', async () => {
    await m.go(`/sites/${J}/snagging/list`, 6000);
    await m.fill('Issue', 'ZZ site manager snag');
    await m.fill('Location', 'Ridge');
    await m.shot('sm-snag');
    await m.page.getByText('Add Snag', {exact: true}).locator('visible=true').last().click({timeout: 7000, force: true});
    await m.page.waitForTimeout(4000);
    const n = await a.get(`snags?select=title&site_id=eq.${J}`);
    return {ok: n.some((x) => x.title === 'ZZ site manager snag'), note: `${n.length} snags`};
  }, 'sm');
};
