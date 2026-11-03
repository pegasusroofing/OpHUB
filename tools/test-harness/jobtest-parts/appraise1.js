// Save & Raise Invoice opens the new draft invoice. Sandbox's ZZ JOB Fin C only; makes one application with money due, certifies it and makes one draft invoice.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  let id;
  await step('Save & Raise Invoice goes to the draft invoice', async () => {
    const [last] = await a.get('fin_applications?select=id,status,cert_net&site_id=eq.' + J.id + '&order=number.desc&limit=1');
    if (last && last.status === 'submitted' && last.cert_net == null) { await a.go('/fin/job/' + J.id + '/application/' + last.id, 8000); await a.page.waitForTimeout(3000); await q('Return To Draft').last().click({timeout: 5000}); await a.page.waitForTimeout(800); await q('Return to draft').last().click({timeout: 5000}); await a.page.waitForTimeout(3000); id = last.id; }
    else if (last && last.status === 'draft') id = last.id;
    else { await a.go('/fin/job/' + J.id + '/application/new', 9000); await a.page.waitForTimeout(3500); id = new URL(a.page.url()).pathname.split('/').pop(); }
    await a.go('/fin/job/' + J.id + '/application/' + id, 8000); await a.page.waitForTimeout(3500);
    await q('Line By Line').first().click({timeout: 5000}); await a.page.waitForTimeout(500);
    await q('Set All To 100%').first().click({timeout: 5000}); await a.page.waitForTimeout(3500);
    await q('Mark As Applied').first().click({timeout: 5000}); await a.page.waitForTimeout(1500);
    await q('Mark As Applied').last().click({timeout: 5000}); await a.page.waitForTimeout(3500);
    await q('Certify').last().click({timeout: 5000}); await a.page.waitForTimeout(600);
    await q('Certified As Applied').first().click({timeout: 5000}); await a.page.waitForTimeout(500);
    await q('Overview').last().click({timeout: 5000}); await a.page.waitForTimeout(800); await a.shot('before');
    await q('Save & Raise Invoice').first().click({timeout: 5000}); await a.page.waitForTimeout(7000); await a.shot('invoice');
    const url = a.page.url(), [r] = await a.get('fin_applications?select=status,invoice_id,cert_net&id=eq.' + id);
    const [inv] = r.invoice_id ? await a.get('fin_invoices?select=status&id=eq.' + r.invoice_id) : [{}];
    return {ok: !!r.invoice_id && url.includes('/invoice/' + r.invoice_id) && inv.status === 'draft', note: url.split('/fin/')[1] + ' ' + inv.status + ' net ' + r.cert_net};
  });
};
