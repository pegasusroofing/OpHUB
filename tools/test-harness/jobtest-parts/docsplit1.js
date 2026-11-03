// PDF beside purchase invoices and POs on a laptop, Half / Full (3 Nov). Looks only: ZZ items opened, nothing changed.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [P] = await a.get('purchase_orders?select=id&number=eq.SBX-121-PO-001&limit=1');
  const [I] = await a.get('purchase_invoices?select=id&file_path=not.is.null&order=created_at.desc&limit=1');
  await step('Side panel', async () => {
    await a.page.setViewportSize({width: 1440, height: 900});
    await a.go('/fin/inbox/464605bf-8815-476d-91af-f07dcf10e441', 9000); await a.page.waitForTimeout(5000); await a.shot('inbox-half');
    await a.go('/fin/po/' + P.id, 9000); await a.page.waitForTimeout(6000); await a.shot('po-half');
    await a.page.getByText('Full', {exact: true}).first().click(); await a.page.waitForTimeout(3000); await a.shot('po-full');
    if (I) { await a.go('/fin/pinv/' + I.id, 9000); await a.page.waitForTimeout(6000); await a.shot('pinv-half'); }
    return {ok: (await a.page.getByText('Half', {exact: true}).count()) >= 1, note: I ? 'pinv shown' : 'no filed PI with a file'};
  });
};
