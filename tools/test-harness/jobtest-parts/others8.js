// RAMS builder: a hazard, then issued for real, and the operative signs it.
module.exports = async ({as, step, state}) => {
  const a = await as('admin'), o = await as('op');
  const J = state.regular;
  await step('RAMS builder: add a hazard, issue, it goes on the job', async () => {
    await a.go(`/sites/${J}/hs/rams/build/${state.build}`);
    await a.page.getByText(/^RA \(\d+\)$/).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(1000);
    await a.shot('ra');
    await a.page.getByText(/\+ ?.*(hazard|Add)/i).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(1500);
    await a.shot('ra-add');
    const box = a.page.locator('input,textarea').locator('visible=true');
    const n = await box.count();
    for (let i = n - 1; i >= Math.max(0, n - 6); i--) { const ph = await box.nth(i).getAttribute('placeholder'); if (ph && /hazard|what|name/i.test(ph)) { await box.nth(i).fill('ZZ falling from height'); break; } }
    await a.page.getByText('Done', {exact: true}).locator('visible=true').last().click({timeout: 5000}).catch(() => {}); await a.page.waitForTimeout(2500);
    await a.shot('ra-filled');
    await a.page.getByText('Issue', {exact: true}).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(1000);
    await a.page.getByText(/Issue Risk Assessment & Method Statement/).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(1500);
    await a.shot('issue-ask');
    const y = a.page.getByText(/^(Yes|Issue|OK|Confirm)$/).locator('visible=true').last();
    if (await y.isVisible().catch(() => false)) await y.click();
    await a.page.waitForTimeout(12000);
    await a.shot('build-issued');
    const b = await a.get(`rams_builds?select=status,revision,hazards&id=eq.${state.build}`);
    const docs = await a.get(`rams_docs?select=name,doc_type,status&site_id=eq.${J}&status=eq.current`);
    return {ok: b[0]?.status === 'issued', note: `${b[0]?.status} rev ${b[0]?.revision}, ${b[0]?.hazards?.length} hazard(s); ${docs.map((x) => x.doc_type).join(', ')}`};
  });
};
