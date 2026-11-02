// Bill of Quantities on a laptop: Import / Export sits beside + Add Works, on Sandbox's ZZ job. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  await step('Import / Export beside + Add Works', async () => {
    await a.go('/fin/job/' + J.id + '/boq', 7000); await a.page.waitForTimeout(3000);
    const add = a.page.getByText('+ Add Works', {exact: true}).locator('visible=true').first(), io = a.page.getByText('Import / Export', {exact: true}).locator('visible=true').first();
    await add.scrollIntoViewIfNeeded(); await a.page.waitForTimeout(400); await a.shot('boq');
    const x = await add.boundingBox(), y = await io.boundingBox();
    return {ok: Math.abs(x.y - y.y) < 3 && y.x > x.x, note: 'same row ' + Math.round(x.y) + '/' + Math.round(y.y)};
  });
};
