// The job home's third box should swap between On Site Now (and Open Snags) and the weather. Looks only, ZZ JOB Regular.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const [J] = await a.get('sites?select=id,postcode&name=eq.ZZ%20JOB%20Regular&limit=1');
  await step('Box swaps to the weather', async () => {
    const bad = [];
    a.page.on('requestfailed', (r) => { if (/postcodes|open-meteo/.test(r.url())) bad.push(r.url().slice(0, 80) + ' ' + (r.failure() || {}).errorText); });
    a.page.on('response', (r) => { if (/postcodes|open-meteo/.test(r.url())) bad.push('resp ' + r.status() + ' ' + r.url().slice(0, 60)); });
    await a.page.setViewportSize({width: 430, height: 932});
    await a.go('/sites/' + J.id, 9000);
    const seen = new Set();
    for (let i = 0; i < 15; i++) { await a.page.waitForTimeout(2000); const t = await a.page.evaluate(() => document.body.innerText); if (/On site now/i.test(t)) seen.add('onsite'); if (/Open snags/i.test(t)) seen.add('snags'); if (/°/.test(t)) { seen.add('weather'); await a.shot('weather'); } }
    return {ok: seen.has('weather'), note: 'postcode ' + J.postcode + ' · seen ' + [...seen].join(',') + ' · ' + bad.join(' | ')};
  });
};
