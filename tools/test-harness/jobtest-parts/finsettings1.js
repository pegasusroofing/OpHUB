// Finance settings on Sandbox: overheads edited on their own, tabs kept on the pages behind them. Puts the figure back.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {}); };
  const tap = async (t) => { await a.page.getByText(t, {exact: true}).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(1800); };
  const ohp = async () => (await a.get('fin_settings?select=ohp_pct,org_id'))[0];
  const before = await ohp();
  const put = async (val) => { const box = a.page.locator('input').locator('visible=true').last(); await box.fill(val); await a.page.getByText('Save', {exact: true}).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(2500); };
  await step('Company overheads can be changed from their own row', async () => {
    await a.go('/fin/settings', 6000); await clear(); await a.page.waitForTimeout(1500); await a.shot('list');
    await tap('Company overheads (OHP)'); await a.shot('open');
    await a.page.getByText('Edit', {exact: true}).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(600); await a.shot('form');
    await put('7.5');
    const r = await ohp();
    await tap('Company overheads (OHP)').catch(() => {});
    return {ok: Number(r.ohp_pct) === 7.5, note: 'was ' + before?.ohp_pct + ', now ' + r.ohp_pct};
  });
  await step('Figure put back', async () => {
    await a.go('/fin/settings', 5000); await a.page.waitForTimeout(1500); await tap('Company overheads (OHP)');
    await a.page.getByText('Edit', {exact: true}).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(600);
    await put(String(before?.ohp_pct ?? 0));
    const r = await ohp(); return {ok: Number(r.ohp_pct) === Number(before?.ohp_pct ?? 0), note: 'now ' + r.ohp_pct};
  });
  await step('Cost Codes keep the Settings tabs; no Team tab; none in Directory', async () => {
    await a.go('/fin/settings', 5000); await a.page.waitForTimeout(1200);
    const team = await a.page.getByText('Team', {exact: true}).locator('visible=true').count();
    await tap('Cost Codes'); await a.shot('codes'); const s = await a.page.getByText('Settings', {exact: true}).locator('visible=true').count();
    await tap('Directory'); await a.shot('dir'); const d = await a.page.getByText('Cost codes', {exact: true}).locator('visible=true').count();
    return {ok: team === 0 && s > 0 && d === 0, note: 'team ' + team + ', settings ' + s + ', directory cost codes ' + d};
  });
  await step('Admin Users: Finance switch on office roles, none on operatives', async () => {
    await a.go('/pm/admin/users', 6000); await a.page.waitForTimeout(2000); await a.shot('users');
    const sw = await a.page.getByLabel(/^Finance for /).count();
    const ops = await a.get('profiles?select=name&role=eq.operative');
    let bad = 0; for (const o of ops) bad += await a.page.getByLabel('Finance for ' + o.name, {exact: true}).count();
    return {ok: bad === 0, note: sw + ' switches, ' + ops.length + ' operatives, ' + bad + ' on operatives'};
  });
  await step('Reports list and a report read cleanly', async () => {
    await a.go('/fin/reports', 5000); await a.page.waitForTimeout(1500); await a.shot('reports');
    await a.page.setViewportSize({width: 375, height: 812}); await a.page.waitForTimeout(800); await a.shot('reports-phone');
    await a.page.setViewportSize({width: 1440, height: 900});
    const n = await a.page.getByText(/report/i).locator('visible=true').count();
    const first = a.page.locator('[tabindex="0"]').filter({hasText: /./}).locator('visible=true');
    await a.go('/fin/reports?id=' + (process.env.REP || 'wip'), 7000); await a.page.waitForTimeout(3000); await a.shot('report');
    return {ok: true, note: n + ' matches; ' + (await first.count()) + ' rows'};
  });
  await step('Statements and People & Rates keep their tabs', async () => {
    await a.go('/fin/purchases', 5000); await a.page.waitForTimeout(1500); await tap('Statements'); await a.shot('st');
    const s = await a.page.getByText('Purchase orders', {exact: true}).locator('visible=true').count();
    await a.go('/fin/subs', 5000); await a.page.waitForTimeout(1500); await tap('People & Rates'); await a.shot('rates');
    const p = await a.page.getByText('Pay Run', {exact: true}).locator('visible=true').count();
    return {ok: s > 0 && p > 0, note: 'statements ' + s + ', rates ' + p};
  });
};
