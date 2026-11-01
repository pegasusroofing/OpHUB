// Button style A (Andy, 1 Nov) seen on Sandbox: Project Admin in Finance, a job's Materials page in Projects, the Projects list. Read only.
module.exports = async ({as, step}) => {
  const a = await as('admin');
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {}); };
  const [J] = await a.get(`sites?select=id&name=like.ZZ%20JOB%20Fin*&limit=1`);
  const probe = async () => a.page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('[role=button]')).filter((b) => /^(Edit|Save|Change|\+ New|Full Summary|Add)/i.test((b.textContent || '').trim()));
    return btns.slice(0, 6).map((b) => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b); return { t: (b.textContent || '').trim().slice(0, 18), h: Math.round(r.height), bg: cs.backgroundColor, tt: getComputedStyle(b.querySelector('div,span') || b).textTransform }; });
  });
  await a.page.setViewportSize({width: 1440, height: 800});
  await step('Project Admin: buttons short, filled or grey, normal case', async () => {
    await a.go(`/fin/job/${J.id}?tab=setup`, 6000); await clear(); await a.page.waitForTimeout(1500); await a.shot('admin');
    const p = await probe();
    return {ok: p.length > 0 && p.every((x) => x.h <= 36 && x.tt !== 'uppercase'), note: JSON.stringify(p).slice(0, 300)};
  });
  await step('Projects list: + New project filled in the company colour', async () => {
    await a.go('/fin/jobs', 6000); await clear(); await a.page.waitForTimeout(1500); await a.shot('jobs');
    const p = await probe();
    return {ok: p.some((x) => /New project/i.test(x.t) && x.h <= 36 && !/rgb\(255, 255, 255\)/.test(x.bg)), note: JSON.stringify(p).slice(0, 200)};
  });
  await step('A job page in Projects (Materials): same look', async () => {
    const [S] = await a.get(`sites?select=id&status=eq.active&limit=1`);
    await a.go(`/sites/${S.id}/materials`, 6000); await clear(); await a.page.waitForTimeout(2000); await a.shot('materials');
    const p = await probe();
    return {ok: true, note: JSON.stringify(p).slice(0, 240)};
  });
};
