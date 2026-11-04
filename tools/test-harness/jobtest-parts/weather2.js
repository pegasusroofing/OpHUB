// The job home's third box (4 Nov 2026): on-site count and the weather together, split corner to corner — no swapping.
// Also the profit margin bar's menu is a vertical ⋮. Looks only, ZZ JOB Regular.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id,postcode&name=eq.ZZ%20JOB%20Regular&limit=1');
  for (const w of [430, 1440]) {
    await step(`Count and weather together (${w})`, async () => {
      await a.page.setViewportSize({width: w, height: 932});
      await a.go('/sites/' + J.id, 9000);
      await a.page.waitForTimeout(4000);
      const t = await a.page.evaluate(() => document.body.innerText);
      const both = /On site/i.test(t) && /°/.test(t);
      await a.page.waitForTimeout(9000);
      const t2 = await a.page.evaluate(() => document.body.innerText);
      await a.shot('split-' + w);
      return {ok: both && /On site/i.test(t2) && /°/.test(t2), note: `postcode ${J.postcode} · both at once: ${both} · still both after 9s: ${/On site/i.test(t2) && /°/.test(t2)} · ⋮ shown: ${t.includes('⋮')}`};
    });
  }
};
