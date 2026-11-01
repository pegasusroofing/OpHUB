// One each of the new manager emails, sent for real as the PM, so only Sandbox's admin (+demo) receives them. EMAIL_TEST=1.
const path = require('path');
module.exports = async ({as, step, state, samples}) => {
  const a = await as('admin');
  const J = state.regular, C = state.mc, photo = path.join(samples, 'site-photo.jpg');
  const sent = async (site, kind) => (await a.get(`messages?select=id,email_details&site_id=eq.${site}&kind=eq.${kind}&order=created_at.desc&limit=1`))[0];

  await step('Email: material requested', async () => {
    await a.go(`/sites/${J}/materials/requests`, 5000);
    const add = a.page.getByText('+ Request materials').locator('visible=true').first();
    if (await add.isVisible().catch(() => false)) { await add.click(); await a.page.waitForTimeout(800); }
    await a.fill('Item', 'ZZ email test: 20 rolls of underlay');
    await a.page.getByText(/^(Add|Request|Submit|Send|Save)/).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(4000);
    const m = await sent(J, 'material_request');
    return {ok: !!m?.email_details?.rows, note: JSON.stringify(m?.email_details || {}).slice(0, 220)};
  });

  await step('Email: variation raised, with its marked-up photo', async () => {
    await a.go(`/sites/${J}/snagging/variations`, 5000);
    const [fc] = await Promise.all([a.page.waitForEvent('filechooser', {timeout: 12000}), (async () => {
      await a.page.getByText('📷 Tap to add a photo').locator('visible=true').first().click();
      await a.page.waitForTimeout(800);
      const lib = a.page.getByText(/choose from|library/i).locator('visible=true').last();
      if (await lib.isVisible().catch(() => false)) await lib.click();
    })()]);
    await fc.setFiles([photo]);
    await a.page.waitForTimeout(3000);
    const box = await a.page.viewportSize();
    await a.page.mouse.move(120, box.height / 2); await a.page.mouse.down(); await a.page.mouse.move(260, box.height / 2 + 40, {steps: 6}); await a.page.mouse.up();
    await a.page.waitForTimeout(300);
    await a.page.getByText(/^(Save|💾 Save|✓ Save)/).locator('visible=true').last().click({timeout: 6000});
    await a.page.waitForTimeout(2500);
    await a.fill("What's changed and why...", 'ZZ email test: extra lead to the chimney');
    await a.tap('Submit Variation', {wait: 5000});
    const m = await sent(J, 'variation');
    return {ok: (m?.email_details?.photos || []).length === 1, note: JSON.stringify(m?.email_details || {}).slice(0, 220)};
  });

  await step('Email: permit issued, with the permit attached', async () => {
    await a.go(`/sites/${C}/mc/permits`, 4500);
    await a.tap('+ Issue Permit');
    await a.page.getByText('ZZ Subbie Ltd', {exact: true}).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(800);
    await a.page.getByText(/☐ andy subbie/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(300);
    await a.fill('e.g. Hot works to re-felt the plant room roof', 'ZZ email test: torch-on to the plant room');
    await a.page.getByText('Issue Permit', {exact: true}).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(9000);
    const m = await sent(C, 'permit_issued');
    return {ok: (m?.email_details?.attachments || []).length === 1, note: JSON.stringify(m?.email_details || {}).slice(0, 220)};
  });
};
