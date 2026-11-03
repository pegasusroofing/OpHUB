// Phone: the Valuation grid fits the width; the applications list figure sits level with the ⋯. Sandbox; changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  await a.page.setViewportSize({width: 390, height: 844});
  const [J] = await a.get('sites?select=id&job_number=eq.SBX-126&limit=1');
  const [app] = await a.get('fin_applications?select=id&site_id=eq.' + J.id + '&order=number.desc&limit=1');
  await step('Valuation grid fits', async () => {
    await a.go('/fin/job/' + J.id + '/application/' + app.id, 8000); await a.page.waitForTimeout(3500);
    await a.page.getByText('Total Due', {exact: true}).locator('visible=true').first().scrollIntoViewIfNeeded(); await a.page.waitForTimeout(400); await a.shot('grid');
    const r = await a.page.evaluate(() => { const els = [...document.querySelectorAll('div')].filter((e) => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX !== 'visible' && e.innerText.includes('Total Due')); return {sideways: els.length, over: document.documentElement.scrollWidth - window.innerWidth}; });
    const tot = await a.page.getByText('Total Due', {exact: true}).locator('visible=true').first().boundingBox();
    const last = await a.page.evaluate(() => { const t = [...document.querySelectorAll('div')].find((e) => e.innerText === 'Total Due'); const row = t && t.parentElement; const k = row && row.lastElementChild; const b = k && k.getBoundingClientRect(); return b ? Math.round(b.right) : null; });
    return {ok: r.sideways === 0 && r.over <= 1 && last != null && last <= 390, note: JSON.stringify(r) + ' last figure right edge ' + last + ', total at ' + Math.round(tot.y)};
  });
  await step('List: figure level with the ⋯', async () => {
    await a.go('/fin/job/' + J.id + '?tab=sales', 8000); await a.page.waitForTimeout(3500); await a.shot('list');
    const m = await a.page.getByLabel(/^More: App/).locator('visible=true').first().boundingBox();
    const f = await a.page.getByText(/^£[\d,]+\.\d\d$/).locator('visible=true').first().boundingBox();
    return {ok: Math.abs((m.y + m.height / 2) - (f.y + f.height / 2)) < 4, note: 'dots ' + Math.round(m.y + m.height / 2) + ', figure ' + Math.round(f.y + f.height / 2)};
  });
};
