// Export Excel button downloads straight away; the footer's Export To Excel still asks how. Sandbox's ZZ JOB Fin C; makes files only.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  const [app] = await a.get('fin_applications?select=id&site_id=eq.' + J.id + '&status=in.(draft,submitted)&cert_net=is.null&order=number.desc&limit=1');
  const noSow = async () => { await a.page.waitForTimeout(1200); const n = await a.page.getByText(/^Include the Schedule of Works/).locator('visible=true').count(); if (n) { await a.page.getByText(/^(No|Just the application|Without)/).locator('visible=true').first().click({timeout: 4000}); } return n; };
  await step('Export Excel button: no Download / OneDrive question', async () => {
    await a.go('/fin/job/' + J.id + '/application/' + app.id, 8000); await a.page.waitForTimeout(3500);
    const dl = a.page.waitForEvent('download', {timeout: 15000}).catch(() => null);
    await q('Export Excel').first().click({timeout: 5000}); const sow = await noSow();
    const d = await dl; await a.page.waitForTimeout(500); await a.shot('button');
    const asked = await q('⬇️ Download').count();
    return {ok: !!d && asked === 0, note: (d ? d.suggestedFilename() : 'no download') + ', asked ' + asked + ', sow question ' + sow};
  });
  await step('Footer Export To Excel still asks', async () => {
    await q('Export To Excel').first().click({timeout: 5000}); await noSow(); await a.page.waitForTimeout(2500); await a.shot('footer');
    const asked = await q('⬇️ Download').count();
    if (asked) await a.page.keyboard.press('Escape');
    return {ok: asked >= 1, note: 'asked ' + asked};
  });
};
