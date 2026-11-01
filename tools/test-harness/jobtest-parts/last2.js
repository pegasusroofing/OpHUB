// Price line, and a delivery from the office to the driver and back.
const path = require('path');
module.exports = async ({as, step, state, samples}) => {
  const a = await as('admin'), d = await as('driver');
  const J = state.regular, photo = path.join(samples, 'site-photo.jpg');
  await step('Price: start a price for the job', async () => {
    await a.go(`/sites/${J}/price`);
    await a.tap('+ Add price', {wait: 1000});
    await a.page.locator('input').locator('visible=true').last().fill('ZZ Flat Roofing');
    await a.tap('OK', {wait: 3500});
    await a.shot('price-one');
    const e = await a.get(`pricing_elements?select=*&site_id=eq.${J}`);
    return {ok: e.length >= 1, note: `${e.length} price(s); ${(await a.text()).replace(/\s+/g, ' ').slice(70, 170)}`};
  });
  await step('Delivery: office books one for today with the driver', async () => {
    await a.go('/pm/deliveries');
    await a.tap('+ Add Delivery', {wait: 3000});
    await a.shot('d0');
    await a.page.getByText('Choose a site…').locator('visible=true').first().click({timeout: 5000}).catch(() => {}); await a.page.waitForTimeout(600);
    await a.page.getByText('ZZ JOB Regular').locator('visible=true').last().click({timeout: 5000}).catch(() => {}); await a.page.waitForTimeout(800);
    await a.fill("What's needed?", 'ZZ pallet of felt');
    await a.shot('d1');
    await a.page.getByText('Choose a driver…').locator('visible=true').first().click({timeout: 5000}).catch(() => {}); await a.page.waitForTimeout(600);
    await a.page.getByText('andy driver').locator('visible=true').last().click({timeout: 5000}).catch(() => {}); await a.page.waitForTimeout(800);
    await a.shot('d2');
    await a.page.getByText('Save', {exact: false}).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(4000);
    await a.shot('d3');
    const t = await a.get(`delivery_tasks?select=*&site_id=eq.${J}`);
    state.delivery = t[0]?.id;
    return {ok: t.length >= 1, note: t.length ? `${t[0].status}, driver ${!!t[0].driver_id}` : (await a.text()).replace(/\s+/g, ' ').slice(0, 170)};
  });
  await step('Driver: checks in, sees the delivery, completes it with a photo', async () => {
    await d.ctx.grantPermissions(['geolocation']); await d.ctx.setGeolocation({latitude: 51.5, longitude: -0.14});
    await d.go('/driver/checkin', 5000);
    await d.shot('c0');
    await d.page.getByText('Check In', {exact: true}).locator('visible=true').first().click({timeout: 5000}).catch(() => {});
    await d.page.waitForTimeout(3500);
    await d.go('/driver/schedule', 5000);
    await d.shot('c1');
    const t = await d.text();
    if (!/ZZ pallet/.test(t)) return {ok: false, note: t.replace(/\s+/g, ' ').slice(0, 170)};
    await d.page.getByText(/ZZ pallet/).locator('visible=true').first().click(); await d.page.waitForTimeout(1500);
    await d.shot('c2');
    const [fc] = await Promise.all([d.page.waitForEvent('filechooser', {timeout: 10000}), (async () => { await d.page.getByText(/photo/i).locator('visible=true').first().click({timeout: 7000}); await d.page.waitForTimeout(700); const lib = d.page.getByText(/choose from|library/i).locator('visible=true').last(); if (await lib.isVisible().catch(() => false)) await lib.click(); })()]);
    await fc.setFiles([photo]); await d.page.waitForTimeout(3500);
    await d.shot('c3');
    await d.page.getByText(/Complete|Delivered|Mark.*done/i).locator('visible=true').last().click({timeout: 7000});
    await d.page.waitForTimeout(3500);
    await d.shot('c4');
    const r = await a.get(`delivery_tasks?select=*&id=eq.${state.delivery}`);
    return {ok: /done|complete|deliver/i.test(r[0]?.status || ''), note: r[0]?.status};
  }, 'driver');
};
