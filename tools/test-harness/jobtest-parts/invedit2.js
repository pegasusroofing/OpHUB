// Look only: Andy's ddf draft invoice on a phone, Edit lines, are the buttons still there? Nothing typed or saved.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  await a.page.setViewportSize({width: 430, height: 932});
  const [J] = await a.get('sites?select=id&job_number=eq.SBX-126&limit=1');
  await step('ddf invoice: Edit lines', async () => {
    await a.go('/fin/job/' + J.id + '/invoice/2a1b5b04-981b-43bf-a3d3-4e1a7b362d16', 8000); await a.page.waitForTimeout(4000); await a.shot('before');
    const b1 = await q('Save Draft').count() + await q('Issue Invoice').count();
    await q('Edit lines').first().click({timeout: 8000}); await a.page.waitForTimeout(1500); await a.shot('after');
    const b2 = await q('Save Draft').count() + await q('Issue Invoice').count();
    const txt = await a.page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400));
    return {ok: b1 === 2 && b2 === 2, note: 'before ' + b1 + ', after ' + b2 + ' | ' + txt.slice(150, 400)};
  });
};
