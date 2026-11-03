// Tile pages after the grid change (3 Nov): Inspections & Reports (3 tiles), Health & Safety, Materials. Looks only, ZZ JOB Regular.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Regular&limit=1');
  for (const [w, h] of [[1440, 900], [430, 932]]) {
    await step('Tiles at ' + w, async () => {
      await a.page.setViewportSize({width: w, height: h});
      for (const p of ['snagging', 'hs', 'materials']) { await a.go('/sites/' + J.id + '/' + p, 9000); await a.page.waitForTimeout(3000); await a.shot(p + '-' + w); }
      return {ok: true};
    });
  }
};
