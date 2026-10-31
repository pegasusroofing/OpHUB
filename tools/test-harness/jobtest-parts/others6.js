// Closing the last gaps: repair sign-off, RAMS builder issued for signing, and superseding a signed RAMS.
const path = require('path');
module.exports = async ({as, step, state, samples}) => {
  const a = await as('admin'), o = await as('op');
  const J = state.regular, R = state.repair, pdf = path.join(samples, 'wo.pdf');
  const job = async () => (await a.get(`repair_jobs?select=*&id=eq.${state.repairJob}`))[0];
  await step('Repair: works completed', async () => {
    await a.go(`/sites/${R}/repairs/job/${state.repairJob}`);
    await a.fill('Completion notes', 'ZZ all done');
    await a.page.getByText(/Mark Works as Completed/).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(3500);
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
  await step('RAMS builder: fill in Info, issue, two documents go on the job', async () => {
    await a.go(`/sites/${J}/hs/rams/build/${state.build}`);
    await a.tap('Info ⚠', {last: false, wait: 900}).catch(() => {});
    await a.shot('build-info');
    for (const [l, v] of [['Client contact', 'ZZ Client Contact'], ['Description of works', 'ZZ strip and re-felt the roof']]) await a.field(l, v).catch(() => {});
    const date = a.page.getByText('Start date', {exact: false}).locator('visible=true').first().locator('xpath=following::*[contains(text(),"Choose a date")][1]');
    if (await date.isVisible().catch(() => false)) { await date.click(); await a.page.getByText(String(new Date().getDate()), {exact: true}).locator('visible=true').last().click(); }
    await a.page.waitForTimeout(2500);
    await a.tap('Issue', {last: false, wait: 1200});
    const before = (await a.get(`rams_docs?select=id&site_id=eq.${J}`)).length;
    await a.page.getByText(/Issue Risk Assessment & Method Statement/).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(1500);
    const said = (await a.text()).replace(/\s+/g, ' ').slice(0, 90);
    const y = a.page.getByText(/^(Yes|Issue|OK|Confirm)$/).locator('visible=true').last();
    if (await y.isVisible().catch(() => false)) await y.click();
    await a.page.waitForTimeout(9000);
    await a.shot('build-issued');
    const after = (await a.get(`rams_docs?select=id&site_id=eq.${J}`)).length;
    const b = await a.get(`rams_builds?select=status,revision&id=eq.${state.build}`);
    return {ok: b[0]?.status === 'issued' && after >= before + 2, note: `${JSON.stringify(b[0] || {})}; docs ${before}→${after}; ${said}`};
  });
  await step('RAMS supersede: new version replaces the signed one; operative is asked again', async () => {
    await a.go(`/sites/${J}/hs/rams`);
    await a.page.getByText(/Create \/ Upload RAMS/).locator('visible=true').first().click({timeout: 7000}).catch(() => {}); await a.page.waitForTimeout(700);
    await a.page.getByText('📄 Upload RAMS').locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(700);
    await a.fill('RAMS name', 'ZZ RAMS Roof Works v2');
    await a.shot('sup-form');
    await a.page.getByText(/○? ?ZZ RAMS Roof Works$/).locator('visible=true').last().click({timeout: 7000});
    await a.pick(() => a.page.getByText(/Choose PDF/i).locator('visible=true').first().click({timeout: 7000}), [pdf], 1000);
    await a.page.getByText(/^Upload RAMS$/).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(4500);
    await a.shot('sup-done');
    const docs = await a.get(`rams_docs?select=name,status&site_id=eq.${J}`);
    const old = docs.find((x) => x.name === 'ZZ RAMS Roof Works');
    await o.go(`/sites/${J}/hs/rams`, 5000);
    await o.shot('op-sup');
    const t = await o.text();
    return {ok: old?.status === 'superseded' && /ZZ RAMS Roof Works v2/.test(t) && /Sign All/i.test(t), note: `old is ${old?.status}; operative: ${(t.match(/Sign All[^\n]*/i) || [''])[0]}`};
  });
};
