// Invoice line: £ in the amount box, red when below nought, a sales code button that saves. Sandbox's ZZ JOB Fin C; makes one draft and deletes it.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  await a.page.setViewportSize({width: 430, height: 932});
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  let id;
  await step('£ box, red minus, sales code saved with the line', async () => {
    await a.go('/fin/job/' + J.id + '/invoice/new', 9000); await a.page.waitForTimeout(4000); id = new URL(a.page.url()).pathname.split('/').pop();
    await a.page.getByPlaceholder('Description').first().fill('ZZ code test');
    const amt = a.page.getByLabel('Line 1 amount'); await amt.fill('-50'); await a.page.waitForTimeout(300);
    const colour = await amt.evaluate((e) => getComputedStyle(e).color);
    await a.page.getByLabel('Sales code').first().click(); await a.page.waitForTimeout(400); await q('Type another code…').first().click(); await a.page.waitForTimeout(400);
    await a.page.getByPlaceholder(/^\d+$/).last().fill('215'); await q('Save').last().click(); await a.page.waitForTimeout(400); await a.shot('line');
    await q('Save Draft').first().click(); await a.page.waitForTimeout(2500);
    const [r] = await a.get('fin_invoices?select=lines&id=eq.' + id);
    return {ok: colour === 'rgb(192, 57, 43)' && r.lines[0].account === '215' && Number(r.lines[0].amount) === -50, note: 'colour ' + colour + ', saved ' + JSON.stringify(r.lines[0])};
  });
  await step('Locked view: red total, then delete the test draft', async () => {
    await a.shot('locked');
    const red = await a.page.evaluate(() => [...document.querySelectorAll('div')].filter((e) => /^−£50\.00$/.test(e.innerText) && getComputedStyle(e).color === 'rgb(192, 57, 43)').length);
    await a.page.getByLabel('Delete draft').first().click(); await a.page.waitForTimeout(600); await q('Delete').last().click(); await a.page.waitForTimeout(2000);
    const left = await a.get('fin_invoices?select=id&id=eq.' + id);
    return {ok: red >= 1 && left.length === 0, note: 'red figures ' + red + ', deleted ' + (left.length === 0)};
  });
};
