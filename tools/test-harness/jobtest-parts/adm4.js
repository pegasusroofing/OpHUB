// Company admin, last bits: tidy my own rows, tile visibility, a phone on a test person, booking leave, and the trail on Finance pages.
module.exports = async ({as, step, state, keep}) => {
  const a = await as('admin');
  const say = async (n = 400) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const q = (s) => encodeURIComponent(s);
  await step('Report templates: my spare ZZ Adm Report deleted', async () => {
    await a.go('/pm/admin/templates', 4000);
    await a.page.getByText('ZZ Adm Report', {exact: true}).locator('visible=true').first().locator('xpath=following::*[text()="⋮"][1]').click();
    await a.page.waitForTimeout(800);
    await a.tap('🗑 Delete', {wait: 900});
    await a.page.getByText(/^(Delete|Yes)$/).locator('visible=true').last().click();
    await a.page.waitForTimeout(2500);
    const r = await a.get(`report_templates?select=id&name=eq.${q('ZZ Adm Report')}`);
    return {ok: r.length === 0, note: `${r.length} left`};
  });
  await step('Suppliers: delete my supplier', async () => {
    await a.go('/pm/admin/suppliers', 4000);
    await a.page.getByText('Yardley ZZ Slates').locator('visible=true').first().click();
    await a.page.waitForTimeout(900);
    await a.tap('Delete supplier', {wait: 1000});
    await a.page.getByText('Remove', {exact: true}).locator('visible=true').last().click();
    await a.page.waitForTimeout(2500);
    const r = await a.get(`suppliers?select=id,email&name=eq.${q('Yardley ZZ Slates')}`);
    return {note: r.length ? `held by guard, row stays (${r[0].email})` : 'deleted'};
  });
  await step('Tile visibility: job A, RAMS tile for Delivery Drivers, then back', async () => {
    await a.go(`/sites/${state.finA}/hs`, 5000);
    const was = (await a.get(`sites?select=tile_visibility&id=eq.${state.finA}`))[0];
    const dots = a.page.locator('[aria-label^="Options"], [aria-label*="options"], [aria-label*="Who can see"], [aria-label*="More"]').locator('visible=true').first();
    await dots.click({timeout: 6000});
    await a.page.waitForTimeout(900);
    await a.shot('tile-menu');
    await a.page.getByText(/Delivery Drivers/).locator('visible=true').last().click({timeout: 6000});
    await a.page.waitForTimeout(2500);
    const mid = (await a.get(`sites?select=tile_visibility&id=eq.${state.finA}`))[0];
    await dots.click({timeout: 6000});
    await a.page.waitForTimeout(900);
    await a.page.getByText(/Delivery Drivers/).locator('visible=true').last().click({timeout: 6000});
    await a.page.waitForTimeout(2500);
    const end = (await a.get(`sites?select=tile_visibility&id=eq.${state.finA}`))[0];
    return {ok: JSON.stringify(was) !== JSON.stringify(mid) && JSON.stringify(end) === JSON.stringify(was), note: `${JSON.stringify(was.tile_visibility).slice(0, 80)} > ${JSON.stringify(mid.tile_visibility).slice(0, 120)}`};
  });
  await step('Users: phone added on test person andy op, then cleared', async () => {
    const wasP = (await a.get(`profiles?select=id,phone&email=eq.${q('andy.cramp+op@rtbroofinglimited.com')}`))[0];
    const go = async () => { await a.go('/pm/admin/users', 4000); await a.page.getByText('andy op', {exact: true}).locator('visible=true').first().click(); await a.page.waitForTimeout(1000); };
    await go();
    await a.page.getByText(/phone/i).locator('visible=true').last().click();
    await a.page.waitForTimeout(900);
    await a.shot('user-phone');
    const el = a.page.locator('input').locator('visible=true').last();
    await el.fill('07000000000');
    await a.page.getByText(/^(OK|Save)$/).locator('visible=true').last().click();
    await a.page.waitForTimeout(2500);
    const m = (await a.get(`profiles?select=phone&id=eq.${wasP.id}`))[0];
    await go();
    await a.page.getByText(/07000000000|phone/i).locator('visible=true').last().click();
    await a.page.waitForTimeout(900);
    await a.page.locator('input').locator('visible=true').last().fill(wasP.phone || '');
    await a.page.getByText(/^(OK|Save)$/).locator('visible=true').last().click();
    await a.page.waitForTimeout(2500);
    const e = (await a.get(`profiles?select=phone&id=eq.${wasP.id}`))[0];
    return {ok: m.phone === '07000000000' && (e.phone || '') === (wasP.phone || ''), note: `${wasP.phone} > ${m.phone} > ${e.phone}`};
  });
  await step('HR: admin books Monday 2 Nov for Demo, 1 day, shows in Requests', async () => {
    await a.go('/pm/hr/holidays', 5000);
    await a.tap('+ Book time off', {wait: 900});
    await a.label('From', 700);
    await a.label('2 Nov 2026', 700);
    await a.page.waitForTimeout(400);
    const t = await say(1200);
    await a.shot('hr-book2');
    await a.tap('Book it', {wait: 3000});
    await a.shot('hr-booked');
    const r = (await a.get('hr_leave?select=*&start_date=eq.2026-11-02&order=created_at.desc&limit=1'))[0];
    if (r) { state.leave = r.id; keep(); }
    return {ok: !!r, note: `${(t.match(/\d+ working day[^—]*/) || [''])[0]} row ${JSON.stringify(r).slice(0, 180)}`};
  });
  await step('Rate card: Excel download real', async () => {
    await a.go('/pm/admin/ratecard', 4000);
    await a.page.getByText(/Download as Excel/).locator('visible=true').first().click();
    await a.page.waitForTimeout(2000);
    const f = await a.saved(() => a.tap('⬇️ Download', {wait: 0}));
    return {ok: require('fs').readFileSync(f).subarray(0, 2).toString() === 'PK', note: require('path').basename(f)};
  });
  await step('Trail: PO, purchase invoice and operative invoice now say where they belong and go back', async () => {
    await a.go(`/fin/po/${state.po}`, 4500);
    await a.shot('crumb-po');
    const t = await say(120);
    await a.page.getByText('Purchases', {exact: true}).locator('visible=true').first().click();
    await a.page.waitForTimeout(2500);
    return {ok: /Finance › Purchases/.test(t) && /fin\/purchases/.test(a.page.url()), note: t.slice(0, 100)};
  });
};
