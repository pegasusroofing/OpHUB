// The quote tracker for real on Sandbox: a quote from enquiry to won job, one lost and filed, the chaser, reports, import.
// CHASE_TEST=1 lets Chase now through: the test quote's contact is Andy's own address, the only one allowed.
const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, keep, samples, OUT, ANDY}) => {
  const a = await as('admin');
  const pdf = path.join(samples, 'sds.pdf');
  const say = async (n = 300) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const get = async (id) => (await a.get(`quotes?select=*&id=eq.${id}`))[0];
  const add = async (client, title, value, email) => {
    await a.go('/pm/quotes/new', 4500);
    await a.field('Client *', client);
    await a.field('Contact name', 'Andy');
    if (email) await a.field('Contact email (the chaser goes here)', email);
    await a.field('Project name *', title);
    await a.field('Tender value £', value);
    await a.page.getByText('Choose…').locator('visible=true').first().click(); await a.page.waitForTimeout(500);
    await a.tap('Flat Roofing', {wait: 500});
    await a.tap('Add Quote', {wait: 4500});
    return (a.page.url().match(/quotes\/([0-9a-f-]{36})/) || [])[1];
  };
  const setStatus = async (label) => { await a.tap('Change', {wait: 700}); await a.tap(label, {wait: 5000}); };

  await step('Home: Quotes tile opens the tracker', async () => {
    await a.go('/home', 4500);
    await a.page.getByText('Tender tracker', {exact: true}).locator('visible=true').first().click({timeout: 6000});
    await a.page.waitForTimeout(3000);
    await a.shot('h');
    return {ok: /pm\/quotes/.test(a.page.url()), note: await say(160)};
  });
  await step('New quote: saves, and the client joins the Directory', async () => {
    state.q1 = await add('ZZ Quote Client', 'ZZ JOB Quote Won B', '125000', ANDY); keep();
    const q = state.q1 && await get(state.q1);
    await a.shot('n');
    return {ok: !!q && !!q.client_id && Number(q.value) === 125000 && q.discipline === 'Flat Roofing', note: q ? `${q.status}, client id ${!!q.client_id}` : await say()};
  });
  await step('Directory: the client can be found again while typing', async () => {
    await a.go('/pm/quotes/new', 4500);
    await a.field('Client *', 'ZZ Quote');
    await a.page.waitForTimeout(1800);
    await a.shot('s');
    return /ZZ Quote Client/.test(await a.text());
  });
  await step('Folder: made from the New Enquiry template, with its documents', async () => {
    await a.go(`/pm/quotes/${state.q1}`, 4500);
    await a.tap('📁 Make the folder', {wait: 0});
    let q; for (let i = 0; i < 20; i++) { await a.page.waitForTimeout(2000); q = await get(state.q1); if (q.folder_id) break; }
    await a.page.waitForTimeout(3500);
    await a.go(`/pm/quotes/${state.q1}`, 8000);
    await a.shot('f');
    const t = await a.text();
    return {ok: !!q?.folder_id && /1\. Tender Documents/.test(t) && /3\. Quotation/.test(t), note: t.replace(/\s+/g, ' ').slice(-300)};
  });
  await step('Documents: upload to the quote’s folder', async () => {
    await a.page.getByText('1. Tender Documents', {exact: true}).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(5000);
    await a.pick(() => a.tap('⬆️ Add a file here', {wait: 0}), [pdf], 9000);
    await a.shot('u');
    return /sds\.pdf/.test(await a.text());
  });
  await step('Returned: the chaser is dated 30 days on', async () => {
    await a.go(`/pm/quotes/${state.q1}`, 4500);
    await setStatus('Returned');
    const q = await get(state.q1);
    const want = new Date(); want.setDate(want.getDate() + 30);
    return {ok: q.status === 'returned' && q.next_chase_date === want.toISOString().slice(0, 10), note: `${q.status}, next ${q.next_chase_date}`};
  });
  if (process.env.CHASE_TEST === '1') await step('Chase now: one email to Andy, logged, next date moved', async () => {
    await a.go(`/pm/quotes/${state.q1}`, 4500);
    await a.tap('✉ Chase now', {wait: 800});
    await a.page.getByText(/^Send$/).locator('visible=true').last().click({timeout: 5000});
    await a.page.waitForTimeout(6000);
    await a.shot('c');
    const q = await get(state.q1), log = await a.get(`quote_chases?select=sent_to,automatic&quote_id=eq.${state.q1}`);
    return {ok: q.chase_count === 1 && log.length === 1 && log[0].sent_to === ANDY, note: `${q.chase_count}, next ${q.next_chase_date}, ${log[0]?.sent_to}`};
  });
  await step('Tender stage: switches the chaser off', async () => {
    await a.go(`/pm/quotes/${state.q1}`, 4500);
    await setStatus('Tender stage');
    const q = await get(state.q1);
    return {ok: q.chase_on === false && q.next_chase_date === null, note: `${q.status}`};
  });
  await step('Won: makes the job and moves the documents into its pack', async () => {
    await a.go(`/pm/quotes/${state.q1}`, 4500);
    await a.tap('🏆 Won: convert to job', {wait: 800});
    await a.page.getByText('Won, make the job').locator('visible=true').last().click({timeout: 5000});
    let q; for (let i = 0; i < 45; i++) { await a.page.waitForTimeout(2000); q = await get(state.q1); if (q.status === 'won') break; }
    await a.page.waitForTimeout(3000);
    await a.shot('w');
    const site = q?.site_id && (await a.get(`sites?select=name,client_name,job_pack&id=eq.${q.site_id}`))[0];
    return {ok: q?.status === 'won' && !!site?.job_pack, note: `${site?.name}, ${site?.client_name}, pack ${site?.job_pack?.path} | ${await say(180)}`};
  });
  await step('Lost: a second quote is filed to its year', async () => {
    state.q2 = await add('ZZ Quote Client', 'ZZ JOB Quote Lost B', '40000', null); keep();
    await a.tap('📁 Make the folder', {wait: 0});
    let q; for (let i = 0; i < 20; i++) { await a.page.waitForTimeout(2000); q = await get(state.q2); if (q.folder_id) break; }
    await a.go(`/pm/quotes/${state.q2}`, 4500);
    await setStatus('Lost');
    await a.page.waitForTimeout(4000);
    await a.shot('l');
    q = await get(state.q2);
    return {ok: q.status === 'lost' && !!q.completed_at, note: `${q.completed_at} | ${await say(120)}`};
  });
  await step('Tracker: filters and views add up, and both exports are real', async () => {
    await a.go('/pm/quotes', 5000);
    await a.page.getByText('Live ▾').locator('visible=true').first().click(); await a.page.waitForTimeout(500);
    await a.tap('All', {wait: 900});
    await a.shot('t1');
    await a.page.getByText('List ▾').locator('visible=true').first().click(); await a.page.waitForTimeout(500);
    await a.tap('By customer', {wait: 900});
    await a.shot('t2');
    const t = await a.text();
    const x = await a.saved(() => a.tap('📊 Excel', {wait: 500}).then(async () => { await a.page.waitForTimeout(1500); const c = a.page.getByText('⬇️ Download', {exact: true}).locator('visible=true').last(); if (await c.isVisible().catch(() => false)) await c.click(); }));
    const p = await a.saved(() => a.tap('📄 PDF', {wait: 500}).then(async () => { await a.page.waitForTimeout(1500); const c = a.page.getByText('📄 PDF', {exact: true}).locator('visible=true').last(); if (await c.isVisible().catch(() => false)) await c.click(); }));
    fs.copyFileSync(p, path.join(OUT, 'quotes-sample.pdf'));
    const ok = /ZZ Quote Client/.test(t) && /1 won/.test(t) && fs.readFileSync(x).slice(0, 2).toString() === 'PK' && fs.readFileSync(p).slice(0, 5).toString() === '%PDF-';
    return {ok, note: t.replace(/\s+/g, ' ').slice(60, 300)};
  });
  await step('Import: the tracker’s format loads, chaser off, and a second load adds nothing', async () => {
    const file = path.join(samples, 'tender-test.xlsx');
    await a.go('/pm/quotes', 4500);
    await a.pick(() => a.tap('📊 Load Excel tracker', {wait: 0}), [file], 1500);
    await a.tap('OK', {wait: 5000});
    await a.shot('i1');
    const t1 = await say(400);
    const rows = await a.get(`quotes?select=title,status,chase_on,priced_by_name,imported&imported=eq.true&client_name=like.ZZ*`);
    await a.go('/pm/quotes', 4500);
    await a.pick(() => a.tap('📊 Load Excel tracker', {wait: 0}), [file], 1500);
    await a.tap('OK', {wait: 5000});
    const t2 = await say(4000);
    return {ok: rows.length === 3 && rows.every((r) => r.chase_on === false) && /0 quotes loaded/.test(t2), note: JSON.stringify(rows).slice(0, 240)};
  });
};
