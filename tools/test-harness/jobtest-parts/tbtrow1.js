// Toolbox talks in the RAMS row style (3 Nov). Looks only: ZZ JOB Regular's talk list and first talk, nothing pressed.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Regular&limit=1');
  const [T] = await a.get('toolbox_talks?select=id,status&site_id=eq.' + J.id + '&order=created_at.desc&limit=1');
  for (const [w, h] of [[1440, 900], [430, 932]]) {
    await step('Talks at ' + w, async () => {
      await a.page.setViewportSize({width: w, height: h});
      await a.go('/sites/' + J.id + '/hs/tbt', 9000); await a.page.waitForTimeout(3500); await a.shot('list-' + w);
      if (T) { await a.go('/sites/' + J.id + '/hs/tbt/' + T.id, 9000); await a.page.waitForTimeout(3500); await a.shot('talk-' + w); }
      return {ok: true, note: T ? 'talk ' + T.status : 'no talk on ZZ JOB Regular'};
    });
  }
};
