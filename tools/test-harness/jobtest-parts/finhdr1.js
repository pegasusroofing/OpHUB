// Finance header 1.15x, centred (3 Nov). Looks only.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  for (const [w, h] of [[1440, 900], [430, 932]]) {
    await step('Header at ' + w, async () => {
      await a.page.setViewportSize({width: w, height: h});
      await a.go('/fin/purchases?tab=orders', 9000); await a.page.waitForTimeout(3000); await a.shot('hdr-' + w);
      return {ok: true};
    });
  }
};
