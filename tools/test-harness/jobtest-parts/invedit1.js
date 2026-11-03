// Draft invoice from a certificate on a phone: Edit lines keeps Save draft and Issue. Sandbox's ZZ JOB Fin C; nothing saved.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  await a.page.setViewportSize({width: 430, height: 932});
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  const [d] = await a.get('fin_invoices?select=id,site_id&source=eq.certificate&status=eq.draft&site_id=eq.' + J.id + '&order=created_at.desc&limit=1');
  await step('Edit lines on a phone', async () => {
    if (!d) return {ok: false, note: 'no draft certificate invoice on Fin C'};
    await a.go('/fin/job/' + d.site_id + '/invoice/' + d.id, 8000); await a.page.waitForTimeout(4000); await a.shot('before');
    const b1 = await q('Save Draft').count() + await q('Issue Invoice').count();
    await q('Edit lines').first().click({timeout: 8000}); await a.page.waitForTimeout(1200); await a.shot('after');
    await a.page.getByText('Notes on the invoice', {exact: true}).locator('visible=true').first().scrollIntoViewIfNeeded(); await a.page.waitForTimeout(600); await a.shot('after-bottom');
    const sc = await a.page.evaluate(() => [...document.querySelectorAll('div')].filter((e) => e.scrollHeight > e.clientHeight + 40 && getComputedStyle(e).overflowY !== 'visible').map((e) => e.scrollTop + '/' + e.scrollHeight + '/' + e.clientHeight).join(' '));
    const b2 = await q('Save Draft').count() + await q('Issue Invoice').count();
    const errs = await a.page.evaluate(() => document.body.innerText.slice(0, 300));
    return {ok: b1 === 2 && b2 === 2, note: 'buttons before ' + b1 + ', after ' + b2 + ' | scrollers ' + sc + ' | ' + errs.replace(/\s+/g, ' ').slice(0, 120)};
  });
};
