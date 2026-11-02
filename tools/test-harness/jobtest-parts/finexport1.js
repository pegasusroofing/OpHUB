// Every Finance page with exports shows them in the footer bar, on Sandbox, laptop. Nothing is exported or changed.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  await a.page.setViewportSize({width: 1440, height: 900});
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20A&limit=1');
  const [App] = await a.get('fin_applications?select=id&site_id=eq.' + J.id + '&limit=1');
  const [Inv] = await a.get('fin_invoices?select=id,site_id&status=neq.draft&site_id=eq.' + J.id + '&limit=1');
  const [Po] = await a.get('purchase_orders?select=id&limit=1');
  const pages = {monthly: '/fin/job/' + J.id + '/monthly', summary: '/fin/job/' + J.id + '/summary', variations: '/fin/job/' + J.id + '/variations', costs: '/fin/job/' + J.id + '/costs', boq: '/fin/job/' + J.id + '/boq', application: '/fin/job/' + J.id + '/application/' + App.id, invoice: Inv && '/fin/job/' + J.id + '/invoice/' + Inv.id, po: Po && '/fin/po/' + Po.id, report: '/fin/reports?id=debtors'};
  for (const [k, url] of Object.entries(pages)) {
    if (!url) continue;
    await step('Footer on ' + k, async () => {
      await a.go(url, 6000); await a.page.waitForTimeout(2500); await a.shot(k);
      const t = await a.page.getByText(/^Export to (Excel|PDF)/).locator('visible=true').all();
      const y = t.length ? (await t[0].boundingBox()).y : 0;
      const old = await a.page.getByText(/^(📊 Excel|📄 PDF|Excel \/ PDF|View PDF|📄 Download)/).locator('visible=true').count();
      return {ok: t.length >= 1 && y > 840 && old === 0, note: t.length + ' at y ' + Math.round(y) + ', old ' + old};
    });
  }
};
