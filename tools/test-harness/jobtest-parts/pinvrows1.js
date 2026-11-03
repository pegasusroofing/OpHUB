// Purchase invoices tidied and an unallocated invoice's lines in rows, Supplier row tappable (3 Nov). Looks only:
// the ZZ test item zza-lost.png is opened, nothing is changed or filed.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  for (const [w, h] of [[1440, 900], [430, 932]]) {
    await step('Invoices at ' + w, async () => {
      await a.page.setViewportSize({width: w, height: h});
      await a.go('/fin/purchases?tab=invoices', 9000); await a.page.waitForTimeout(3500); await a.shot('list-' + w);
      await a.go('/fin/inbox/464605bf-8815-476d-91af-f07dcf10e441', 9000); await a.page.waitForTimeout(3500);
      await a.page.getByText(/^Lines \(/).first().scrollIntoViewIfNeeded().catch(() => {}); await a.page.waitForTimeout(500); await a.shot('item-' + w);
      return {ok: (await a.page.getByText('Supplier', {exact: true}).count()) >= 1};
    });
  }
};
