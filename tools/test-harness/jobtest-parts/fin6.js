// Finance overview's six tiles on Sandbox, laptop and phone, read only.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {}); };
  await step('Six tiles, in Andy\'s order', async () => {
    await a.page.setViewportSize({width: 1440, height: 800});
    await a.go('/fin', 6000); await clear(); await a.page.waitForTimeout(2500); await a.shot('desk');
    const t = (await a.text()).replace(/\s+/g, ' ');
    const order = ['Live Contract Value', 'Total Live Jobs', 'Still To Invoice', 'Owed To You', 'Overdue', 'Retention Held By Clients'].map((x) => t.indexOf(x));
    const boxes = await Promise.all(['Live Contract Value', 'Still To Invoice', 'Owed To You', 'Retention Held By Clients'].map((x) => a.page.getByText(x, {exact: true}).first().boundingBox()));
    return {ok: order.every((n, i) => n >= 0 && (!i || n > order[i - 1])) && Math.abs(boxes[0].y - boxes[1].y) < 3 && Math.abs(boxes[2].y - boxes[3].y) < 3 && boxes[2].y > boxes[0].y, note: t.slice(t.indexOf('£'), t.indexOf('£') + 200)};
  });
  await step('Still To Invoice shows a figure', async () => {
    const t = (await a.text()).replace(/\s+/g, ' ');
    const shown = Number((t.match(/£([\d,]+) ?Still To Invoice/) || [])[1]?.replace(/,/g, ''));
    return {note: `shown £${shown}`, ok: Number.isFinite(shown)};
  });
  await step('Phone: two across, nothing cut off', async () => {
    await a.page.setViewportSize({width: 375, height: 812});
    await a.page.waitForTimeout(1500); await a.shot('phone');
    const b = await Promise.all(['Live Contract Value', 'Total Live Jobs', 'Still To Invoice'].map((x) => a.page.getByText(x, {exact: true}).first().boundingBox()));
    const wide = await a.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    return {ok: Math.abs(b[0].y - b[1].y) < 3 && b[2].y > b[0].y && wide, note: `page fits: ${wide}`};
  });
};
