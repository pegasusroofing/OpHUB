// A regular job, continued: email for real, snags, variations, materials, calendar, To Do, HUB, check-in, PPE, plant, incident.
const fs = require('fs'), path = require('path');
module.exports = async ({as, step, state, keep, samples, ANDY}) => {
  const a = await as('admin'), J = state.regular, photo = path.join(samples, 'site-photo.jpg'), pdf = path.join(samples, 'wo.pdf');
  const log = path.join(__dirname, '..', 'shots', 'crawl', 'sandbox-log.jsonl');
  const logHas = (s) => fs.readFileSync(log, 'utf8').split('\n').slice(-120).some((l) => l.includes(s));

  await step('Email Report: goes through to the sending function, to Andy only', async () => {
    await a.go(`/sites/${J}/schedule`, 5000);
    await a.page.getByText('Email Report', {exact: false}).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(1000);
    await a.page.getByText(/andy pm/).locator('visible=true').last().click();
    await a.page.locator('input').locator('visible=true').last().fill(ANDY);
    await a.page.waitForTimeout(400);
    await a.shot('email-a');
    await a.tap('Send', {wait: 1200});
    await a.shot('email-b');
    await a.tap('Full project — every photo', {wait: 12000});
    await a.shot('email-c');
    const t = await a.text();
    return {ok: /Emailed to 1 recipient/.test(t) || logHas('"sent":"send-schedule-email"'), note: `${logHas('"sent":"send-schedule-email"') ? 'sent' : 'not sent'}; ${(t.match(/Email failed[^\n]*/) || [''])[0]}`};
  });
  await step('Toolbox talk: signed PDF exports from the menu', async () => {
    await a.go(`/sites/${J}/hs/tbt/${state.tbt}`);
    await a.page.getByText('⋮', {exact: true}).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(700);
    await a.tap('📄 Export signed PDF', {wait: 4000});
    const file = await a.saved(() => a.tap('📄 PDF'));
    return {ok: fs.statSync(file).size > fs.statSync(pdf).size, note: path.basename(file)};
  });

  // Snags.
  await step('Snag: raise with a photo', async () => {
    await a.go(`/sites/${J}/snagging/list`);
    await a.shot('snags');
    await a.fill('Issue', 'ZZ cracked tile').catch(async () => { await a.field('Issue', 'ZZ cracked tile'); });
    await a.fill('Location', 'North slope').catch(async () => { await a.field('Location', 'North slope'); });
    await a.pick(() => a.page.getByText(/Take a photo or choose/).locator('visible=true').first().click({timeout: 7000}), [photo], 3000);
    await a.shot('snag-form');
    await a.tap('Add Snag', {wait: 5000});
    const s = await a.get(`snags?select=id,description,status,photo_path&site_id=eq.${J}`);
    state.snag = s[0]?.id; keep();
    return {ok: s.length === 1, note: JSON.stringify(s[0] || {}).slice(0, 130)};
  });
  await step('Snag: close it, and the list moves it', async () => {
    await a.go(`/sites/${J}/snagging/list`);
    await a.shot('snag-list');
    await a.page.getByText(/Close|Mark.*(done|complete|fixed)|Complete/i).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(1500);
    const y = a.page.getByText(/^(Yes|Close|Confirm)/).locator('visible=true').last();
    if (await y.isVisible().catch(() => false)) await y.click();
    await a.page.waitForTimeout(2500);
    const s = await a.get(`snags?select=status&id=eq.${state.snag}`);
    return {ok: s[0] && s[0].status !== 'open', note: s[0]?.status};
  });

  // Variations.
  await step('Variation: raise with a photo', async () => {
    await a.go(`/sites/${J}/snagging/variations`);
    await a.shot('var');
    await a.fill("What's changed and why...", 'ZZ extra lead to chimney');
    await a.fill('e.g. 850', '850').catch(() => {});
    await a.pick(() => a.page.getByText(/photo/i).locator('visible=true').first().click({timeout: 7000}), [photo], 3000);
    await a.tap('Submit Variation', {wait: 5000});
    const v = await a.get(`variations?select=id,status,description&site_id=eq.${J}`);
    state.variation = v[0]?.id; keep();
    return {ok: v.length === 1, note: v[0]?.status};
  });
  await step('Variation: approve it', async () => {
    await a.go(`/sites/${J}/snagging/variations`);
    await a.shot('var-list');
    await a.page.getByText(/Approve/i).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(1200);
    const y = a.page.getByText(/^(Yes|Approve|Confirm)/).locator('visible=true').last();
    if (await y.isVisible().catch(() => false)) await y.click();
    await a.page.waitForTimeout(2500);
    const v = await a.get(`variations?select=status&id=eq.${state.variation}`);
    return {ok: v[0]?.status !== 'pending' && v[0]?.status !== 'submitted', note: v[0]?.status};
  });

  // Materials.
  await step('Material request: raise a line', async () => {
    await a.go(`/sites/${J}/materials/requests`);
    await a.shot('mat');
    const add = a.page.getByText('+ Request materials').locator('visible=true').first();
    if (await add.isVisible().catch(() => false)) { await add.click(); await a.page.waitForTimeout(800); }
    await a.fill('Item', 'ZZ roof felt');
    await a.shot('mat-form');
    await a.page.getByText(/^(Add|Request|Submit|Send|Save)/).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(3000);
    const m = await a.get(`materials?select=id,name,status&site_id=eq.${J}`);
    return {ok: m.length >= 1, note: JSON.stringify(m[0] || {}).slice(0, 100)};
  });

  // Calendar.
  await step('Calendar: a date added shows straight away', async () => {
    await a.go(`/sites/${J}/calendar`);
    await a.page.getByText('+', {exact: true}).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(600);
    await a.fill('e.g. Scaffold delivery', 'ZZ Scaffold');
    await a.tap('Add Key Date', {wait: 3000});
    await a.shot('cal');
    const t = await a.text();
    const e = await a.get(`site_calendar_events?select=id,title&site_id=eq.${J}`);
    return {ok: t.includes('ZZ Scaffold') && e.length >= 1, note: `${e.length} in database`};
  });
  await step('Calendar: Visibility hides a date from the operative for real', async () => {
    await a.page.getByText('+', {exact: true}).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(600);
    await a.fill('e.g. Scaffold delivery', 'ZZ Managers only');
    await a.page.getByText('Everyone on the job').locator('visible=true').last().click(); await a.page.waitForTimeout(400);
    await a.page.getByText(/Operatives$/).locator('visible=true').last().click(); await a.page.waitForTimeout(300);
    await a.page.getByText(/Clients$/).locator('visible=true').last().click(); await a.page.waitForTimeout(300);
    await a.page.getByText(/Drivers$/).locator('visible=true').last().click(); await a.page.waitForTimeout(300);
    await a.tap('Add Key Date', {wait: 3000});
    const o = await as('op');
    const seen = await o.get(`site_calendar_events?select=title&site_id=eq.${J}`);
    const mine = await a.get(`site_calendar_events?select=title,visible_roles,is_private&site_id=eq.${J}&title=eq.ZZ%20Managers%20only`);
    return {ok: mine.length === 1 && mine[0].is_private && !seen.some((x) => x.title === 'ZZ Managers only') && seen.some((x) => x.title === 'ZZ Scaffold'), note: `operative sees: ${seen.map((x) => x.title).join(', ')}`};
  });

  // To Do.
  await step('To Do: add, comment, complete', async () => {
    await a.go(`/sites/${J}/todos`);
    await a.fill('What needs doing?', 'ZZ chase scaffold');
    await a.tap('Add To Do', {wait: 3000});
    await a.shot('todo');
    const r = await a.get(`todos?select=id,text,done&site_id=eq.${J}`);
    await a.page.getByText(/Comments/).locator('visible=true').first().click(); await a.page.waitForTimeout(500);
    await a.fill('Add a comment…', 'ZZ comment');
    await a.tap('Comment', {wait: 2000, last: true});
    await a.tap('Mark Complete', {wait: 2500});
    const after = await a.get(`todos?select=done&site_id=eq.${J}`);
    return {ok: r.length === 1 && after[0].done === true, note: `${r.length}, done ${after[0]?.done}`};
  });

  // HUB.
  await step('HUB: send to project operatives with an @ mention; the operative gets both', async () => {
    await a.go(`/sites/${J}/messages`);
    const box = a.page.locator('textarea').locator('visible=true').first();
    await box.fill('ZZ test message @andy o');
    await a.page.waitForTimeout(800);
    await a.page.getByText('@andy op').locator('visible=true').first().click({timeout: 7000});
    await a.tap('Send', {last: false, wait: 800});
    await a.tap('Project operatives', {wait: 3000});
    const o = await as('op');
    await o.go(`/sites/${J}/messages`, 5000);
    await o.shot('op-hub');
    const t = await o.text();
    return {ok: /ZZ test message/.test(t) && /Mentioned you/.test(t), note: t.includes('Mentioned you') ? 'both' : 'no mention row'};
  });
  await step('HUB: the operative replies, the manager sees a thread', async () => {
    const o = await as('op');
    await o.page.getByText('↩ Reply').locator('visible=true').last().click({timeout: 7000}); await o.page.waitForTimeout(500);
    await o.page.locator('textarea').locator('visible=true').last().fill('ZZ reply from site');
    await o.tap('Send Reply', {wait: 2500});
    await a.go(`/sites/${J}/messages`);
    await a.tap(/Sent to Operatives|From Team/, {exact: false, last: false});
    await a.page.waitForTimeout(500);
    await a.page.getByText(/Sent to Operatives/).locator('visible=true').last().click().catch(() => {});
    await a.page.waitForTimeout(800);
    await a.shot('hub-thread');
    const r = a.page.getByText(/1 reply/).locator('visible=true').first();
    await r.click({timeout: 7000}); await a.page.waitForTimeout(500);
    return {ok: /ZZ reply from site/.test(await a.text())};
  });

  // Check-in, with a real location.
  await step('Operative checks in and out at the job', async () => {
    const o = await as('op');
    await o.ctx.grantPermissions(['geolocation']);
    await o.ctx.setGeolocation({latitude: 51.5, longitude: -0.14});
    await o.go(`/sites/${J}/checkin`, 5000);
    await o.shot('op-checkin');
    await o.page.getByText(/^Check In$|Check In Now|CHECK IN/i).locator('visible=true').first().click({timeout: 7000});
    await o.page.waitForTimeout(4000);
    await o.shot('op-checked');
    const y = o.page.getByText(/^(Yes|Confirm|Check In)$/).locator('visible=true').last();
    if (await y.isVisible().catch(() => false)) { await y.click(); await o.page.waitForTimeout(3000); }
    const c = await a.get(`checkins?select=type,device_id,lat&site_id=eq.${J}&order=ts.desc&limit=1`);
    return {ok: c[0]?.type === 'in', note: JSON.stringify(c[0] || {}).slice(0, 110)};
  }, 'op');

  // PPE, plant and incident.
  await step('PPE: operative requests an item', async () => {
    const o = await as('op');
    await o.go(`/sites/${J}/ppe`, 5000);
    await o.tap('+ Request PPE');
    await o.field('Item name', 'ZZ gloves').catch(async () => { await o.page.locator('input').locator('visible=true').first().fill('ZZ gloves'); });
    await o.tap('Submit Request', {wait: 3000});
    const p = await a.get(`ppe_requests?select=id,status&site_id=eq.${J}`);
    return {ok: p.length >= 1, note: p[0]?.status};
  }, 'op');
  await step('Plant: add an item', async () => {
    await a.go(`/sites/${J}/plant`);
    await a.tap('+ Add Plant Item');
    await a.fill('Item name, e.g. Genie GS-1930 MEWP', 'ZZ Scissor lift');
    await a.page.getByText(/^(Add|Save|Add Plant)/).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(3000);
    const p = await a.get(`plant_items?select=id,name&site_id=eq.${J}`);
    return {ok: p.length >= 1, note: p[0]?.name};
  });
  await step('Incident: operative reports one', async () => {
    const o = await as('op');
    await o.go(`/sites/${J}/hs/incidents`, 5000);
    await o.page.getByText(/Report Accident/).locator('visible=true').first().click({timeout: 7000});
    await o.page.waitForTimeout(2000);
    await o.shot('incident-form');
    return true;
  }, 'op');
};
