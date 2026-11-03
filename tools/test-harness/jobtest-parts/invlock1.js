// Invoice lines lock once saved or issued, with a small Edit lines link. Sandbox's ZZ JOB Fin C only; makes one draft invoice, saves and deletes it. The issued check changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  await a.page.setViewportSize({width: 1440, height: 900});
  const boxes = () => a.page.locator('textarea:visible, input:visible').evaluateAll((els) => els.filter((e) => ['Description', '0.00'].includes(e.placeholder || '')).length);
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  let id;
  await step('New draft: lines open; Save draft locks them', async () => {
    await a.go('/fin/job/' + J.id + '/invoice/new', 9000); await a.page.waitForTimeout(3500); id = new URL(a.page.url()).pathname.split('/').pop();
    const open = await boxes();
    await a.page.getByPlaceholder('Description').first().fill('ZZ test line'); await a.page.getByPlaceholder('0.00', {exact: true}).first().fill('100');
    await q('Save Draft').first().click({timeout: 5000}); await a.page.waitForTimeout(2500); await a.shot('saved');
    const after = await boxes(), link = await q('Edit lines').count();
    return {ok: open === 2 && after === 0 && link === 1, note: 'open ' + open + ', after save ' + after + ', edit link ' + link};
  });
  await step('Edit lines opens them again', async () => {
    await q('Edit lines').first().click({timeout: 5000}); await a.page.waitForTimeout(500);
    const n = await boxes();
    await a.page.getByLabel('Delete draft').first().click({timeout: 5000}); await a.page.waitForTimeout(800); await q('Delete').last().click({timeout: 5000}); await a.page.waitForTimeout(2000);
    const left = await a.get('fin_invoices?select=id&id=eq.' + id);
    return {ok: n === 2 && left.length === 0, note: 'boxes ' + n + ', test draft deleted ' + (left.length === 0)};
  });
  const [i] = await a.get('fin_invoices?select=id,site_id&status=in.(issued,sent,part_paid,paid)&order=created_at.desc&limit=1');
  await step('Issued: locked, Edit lines warns about Xero, Cancel leaves it', async () => {
    if (!i) return {ok: true, note: 'no issued invoice in Sandbox'};
    await a.go('/fin/job/' + i.site_id + '/invoice/' + i.id, 8000); await a.page.waitForTimeout(3500);
    const before = await boxes();
    await q('Edit lines').first().click({timeout: 5000}); await a.page.waitForTimeout(600); await a.shot('issued-ask');
    const warned = await a.page.getByText(/re-posted to Xero/).locator('visible=true').count();
    await q('Edit lines').last().click({timeout: 5000}); await a.page.waitForTimeout(600); await a.shot('issued-edit');
    const open = await boxes();
    await q('Cancel').first().click({timeout: 5000}); await a.page.waitForTimeout(400);
    return {ok: before === 0 && warned >= 1 && open >= 1 && (await boxes()) === 0, note: 'before ' + before + ', warned ' + warned + ', open ' + open};
  });
};
