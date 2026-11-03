// Draft invoice: client details read as text with a pencil, tap to change, filled from the Directory. Looks at the newest
// Sandbox draft invoice without saving.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  await a.page.setViewportSize({width: 430, height: 932});
  const [d] = await a.get('fin_invoices?select=id,site_id,bill_name,bill_address&status=eq.draft&order=created_at.desc&limit=1');
  await step('Closed client details, tap to change', async () => {
    await a.go('/fin/job/' + d.site_id + '/invoice/' + d.id, 8000); await a.page.waitForTimeout(4000); await a.shot('closed');
    const closed = await a.page.getByLabel('Change bill to').count() + await a.page.getByLabel('Change billing address').count() + await a.page.getByLabel('Change accounts email').count();
    const boxesBefore = await a.page.locator('input:visible, textarea:visible').count();
    await a.page.getByLabel('Change billing address').click(); await a.page.waitForTimeout(400); await a.shot('open');
    const boxesAfter = await a.page.locator('input:visible, textarea:visible').count();
    const shown = await a.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600));
    return {ok: closed === 3 && boxesAfter === boxesBefore + 1, note: 'closed ' + closed + ', boxes ' + boxesBefore + ' > ' + boxesAfter + ' | ' + (shown.match(/Bill to.{0,90}/) || [''])[0]};
  });
};
