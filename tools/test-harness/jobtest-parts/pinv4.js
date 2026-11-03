// Purchase invoices (3 Nov): unallocated rows with Assign To PM and read lines; To approve with small ticks and Select All
// (one ticked, nothing approved); an unallocated invoice's compact lines with Cost Code / VAT / Bulk Edit; PDF zoom. Looks only.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  await step('Lists and item', async () => {
    await a.page.setViewportSize({width: 1440, height: 900});
    await a.go('/fin/purchases?tab=invoices', 9000); await a.page.waitForTimeout(3500); await a.shot('unalloc');
    await a.page.getByText(/^To approve/).first().click(); await a.page.waitForTimeout(2500);
    await a.page.locator('[role="checkbox"]').first().click(); await a.page.waitForTimeout(600); await a.shot('approve-ticked');
    await a.go('/fin/inbox/464605bf-8815-476d-91af-f07dcf10e441', 9000); await a.page.waitForTimeout(5000);
    await a.page.getByText('+', {exact: true}).first().click(); await a.page.waitForTimeout(1500); await a.shot('item');
    return {ok: (await a.page.getByText('Bulk Edit ▾').count()) >= 1};
  });
};
