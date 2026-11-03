// The application's buttons: same order at each stage, Delete red, narrow and the same height. Sandbox's ZZ JOB Fin C. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  const order = async (names) => { const xs = []; for (const n of names) xs.push((await q(n).last().boundingBox()).x); return xs.every((x, i) => !i || x > xs[i - 1]); };
  const [app] = await a.get('fin_applications?select=id&site_id=eq.' + J.id + '&status=eq.submitted&cert_net=is.null&order=number.desc&limit=1');
  await step('Applied: Return To Draft, Export Excel, Certify, Delete; Delete red and same height', async () => {
    await a.go('/fin/job/' + J.id + '/application/' + app.id, 8000); await a.page.waitForTimeout(3500); await a.shot('buttons');
    const box = (t) => q(t).last().evaluate((e) => { let p = e; while (p && p.getAttribute('role') !== 'button') p = p.parentElement; const r = p.getBoundingClientRect(); return {h: Math.round(r.height), w: Math.round(r.width), bg: getComputedStyle(p).backgroundColor}; });
    const d = await box('Delete'), e = await box('Export Excel');
    const ok1 = await order(['Return To Draft', 'Export Excel', 'Certify', 'Delete']);
    return {ok: ok1 && d.h === e.h && d.w < e.w && d.bg !== e.bg, note: 'order ' + ok1 + ' ' + JSON.stringify({d, e})};
  });
  await step('Certifying: Back To The Application, Save Certificate, Save & Raise Invoice, Delete', async () => {
    await q('Certify').last().click({timeout: 5000}); await a.page.waitForTimeout(500); await q('Overview').last().click({timeout: 5000}); await a.page.waitForTimeout(800); await a.shot('certifying');
    const ok1 = await order(['Back To The Application', 'Save Certificate', 'Save & Raise Invoice', 'Delete']) && (await q('Certified As Applied').count()) === 0 && (await q('Raise And Issue The Invoice Now').count()) === 0;
    return {ok: ok1, note: 'order ' + ok1};
  });
};
