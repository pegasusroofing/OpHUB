// New variation / day work from an application go into their tabs with the status chosen. Sandbox's ZZ JOB Fin C only:
// uses or makes a draft, adds one test variation (not on the Schedule of Works) and one test day work.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  await a.page.setViewportSize({width: 1440, height: 900});
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  const [d] = await a.get('fin_applications?select=id&status=eq.draft&site_id=eq.' + J.id + '&limit=1');
  const stamp = String(Date.now() % 100000);
  let id;
  await step('+ Variation Line: pop-up with status and Schedule of Works, saved to the Variations tab', async () => {
    await a.go('/fin/job/' + J.id + '/application/' + (d ? d.id : 'new'), 9000); await a.page.getByText('Line By Line', {exact: true}).locator('visible=true').first().waitFor({timeout: 30000}); await a.page.waitForTimeout(1500);
    id = new URL(a.page.url()).pathname.split('/').pop();
    await q('Line By Line').first().click(); await a.page.waitForTimeout(600);
    await q('+ Variation Line').first().click({timeout: 5000}); await a.page.waitForTimeout(600); await a.shot('var-form');
    const sowTick = await a.page.getByText(/Schedule of Works/).locator('visible=true').count();
    const inputs = a.page.locator('[role=dialog] input:visible, input:visible');
    await a.page.locator('input:visible').nth(-3).fill('ZZ var ' + stamp).catch(() => {});
    const fields = await a.page.locator('input:visible').evaluateAll((els) => els.map((e) => e.placeholder));
    // Description, Qty, Rate are the last three boxes in the pop-up.
    const boxes = a.page.locator('input:visible'), n = await boxes.count();
    await boxes.nth(n - 3).fill('ZZ var ' + stamp); await boxes.nth(n - 2).fill('2'); await boxes.nth(n - 1).fill('50');
    await q('Save').last().click(); await a.page.waitForTimeout(3000); await a.shot('var-added');
    const [fv] = await a.get('fin_variations?select=id,status,quoted,number&site_id=eq.' + J.id + '&title=eq.' + encodeURIComponent('ZZ var ' + stamp));
    return {ok: !!fv && fv.status === 'instructed' && Number(fv.quoted) === 100 && sowTick >= 1, note: JSON.stringify(fv) + ', sow tick ' + sowTick + ' ' + fields.length};
  });
  await step('+ Add Day Work: saved to the Day works tab', async () => {
    await q('+ Add Day Work').first().click({timeout: 5000}); await a.page.waitForTimeout(600);
    const boxes = a.page.locator('input:visible'), n = await boxes.count();
    await boxes.nth(n - 2).fill('ZZ dw ' + stamp); await boxes.nth(n - 1).fill('75');
    await q('Save').last().click(); await a.page.waitForTimeout(3000); await a.shot('dw-added');
    const [dw] = await a.get('fin_dayworks?select=id,status,value&site_id=eq.' + J.id + '&title=eq.' + encodeURIComponent('ZZ dw ' + stamp));
    await a.page.waitForTimeout(2500);
    const [r] = await a.get('fin_applications?select=variations,dayworks&id=eq.' + id);
    const linked = (r.variations || []).some((v) => String(v.description || '').includes('ZZ var ' + stamp) && v.fin_variation_id) && (r.dayworks || []).some((x) => String(x.description || '').includes('ZZ dw ' + stamp) && x.fin_daywork_id);
    return {ok: !!dw && dw.status === 'issued' && Number(dw.value) === 75 && linked, note: JSON.stringify(dw) + ', linked on the application ' + linked};
  });
};
