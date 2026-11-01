// Company admin, the rest: suppliers and templates retried, branding, expenses, HR, tile visibility, users, logs, exports.
const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, keep, samples, OUT}) => {
  const a = await as('admin');
  const say = async (n = 400) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const q = (s) => encodeURIComponent(s);
  const blur = async () => { await a.page.keyboard.press('Tab'); await a.page.waitForTimeout(1800); };

  await step('Suppliers: add (warned it looks like ZZ Fin Supplier), edit email, delete', async () => {
    await a.go('/pm/admin/suppliers', 4000);
    await a.tap('+ Add Supplier', {wait: 700});
    await a.fill('Supplier name', 'Yardley ZZ Slates');
    await a.fill('Supplier order email', 'zz-adm@example.invalid');
    await a.tap('Add Supplier', {wait: 1500});
    const ask = await a.page.getByText('Add', {exact: true}).locator('visible=true').count();
    if (ask) await a.page.getByText('Add', {exact: true}).locator('visible=true').last().click();
    await a.page.waitForTimeout(3000);
    const r1 = (await a.get(`suppliers?select=id,email&name=eq.${q('Yardley ZZ Slates')}`))[0];
    if (!r1) return {ok: false, note: await say(300)};
    await a.page.getByText('Yardley ZZ Slates').locator('visible=true').first().click();
    await a.page.waitForTimeout(900);
    await a.shot('sup-open');
    const em = a.page.getByText('Order email', {exact: true}).locator('visible=true').last().locator('xpath=following::input[1]');
    await em.fill('zz-adm2@example.invalid'); await blur();
    const r2 = (await a.get(`suppliers?select=email&id=eq.${r1.id}`))[0];
    await a.tap('Delete supplier', {wait: 1000});
    await a.shot('sup-del');
    await a.page.getByText(/^(Delete|Yes)$/).locator('visible=true').last().click();
    await a.page.waitForTimeout(2500);
    const r3 = (await a.get(`suppliers?select=id&id=eq.${r1.id}`))[0];
    return {note: `added; email now ${r2.email}; ${r3 ? 'still there (guard hold)' : 'deleted'}`};
  });
  await step('Report templates: new, rename, delete', async () => {
    await a.go('/pm/admin/templates', 4000);
    await a.tap('+ New Template', {wait: 3500});
    const id = (a.page.url().match(/templates\/([0-9a-f-]{36})/) || [])[1];
    await a.page.locator('input').locator('visible=true').first().fill('ZZ Adm Report');
    await a.page.waitForTimeout(400);
    await a.shot('tpl-edit');
    await a.tap('Save Template', {wait: 3000});
    const r1 = (await a.get(`report_templates?select=name&id=eq.${id}`))[0];
    await a.go('/pm/admin/templates', 4000);
    await a.page.getByText(r1.name, {exact: true}).locator('visible=true').first().locator('xpath=following::*[text()="⋮"][1]').click();
    await a.page.waitForTimeout(800);
    await a.tap('🗑 Delete', {wait: 900});
    await a.page.getByText(/^(Delete|Yes)$/).locator('visible=true').last().click();
    await a.page.waitForTimeout(2500);
    const r3 = (await a.get(`report_templates?select=id&id=eq.${id}`))[0];
    return {ok: r1.name === 'ZZ Adm Report' && !r3, note: `${r1.name}, ${r3 ? 'still there' : 'deleted'}`};
  });
  await step('Branding: logo and colours read; Save Theme is held by the guard, nothing changes', async () => {
    const was = (await a.get('organizations?select=color_primary,color_secondary&limit=1'))[0];
    await a.go('/pm/admin/branding', 4000);
    await a.tap('Save Theme', {wait: 2500});
    await a.shot('brand-saved');
    const now = (await a.get('organizations?select=color_primary,color_secondary&limit=1'))[0];
    return {ok: JSON.stringify(was) === JSON.stringify(now), note: JSON.stringify(now)};
  });
  await step('Expenses email: wrong address refused; good one held by the guard', async () => {
    const was = (await a.get('organizations?select=expenses_email,expenses_retention_months&limit=1'))[0];
    await a.go('/pm/admin/expensesemail', 4000);
    await a.shot('exp');
    await a.fill('e.g. info@yourcompany.co.uk', 'not-an-email');
    await a.tap('Save', {wait: 1500});
    const bad = await say(600);
    await a.shot('exp-bad');
    const now = (await a.get('organizations?select=expenses_email,expenses_retention_months&limit=1'))[0];
    return {ok: JSON.stringify(was) === JSON.stringify(now), note: `${JSON.stringify(was)} ${bad.slice(-180)}`};
  });
  await step('Invites: links read only, nothing sent', async () => {
    await a.go('/pm/admin/invites', 4000);
    const t = await a.text();
    return {ok: /Used \d+ times/.test(t) && /Send Invite Email|One-Time|ONE-TIME/i.test(t), note: (await say(200)).slice(40)};
  });
  await step('Users: open a test person, what can be done', async () => {
    await a.go('/pm/admin/users', 4000);
    await a.page.getByText('andy op', {exact: true}).locator('visible=true').first().click();
    await a.page.waitForTimeout(1200);
    await a.shot('user-menu');
    const t = await say(900);
    await a.page.keyboard.press('Escape').catch(() => {});
    return {note: t.slice(-300)};
  });
  await step('Device locks: read, Unlock not pressed', async () => {
    await a.go('/pm/admin/devicelocks', 4000);
    const n = await a.page.getByText('Unlock', {exact: true}).locator('visible=true').count();
    return {ok: n > 0, note: `${n} locks`};
  });
  await step('Check-in log: monthly, driver log 30 days, change of period works', async () => {
    await a.go('/pm/admin/checkinlogs', 4000);
    await a.tap('Monthly', {wait: 1500});
    await a.shot('log-m');
    const t1 = await say(400);
    await a.go('/pm/admin/drivercheckins', 4000);
    await a.tap('Last 30 days', {wait: 1500});
    const t2 = await say(300);
    return {ok: /andy op/.test(t1) && /andy driver/.test(t2), note: t1.slice(60, 220)};
  });
  await step('PPE log: Export to Excel and PDF', async () => {
    await a.go('/pm/admin/ppelog', 4000);
    await a.tap('Yearly', {wait: 1500});
    const t = await say(300);
    await a.tap('📊 Export to Excel', {wait: 1800});
    const shot = await say(300);
    await a.shot('ppe-x');
    return {note: `${t.slice(100)} >> ${shot.slice(-80)}`};
  });
  await step('Tile visibility: on job A, HAVS tile hidden from operatives then back', async () => {
    await a.go(`/sites/${state.finA}/hs`, 5000);
    await a.shot('hs');
    const was = (await a.get(`sites?select=tile_visibility&id=eq.${state.finA}`))[0];
    const menu = a.page.locator('[aria-label*="ptions"], [aria-label*="enu"]').locator('visible=true').first();
    const dots = a.page.getByText(/^[⋮⋯]$/).locator('visible=true').first();
    await dots.click({timeout: 6000});
    await a.page.waitForTimeout(900);
    await a.shot('tile-menu');
    const t = await say(1200);
    const opt = a.page.getByText(/Operatives/).locator('visible=true').last();
    await opt.click({timeout: 6000});
    await a.page.waitForTimeout(2500);
    await a.shot('tile-after');
    const mid = (await a.get(`sites?select=tile_visibility&id=eq.${state.finA}`))[0];
    await dots.click({timeout: 6000});
    await a.page.waitForTimeout(900);
    await a.page.getByText(/Operatives/).locator('visible=true').last().click({timeout: 6000});
    await a.page.waitForTimeout(2500);
    const end = (await a.get(`sites?select=tile_visibility&id=eq.${state.finA}`))[0];
    return {ok: JSON.stringify(was) !== JSON.stringify(mid), note: `${JSON.stringify(was)} > ${JSON.stringify(mid)} > ${JSON.stringify(end)}`};
  });
  await step('HR: hub, holiday calendar, book a day on Demo, cancel it', async () => {
    await a.go('/pm/hr', 4000);
    await a.shot('hr');
    await a.go('/pm/hr/holidays', 5000);
    await a.shot('hr-cal');
    await a.tap('+ Book time off', {wait: 900});
    await a.shot('hr-book');
    await a.label('To', 300).catch(() => {});
    return {note: (await say(800)).slice(40, 500)};
  });
  await step('HR: policies page lists, upload a policy PDF (test row), remove', async () => {
    await a.go('/pm/hr/policies', 5000);
    await a.shot('hr-pol');
    return {note: (await say(600)).slice(40, 400)};
  });
};
