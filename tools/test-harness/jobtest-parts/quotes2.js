// Quotes laid out like Finance (4 Nov 2026): tiles, outcome chips, the Finance table on a laptop, compact rows on a phone,
// the thin export bar; one quote with its figures as tiles. Looks only (Sandbox quotes).
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const qs = await a.get('quotes?select=id,title,status&order=created_at.desc&limit=5');
  for (const w of [1440, 430]) {
    await step(`Quotes list (${w})`, async () => {
      await a.page.setViewportSize({width: w, height: 932});
      await a.go('/pm/quotes', 7000);
      const t = await a.page.evaluate(() => document.body.innerText);
      await a.shot('list-' + w);
      await a.page.getByText('All', {exact: true}).first().click(); await a.page.waitForTimeout(1500);
      const t2 = await a.page.evaluate(() => document.body.innerText);
      await a.shot('list-all-' + w);
      const ok = /Live quotes/.test(t) && /Win rate/.test(t) && /Export To Excel/.test(t) && (w < 900 || /PRICED BY/i.test(t));
      return {ok, note: `tiles ${/Live quotes/.test(t)} · table ${/PRICED BY/i.test(t)} · export ${/Export To Excel/.test(t)} · all shows ${qs.filter((q) => t2.includes(q.title)).length}/${qs.length} newest`};
    });
  }
  await step('One quote', async () => {
    await a.page.setViewportSize({width: 1440, height: 932});
    await a.go('/pm/quotes/' + qs[0].id, 6000);
    const t = await a.page.evaluate(() => document.body.innerText);
    await a.shot('one');
    return {ok: /Tender value/.test(t) && /Priced by/.test(t), note: qs[0].title};
  });
};
