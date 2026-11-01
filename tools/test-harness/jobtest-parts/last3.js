// A delivery from the office to the driver and back.
const path = require('path');
module.exports = async ({as, step, state, samples}) => {
  const a = await as('admin'), d = await as('driver');
  const J = state.regular, photo = path.join(samples, 'site-photo.jpg');
  await step('Delivery: office books one for today with the driver', async () => {
    await a.go('/pm/deliveries');
    await a.tap('+ Add Delivery', {wait: 3000});
    await a.page.getByText('Choose a site…').locator('visible=true').first().click({timeout: 5000}).catch(() => {}); await a.page.waitForTimeout(600);
    await a.page.getByText('ZZ JOB Regular').locator('visible=true').last().click({timeout: 5000}).catch(() => {}); await a.page.waitForTimeout(800);
    await a.fill("What's needed?", 'ZZ pallet of felt');
    await a.tap('Add to Delivery Schedule', {wait: 4000});
    await a.shot('d3');
    const t = await a.get(`delivery_tasks?select=*&site_id=eq.${J}`);
    state.delivery = t[0]?.id;
    return {ok: t.length >= 1, note: t.length ? `${t[0].status}, driver set: ${!!t[0].driver_id}` : (await a.text()).replace(/\s+/g, ' ').slice(0, 170)};
  });
  await step('Driver: sees the delivery and completes it with a photo', async () => {
    await d.go('/driver/schedule', 6000);
    await d.shot('c1');
    const t = await d.text();
    if (!/ZZ pallet/.test(t)) return {ok: false, note: t.replace(/\s+/g, ' ').slice(0, 170)};
    await d.page.getByText(/ZZ pallet/).locator('visible=true').first().click(); await d.page.waitForTimeout(1500);
    await d.shot('c2');
    const [fc] = await Promise.all([d.page.waitForEvent('filechooser', {timeout: 10000}), (async () => { await d.page.getByText(/photo/i).locator('visible=true').first().click({timeout: 7000}); await d.page.waitForTimeout(700); const lib = d.page.getByText(/choose from|library/i).locator('visible=true').last(); if (await lib.isVisible().catch(() => false)) await lib.click(); })()]);
    await fc.setFiles([photo]); await d.page.waitForTimeout(4000);
    await d.shot('c3');
    await d.page.getByText(/Mark Complete/i).locator('visible=true').last().click({timeout: 7000});
    await d.page.waitForTimeout(1200);
    const y = d.page.getByText(/^(Yes|Complete|Confirm)$/).locator('visible=true').last();
    if (await y.isVisible().catch(() => false)) await y.click();
    await d.page.waitForTimeout(3500);
    await d.shot('c4');
    const r = await a.get(`delivery_tasks?select=*&id=eq.${state.delivery}`);
    return {ok: r[0]?.status === 'completed', note: r[0]?.status};
  }, 'driver');
};
