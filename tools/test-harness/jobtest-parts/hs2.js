// Rechecks after hs1's test mistakes, then HAVS, an inspection report, and the subcontractor as their company's admin.
const path = require('path');
module.exports = async ({as, step, state, keep, samples}) => {
  const a = await as('admin'), o = await as('op'), s = await as('sub');
  const J = state.regular, C = state.mc;
  const say = async (p) => (await p.text()).replace(/\s+/g, ' ').slice(0, 300);
  const scrollEnd = async (p) => { await p.page.evaluate(() => document.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 40) e.scrollTop = e.scrollHeight; })); await p.page.waitForTimeout(400); };

  await step('Induction: manager finds it under Completed', async () => {
    await a.go(`/sites/${C}/mc/inductions`, 5000);
    await a.tap('Completed Inductions', {wait: 1500});
    await a.shot('i5');
    return {ok: /andy op/i.test(await a.text()), note: await say(a)};
  });
  await step('Incident: manager reads what the operative sent', async () => {
    const r = await a.get(`incident_reports?select=id,detail,signed_at,incident_type&site_id=eq.${J}&order=created_at.desc&limit=1`);
    state.incident = r[0]?.id; keep();
    if (!r[0]) return {ok: false, note: 'no row'};
    await a.go(`/sites/${J}/hs/incidents/${state.incident}`);
    await a.shot('n5');
    return {ok: /slate slipped/.test(await a.text()) && !!r[0].signed_at, note: `${r[0].incident_type}, signed ${!!r[0].signed_at}`};
  });

  await step('HAVS: manager opens it and turns on a tool for the job', async () => {
    await a.go(`/sites/${J}/hs/havs`, 5000);
    await a.shot('h0');
    return {note: await say(a)};
  });
  await step('Report: manager sees the list of report types', async () => {
    await a.go(`/sites/${J}/mc/inspections`, 5000);
    await a.shot('r0');
    return {note: await say(a)};
  });

  await step('Subcontractor: manager makes them their company admin', async () => {
    await a.go(`/sites/${C}/mc/subcontractors/${state.subco}/operatives`, 5000);
    await a.shot('s0');
    const before = await say(a);
    const mk = a.page.getByText('Make admin', {exact: false}).locator('visible=true').first();
    if (await mk.isVisible().catch(() => false)) { await mk.click(); await a.page.waitForTimeout(3000); }
    await a.shot('s1');
    const r = await a.get(`subcontractor_operatives?select=is_admin,user_id&subcontractor_company_id=eq.${state.subco}`);
    return {ok: r.some((x) => x.is_admin), note: `${JSON.stringify(r.map((x) => x.is_admin))} | ${before}`};
  });
  await step('Subcontractor admin: what they see on their own folder', async () => {
    await s.go(`/sites/${C}/mc/subcontractors/${state.subco}`, 6000);
    await s.shot('s2');
    return {note: await say(s)};
  }, 'sub');
};
