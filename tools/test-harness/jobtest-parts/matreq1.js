// Request Material card, new design (3 Nov). Looks only on ZZ JOB Regular: nothing typed or requested.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Regular&limit=1');
  for (const [w, h] of [[1440, 900], [430, 932]]) {
    await step('Request card at ' + w, async () => {
      await a.page.setViewportSize({width: w, height: h});
      await a.go('/sites/' + J.id + '/materials/requests', 9000); await a.page.getByText('Request Material', {exact: true}).first().waitFor({timeout: 30000});
      await a.page.getByText('Request Material', {exact: true}).first().scrollIntoViewIfNeeded(); await a.page.waitForTimeout(800); await a.shot('card-' + w);
      return {ok: true};
    });
  }
};
