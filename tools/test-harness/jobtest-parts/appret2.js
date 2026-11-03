// Hide the qty column (kept with the application) and the retention release offers. Sandbox's ZZ JOB Fin A draft only:
// toggles hide_qty there and back; on ZZ JOB Fin C (first half of retention not yet asked for) uses or makes one draft and sets every line to 100%. The release questions are closed without choosing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [JA] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20A&limit=1');
  const [d] = await a.get('fin_applications?select=id,hide_qty&status=eq.draft&site_id=eq.' + JA.id + '&order=created_at.desc&limit=1');
  const open = async () => { await a.go('/fin/job/' + JA.id + '/application/' + d.id, 8000); await a.page.getByText('Line By Line', {exact: true}).locator('visible=true').first().waitFor({timeout: 30000}); await a.page.waitForTimeout(1200); };
  await a.page.setViewportSize({width: 430, height: 932});
  await step('Phone: Hide the qty column, kept with the application', async () => {
    await open(); await q('Line By Line').first().click(); await a.page.waitForTimeout(600);
    const before = await q('Qty').count();
    await q('Bulk Edit ▾').first().click(); await a.page.waitForTimeout(400); await q('Hide the qty column').first().click(); await a.page.waitForTimeout(1500); await a.shot('noqty');
    const after = await q('Qty').count(), [r] = await a.get('fin_applications?select=hide_qty&id=eq.' + d.id);
    await q('Bulk Edit ▾').first().click(); await a.page.waitForTimeout(400); await q('Show the qty column').first().click(); await a.page.waitForTimeout(1500);
    const [r2] = await a.get('fin_applications?select=hide_qty&id=eq.' + d.id);
    return {ok: before >= 1 && after === 0 && r.hide_qty === true && r2.hide_qty === false, note: 'qty headings ' + before + ' > ' + after + ', saved ' + r.hide_qty + ', back ' + r2.hide_qty};
  });
  await step('Everything at 100%: Apply For Payment offers the first half of the retention', async () => {
    const [JC] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
    const [jf] = await a.get('job_finance?select=ret1_app_id,ret1_invoice_id&site_id=eq.' + JC.id);
    if (jf && (jf.ret1_app_id || jf.ret1_invoice_id)) return {ok: true, note: 'Fin C first half already asked for — not offered, as it should be'};
    const [dc] = await a.get('fin_applications?select=id&status=eq.draft&site_id=eq.' + JC.id + '&limit=1');
    await a.go('/fin/job/' + JC.id + '/application/' + (dc ? dc.id : 'new'), 9000); await a.page.getByText('Line By Line', {exact: true}).locator('visible=true').first().waitFor({timeout: 30000}); await a.page.waitForTimeout(1500);
    await q('Line By Line').first().click(); await a.page.waitForTimeout(500);
    await q('Bulk Edit ▾').first().click(); await a.page.waitForTimeout(400); await q('Set every line to 100%').first().click(); await a.page.waitForTimeout(3500);
    await q('Overview').last().click(); await a.page.waitForTimeout(600);
    await q('Apply For Payment').first().click({timeout: 5000}); await a.page.waitForTimeout(800); await a.shot('ret-offer');
    const offered = await q('Everything is 100% complete').count();
    await a.page.getByLabel('Close').locator('visible=true').last().click().catch(() => {}); await a.page.waitForTimeout(500);
    const id = new URL(a.page.url()).pathname.split('/').pop(), [r] = await a.get('fin_applications?select=status&id=eq.' + id);
    return {ok: offered === 1 && r.status === 'draft', note: 'offered ' + offered + ', still ' + r.status};
  });
  await step('Overview: Retention Release row', async () => {
    await open(); await q('Overview').last().click(); await a.page.waitForTimeout(600);
    const btn = await q('Release ▾').count();
    if (btn) { await q('Release ▾').first().click(); await a.page.waitForTimeout(500); await a.shot('ret-menu'); }
    const first = await q('First half — practical completion').count() + await q('Final release — end of the defects period').count();
    await a.page.getByLabel('Close').locator('visible=true').last().click().catch(() => {});
    return {ok: btn === 1 && first >= 1, note: 'button ' + btn + ', choices ' + first};
  });
};
