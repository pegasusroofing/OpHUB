// The application's buttons: same height, Delete red and narrow. Sandbox's ZZ JOB Fin C. Changes nothing.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const q = (x) => a.page.getByText(x, {exact: true}).locator('visible=true');
  const [J] = await a.get('sites?select=id&name=eq.ZZ%20JOB%20Fin%20C&limit=1');
  await a.page.setViewportSize({width: 1440, height: 900});
  const [app] = await a.get('fin_applications?select=id&site_id=eq.' + J.id + '&status=eq.submitted&cert_net=is.null&order=number.desc&limit=1');
  await step('Delete is red, narrow and the same height', async () => {
    await a.go('/fin/job/' + J.id + '/application/' + app.id, 8000); await a.page.waitForTimeout(3500); await a.shot('buttons');
    const box = (t) => q(t).first().evaluate((e) => { let p = e; while (p && p.getAttribute('role') !== 'button') p = p.parentElement; const r = p.getBoundingClientRect(); return {h: Math.round(r.height), w: Math.round(r.width), bg: getComputedStyle(p).backgroundColor}; });
    const d = await box('Delete'), e = await box('Export Excel');
    return {ok: d.h === e.h && d.w < e.w && d.bg !== e.bg, note: JSON.stringify({d, e})};
  });
};
