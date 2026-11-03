// Finance lists without the search / filter rows on a laptop (tables only; card lists keep a slim search, 4 Nov), Status heading tick-filters, tiles on Statements (3 Nov). Looks only.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const pages = [['sales-apps', '/fin/sales?tab=apps'], ['sales-invoices', '/fin/sales?tab=invoices'], ['sales-retention', '/fin/sales?tab=retention'], ['purch-orders', '/fin/purchases?tab=orders'], ['purch-invoices', '/fin/purchases?tab=invoices'], ['statements', '/fin/statements']];
  for (const [w, h] of [[1440, 900], [430, 932]]) {
    await step('Finance lists at ' + w, async () => {
      await a.page.setViewportSize({width: w, height: h});
      let searches = 0;
      for (const [n, p] of pages) { await a.go(p, 9000); await a.page.waitForTimeout(3500); await a.shot(n + '-' + w); if (/sales|orders/.test(n)) searches += await a.page.locator('input[placeholder^="Search"]').locator('visible=true').count(); }
      return {ok: w < 700 || searches === 0, note: 'search boxes seen: ' + searches};
    });
  }
};
