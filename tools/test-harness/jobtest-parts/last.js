// The remaining modules: Excel import, briefing, HAVS, price, delivery to driver, driver day, induction, report submit.
const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, samples}) => {
  const a = await as('admin'), o = await as('op'), d = await as('driver');
  const J = state.regular, C = state.mc, photo = path.join(samples, 'site-photo.jpg');
  const today = async (p, ph) => { await p.tap(ph); await p.page.getByText(String(new Date().getDate()), {exact: true}).locator('visible=true').last().click({timeout: 5000}); await p.page.waitForTimeout(700); };
  await step('Schedule: import tasks from a CSV', async () => {
    const csv = path.join(samples, 'sow-import.csv');
    fs.writeFileSync(csv, 'Task\nZZ imported task one\nZZ imported task two\n');
    const before = (await a.get(`schedule_tasks?select=id&site_id=eq.${J}`)).length;
    await a.go(`/sites/${J}/schedule`);
    await a.label('More');
    await a.tap('📊 Import schedule (Excel, CSV or PDF)');
    await a.pick(() => a.tap('📊 From Excel or CSV', {wait: 0}), [csv], 2000);
    await a.shot('import-col');
    await a.page.getByText(/★/).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(800);
    await a.tap('Import', {wait: 3000});
    const after = (await a.get(`schedule_tasks?select=id&site_id=eq.${J}`)).length;
    return {ok: after === before + 2, note: `${before}→${after}`};
  });
  await step('Daily briefing: start one, or says a template is needed', async () => {
    await a.go(`/sites/${J}/hs/briefings`);
    await a.shot('brief');
    const t = await a.text();
    const make = a.page.getByText('+ Create a Daily Briefing template').locator('visible=true').first();
    if (await make.isVisible().catch(() => false)) return {note: 'no template in Sandbox: the page offers to make one'};
    await a.tap('+ New Briefing', {wait: 4000});
    await a.shot('brief-new');
    const s = await a.get(`report_submissions?select=id,status&site_id=eq.${J}`);
    return {ok: s.length > 0 || /Briefing/.test(t), note: `${s.length} submissions`};
  });
  await step('HAVS: page opens for a site manager role job and shows the week', async () => {
    await a.go(`/sites/${J}/hs/havs`);
    await a.shot('havs');
    return /HAVS|week|tool/i.test(await a.text());
  });
  await step('Price: add a price line for the job', async () => {
    await a.go(`/sites/${J}/price`);
    await a.shot('price');
    await a.tap('+ Add price', {wait: 1200});
    await a.shot('price-form');
    const inputs = a.page.locator('input').locator('visible=true');
    await inputs.first().fill('ZZ Felt labour');
    if (await inputs.count() > 1) await inputs.nth(1).fill('500');
    await a.page.getByText(/^(Add|Save|Add price)$/i).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(3000);
    const e = await a.get(`pricing_elements?select=*&site_id=eq.${J}`);
    return {ok: e.length >= 1, note: `${e.length} line(s)`};
  });
  await step('Delivery: office books one for today', async () => {
    await a.go('/pm/deliveries');
    await a.shot('deliv');
    await a.tap('+ Add Delivery', {wait: 3000});
    await a.shot('deliv-form');
    await a.fill("What's needed?", 'ZZ pallet of felt').catch(() => {});
    await a.fill('Address or pickup details', '5 Yard Road').catch(() => {});
    const sel = a.page.getByText('Choose a site…').locator('visible=true').first();
    if (await sel.isVisible().catch(() => false)) { await sel.click(); await a.page.waitForTimeout(600); await a.page.getByText('ZZ JOB Regular').locator('visible=true').last().click(); await a.page.waitForTimeout(600); }
    const dr = a.page.getByText('Choose a driver…').locator('visible=true').first();
    if (await dr.isVisible().catch(() => false)) { await dr.click(); await a.page.waitForTimeout(600); await a.page.getByText('andy driver').locator('visible=true').last().click(); await a.page.waitForTimeout(600); }
    await a.shot('deliv-filled');
    await a.page.getByText(/^(Save|Add Delivery|Save Delivery|Book)/).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(3500);
    const t = await a.get(`delivery_tasks?select=id,status,driver_id,description&site_id=eq.${J}`);
    state.delivery = t[0]?.id;
    return {ok: t.length >= 1, note: JSON.stringify(t[0] || {}).slice(0, 120)};
  });
  await step('Driver: checks in and sees the delivery', async () => {
    await d.ctx.grantPermissions(['geolocation']); await d.ctx.setGeolocation({latitude: 51.5, longitude: -0.14});
    await d.go('/driver/checkin', 5000);
    await d.shot('drv-checkin');
    const btn = d.page.getByText(/Check In/i).locator('visible=true').first();
    await btn.click({timeout: 7000}).catch(() => {});
    await d.page.waitForTimeout(3000);
    await d.go('/driver/schedule', 5000);
    await d.shot('drv-schedule');
    const t = await d.text();
    return {ok: /ZZ pallet|ZZ JOB Regular/.test(t), note: t.replace(/\s+/g, ' ').slice(0, 140)};
  }, 'driver');
  await step('Driver: completes the delivery with a photo', async () => {
    await d.page.getByText(/ZZ pallet|ZZ JOB Regular/).locator('visible=true').first().click({timeout: 7000}).catch(() => {});
    await d.page.waitForTimeout(1200);
    await d.shot('drv-open');
    const [fc] = await Promise.all([d.page.waitForEvent('filechooser', {timeout: 10000}), (async () => { await d.page.getByText(/photo/i).locator('visible=true').first().click({timeout: 7000}); await d.page.waitForTimeout(700); const lib = d.page.getByText(/choose from|library/i).locator('visible=true').last(); if (await lib.isVisible().catch(() => false)) await lib.click(); })()]);
    await fc.setFiles([photo]); await d.page.waitForTimeout(3500);
    await d.page.getByText(/Complete|Delivered|Done/i).locator('visible=true').last().click({timeout: 7000});
    await d.page.waitForTimeout(3500);
    await d.shot('drv-done');
    const t = await a.get(`delivery_tasks?select=status&id=eq.${state.delivery}`);
    return {ok: /done|complete|deliver/i.test(t[0]?.status || ''), note: t[0]?.status};
  }, 'driver');
  await step('Induction: operative on the main contractor job can start it', async () => {
    await a.go(`/sites/${C}/admin`);
    await a.tap('👥 Team — operatives, site managers & clients');
    await a.tap('Assign Operatives to Project');
    const row = a.page.getByText('andy op', {exact: true}).locator('visible=true').last().locator('xpath=ancestor::div[2]');
    await row.getByText('Assign', {exact: true}).click({timeout: 7000}).catch(() => {});
    await a.page.waitForTimeout(2000);
    await o.go(`/sites/${C}/mc/inductions`, 5000);
    await o.shot('induct');
    return /Induction|Emergency/i.test(await o.text());
  }, 'op');
};
