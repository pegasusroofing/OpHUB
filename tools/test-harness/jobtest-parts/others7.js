// RAMS builder through to issued, and how long the Schedule of Works takes to load.
module.exports = async ({as, step, state}) => {
  const a = await as('admin'), o = await as('op');
  const J = state.regular;
  await step('RAMS builder: fill in Info, issue, documents go on the job', async () => {
    await a.go(`/sites/${J}/hs/rams/build/${state.build}`);
    const desc = a.page.locator('input[placeholder="Required"], textarea[placeholder="Required"]').locator('visible=true');
    await desc.last().fill('ZZ strip and re-felt the roof'); await a.page.waitForTimeout(600);
    await a.page.getByText('Required', {exact: true}).locator('visible=true').first().click({timeout: 7000}); await a.page.waitForTimeout(700);
    await a.page.getByText(String(new Date().getDate()), {exact: true}).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(3000);
    await a.tap('Issue', {last: false, wait: 1200});
    const before = (await a.get(`rams_docs?select=id&site_id=eq.${J}&status=eq.current`)).length;
    await a.page.getByText(/Issue Risk Assessment & Method Statement/).locator('visible=true').first().click({timeout: 7000});
    await a.page.waitForTimeout(1500);
    await a.shot('issue-ask');
    const y = a.page.getByText(/^(Yes|Issue|OK|Confirm)$/).locator('visible=true').last();
    if (await y.isVisible().catch(() => false)) await y.click();
    await a.page.waitForTimeout(12000);
    await a.shot('build-issued');
    const after = (await a.get(`rams_docs?select=id,name&site_id=eq.${J}&status=eq.current`));
    const b = await a.get(`rams_builds?select=status,revision&id=eq.${state.build}`);
    return {ok: b[0]?.status === 'issued' && after.length >= before + 2, note: `${JSON.stringify(b[0] || {})}; current docs ${before}→${after.length}`};
  });
  await step('Operative is asked to sign the issued RAMS', async () => {
    await o.go(`/sites/${J}/hs/rams`, 5000);
    const t = await o.text();
    return {ok: /Sign All/i.test(t), note: (t.match(/Sign All[^\n]*/i) || [''])[0]};
  }, 'op');
  await step('Schedule of Works: how long it takes to show (development build, slower than the real app)', async () => {
    const times = [];
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      await a.page.goto(`http://localhost:8081/sites/${J}/schedule`);
      await a.page.getByText('Main Roof').locator('visible=true').first().waitFor({timeout: 20000});
      times.push(((Date.now() - t0) / 1000).toFixed(1));
    }
    return {note: `${times.join('s, ')}s`};
  });
};
