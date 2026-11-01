// The estimator's flow as Andy described it: create the enquiry with its documents, the folder appears, send and submit,
// the folder files itself, won moves it to the job. Multi-select filters and the compact list. CHASE_TEST=1 for the send:
// the only address it will send to is Andy's, and the guard checks that.
const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, keep, samples, ANDY}) => {
  const a = await as('admin');
  const pdf = path.join(samples, 'sds.pdf');
  const say = async (n = 300) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const get = async (id) => (await a.get(`quotes?select=*&id=eq.${id}`))[0];
  const T = 'ZZ JOB Flow C';
  await step('Create Enquiry: with documents, makes the folder and files them', async () => {
    await a.go('/pm/quotes/new', 4500);
    await a.field('Client *', 'ZZ Flow Client');
    await a.field('Contact name', 'Andy');
    await a.field('Contact email (the chaser goes here)', ANDY);
    await a.field('Project name *', T);
    await a.pick(() => a.page.getByText('📎 Add documents').locator('visible=true').first().click(), [pdf], 1000);
    await a.shot('c1');
    await a.page.getByText('Create Enquiry').locator('visible=true').last().click();
    for (let i = 0; i < 40 && !/quotes\/[0-9a-f-]{36}/.test(a.page.url()); i++) await a.page.waitForTimeout(1500);
    state.q3 = (a.page.url().match(/quotes\/([0-9a-f-]{36})/) || [])[1]; keep();
    const q = state.q3 && await get(state.q3);
    await a.page.waitForTimeout(6000);
    await a.shot('c2');
    return {ok: !!q?.folder_id && !!q.priced_by, note: q ? `folder ${q.folder_name}, priced by ${q.priced_by_name}` : await say()};
  });
  await step('Documents: the tender document is in Tender Documents', async () => {
    await a.go(`/pm/quotes/${state.q3}`, 7000);
    await a.page.getByText('1. Tender Documents', {exact: true}).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(5000);
    await a.shot('c3');
    return /sds\.pdf/.test(await a.text());
  });
  await step('Estimator: puts the quote in the Quotation folder', async () => {
    await a.go(`/pm/quotes/${state.q3}`, 7000);
    await a.page.getByText('3. Quotation', {exact: true}).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(5000);
    await a.pick(() => a.tap('⬆️ Add a file here', {wait: 0}), [pdf], 8000);
    return /sds\.pdf/.test(await a.text());
  });
  await step('Submit: needs the value', async () => {
    await a.go(`/pm/quotes/${state.q3}`, 4500);
    await a.page.getByText('📨 Send & submit').locator('visible=true').first().click(); await a.page.waitForTimeout(700);
    await a.shot('s1');
    await a.page.getByText('Submit', {exact: true}).locator('visible=true').last().click(); await a.page.waitForTimeout(800);
    const q = await get(state.q3);
    return {ok: q.status === 'pricing', note: q.status};
  });
  await step('Send from the app: attaches from Quotation, marks sent, files to its year', async () => {
    await a.tap('Send it from here', {wait: 5000});
    await a.field('Value £ *', '98000');
    await a.shot('s2');
    const t = await a.text();
    await a.page.getByText('Submit', {exact: true}).locator('visible=true').last().click(); await a.page.waitForTimeout(900);
    await a.shot('s3');
    await a.page.getByText('Submit', {exact: true}).locator('visible=true').last().click();
    let q; for (let i = 0; i < 25; i++) { await a.page.waitForTimeout(1500); q = await get(state.q3); if (q.filed_at) break; }
    await a.page.waitForTimeout(1500);
    await a.shot('s4');
    return {ok: /sds\.pdf/.test(t) && q.status === 'returned' && !!q.filed_at && Number(q.value) === 98000 && !!q.next_chase_date, note: `${q.status}, filed ${!!q.filed_at}, next chase ${q.next_chase_date} | ${(await say(120))}`};
  });
  await step('After filing: the documents still open from the app', async () => {
    await a.go(`/pm/quotes/${state.q3}`, 8000);
    await a.shot('s5');
    const t = await a.text();
    return {ok: /1\. Tender Documents/.test(t) && !/SEND & SUBMIT/i.test(t.split('CUSTOMER')[0]), note: 'folder found by id after the move'};
  });
  await step('Filter: multi-select, compact list on the phone', async () => {
    await a.go('/pm/quotes', 5000);
    await a.shot('l1');
    await a.page.locator('[aria-label^="Filter"]').first().click(); await a.page.waitForTimeout(500);
    await a.page.locator('[aria-label="Outcome"]').first().click(); await a.page.waitForTimeout(500);
    await a.shot('l2');
    await a.page.locator('[aria-label="Won"]').first().click(); await a.page.waitForTimeout(300);
    await a.page.locator('[aria-label="Lost"]').first().click(); await a.page.waitForTimeout(300);
    await a.tap('Done', {wait: 700});
    await a.shot('l3');
    const t = await a.text();
    await a.page.locator('[aria-label="Newest first"]').first().click(); await a.page.waitForTimeout(500);
    await a.shot('l4');
    await a.tap('Highest value', {wait: 700});
    await a.page.setViewportSize({width: 1300, height: 900}); await a.page.waitForTimeout(1500);
    await a.shot('l5');
    await a.page.setViewportSize({width: 390, height: 844});
    return {ok: /ZZ imported won/.test(t) && /ZZ imported lost/.test(t), note: t.replace(/\s+/g, ' ').slice(40, 220)};
  });
  await step('Won from a filed quote: makes the job and moves the folder out of Estimating', async () => {
    await a.go(`/pm/quotes/${state.q3}`, 4500);
    await a.tap('🏆 Won: convert to job', {wait: 800});
    await a.page.getByText('Won, make the job').locator('visible=true').last().click({timeout: 5000});
    let q; for (let i = 0; i < 45; i++) { await a.page.waitForTimeout(2000); q = await get(state.q3); if (q.status === 'won') break; }
    return {ok: q?.status === 'won' && !!q.site_id, note: `${q?.status}`};
  });
};
