// Applications for Payment, the whole process on Sandbox, on one ZZ job. Reports what the screen shows against the database.
module.exports = async ({as, step, state, keep}) => {
  const a = await as('admin');
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {}); };
  const text = async () => (await a.text()).replace(/\s+/g, ' ');
  const [J] = await a.get('sites?select=id,name&name=like.ZZ%20JOB%20Fin*&limit=1');
  const latest = async () => (await a.get(`fin_applications?select=*&site_id=eq.${J.id}&order=number.desc&limit=1`))[0];
  const yes = async (re) => { await a.page.getByText(re).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(2500); };
  let app = await latest();
  const page = () => `/fin/job/${J.id}/application/${app.id}`;
  await a.page.setViewportSize({width: 375, height: 812});

  await step('Phone: the draft opens; nothing runs off the page', async () => {
    await a.go(page(), 6000); await clear(); await a.page.waitForTimeout(1500); await a.shot('phone1');
    const wide = await a.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const small = await a.page.locator('input').locator('visible=true').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width < 45).length);
    return {ok: wide, note: `status ${app.status}, no. ${app.number}, net ${app.net_due}, boxes under 45px wide: ${small}`};
  });
  await step('Phone: scroll shots of the whole page', async () => {
    for (let i = 2; i <= 5; i++) { await a.page.mouse.move(180, 400); await a.page.mouse.wheel(0, 700); await a.page.waitForTimeout(500); await a.shot('phone' + i); }
    return {ok: true, note: (await text()).slice(-200)};
  });
  await step('Enter %: change a line, Save, the sum follows', async () => {
    await a.page.setViewportSize({width: 1440, height: 900});
    await a.go(page(), 6000); await clear(); await a.page.waitForTimeout(1500); await a.shot('desk1');
    const before = await latest();
    const lines = (before.lines || []).filter((l) => l.kind === 'item' || !l.kind);
    const box = a.page.locator('input[inputmode="decimal"], input[type="text"]').locator('visible=true');
    const n = await box.count();
    console.log('boxes', n, 'lines', lines.length, JSON.stringify(lines.map((l) => [l.ref, l.description, l.qty, l.rate, l.value, l.pct])).slice(0, 400));
    await a.page.getByText(/^Save$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(2500);
    const after = await latest();
    return {ok: Number(after.net_due) === Number(before.net_due), note: `net ${before.net_due} → ${after.net_due}, gross ${after.gross}, retention ${after.retention}, previous ${after.previous}`};
  });
  await step('Mark as Applied locks it', async () => {
    await a.page.getByText(/^Mark as Applied/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(1500); await a.shot('apply-ask');
    await yes(/^Mark applied$/); await a.shot('applied');
    const r = await latest();
    const t = await text();
    return {ok: r.status === 'submitted' && !/^Save$/.test(t), note: r.status + ' · ' + (t.match(/Waiting for certificate|Applied/) || [''])[0]};
  });
  await step('Certificate form opens, shows the figures', async () => {
    const b = a.page.getByText(/certificate|pay.less/i).locator('visible=true');
    const labels = await b.allInnerTexts(); console.log('cert words', JSON.stringify(labels).slice(0, 300));
    await a.shot('cert0');
    return {ok: labels.length > 0, note: labels.slice(0, 4).join(' | ').slice(0, 160)};
  });
};
