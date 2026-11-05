// Finance <-> Projects links put back on 1 Nov, clicked on Sandbox: the PO's site contact and supplier VAT, the project manager
// from Finance, sending an invoice to a PM. Then a Finance Controller (the Sandbox PM login, flagged for this test only by SQL around the run).
module.exports = async ({as, step, state}) => {
  const a = await as(process.env.MAIN || 'admin');
  const clear = async () => { await a.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 800}).catch(() => {}); };
  const url = () => new URL(a.page.url()).pathname;
  if (process.env.MAIN === 'pm') {
    await step('Finance Controller: Home goes to Finance', async () => { await a.go('/home', 5000); await a.page.waitForTimeout(1500); await a.shot('fc1'); return {ok: url().startsWith('/fin'), note: url()}; });
    await step('Finance Controller: Projects is shut', async () => { await a.go('/sites', 5000); await a.page.waitForTimeout(1500); return {ok: url().startsWith('/fin'), note: url()}; });
    await step('Finance Controller: a job page is shut', async () => { await a.go(`/sites/${state.regular}/materials`, 5000); await a.page.waitForTimeout(1500); return {ok: url().startsWith('/fin'), note: url()}; });
    await step('Finance Controller: Admin is shut', async () => { await a.go('/pm/admin', 5000); await a.page.waitForTimeout(1500); return {ok: url().startsWith('/fin'), note: url()}; });
    await step('Finance Controller: Finance works, wages tab shows', async () => { await a.go('/fin/subs?tab=wages', 5000); await a.shot('fc2'); return {ok: /Wages to book/i.test(await a.text()), note: url()}; });
    return;
  }
  const [J] = await a.get(`sites?select=id,job_number,name,responsible_pm_id&name=like.ZZ%20JOB%20Fin*&limit=1`);
  await step('L36 + L39: site contact saved on the PO, and on its notes', async () => {
    const stamp = Date.now() % 100000;
    await a.go(`/fin/po/new?site=${J.id}`, 5000); await clear();
    const f = (ph) => a.page.getByPlaceholder(ph).locator('visible=true').first();
    await f(/Type to find a supplier/).fill(`SUPPLIER ZZ Reader Roofing Ltd`); await a.page.waitForTimeout(700);
    await f(/Start typing a name/).fill('ZZ Contact'); await a.page.waitForTimeout(300);
    await f(/Item|Description/i).fill(`ZZ link test ${stamp}`).catch(() => {});
    await a.shot('po1');
    await a.page.getByText(/raise|create po/i).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(1500);
    const stopped = /contact number/i.test(await a.text());
    await a.page.locator('[aria-label="Contact number"]').first().fill('07000 000000');
    await a.page.getByText(/raise|create po/i).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(5000);
    await a.shot('po2');
    const id = (url().match(/po\/([0-9a-f-]{36})/) || [])[1];
    const po = id ? (await a.get(`purchase_orders?select=site_contact,site_contact_phone,note&id=eq.${id}`))[0] : null;
    return {ok: stopped && po?.site_contact === 'ZZ Contact' && /07000/.test(po?.note || ''), note: JSON.stringify(po) + ` stopped without number: ${stopped}`};
  });
  await step('L05: project manager changed from Finance reaches Projects', async () => {
    await a.go(`/fin/job/${J.id}?tab=setup`, 6000); await clear(); await a.shot('pm1');
    return {note: /Project manager|Edit/.test(await a.text()) ? 'Project Admin open' : 'not seen'};
  });
  await step('L73: unallocated invoice sent to a PM', async () => {
    const it = (await a.get(`fin_inbox?select=id&status=eq.new&limit=1`))[0];
    if (!it) return {note: 'no unallocated invoice left to try'};
    await a.go(`/fin/inbox/${it.id}`, 5000); await clear();
    await a.page.getByText(/Send to a PM to book/i).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(800); await a.shot('in1');
    await a.page.getByText(/pm/i).locator('visible=true').last().click({timeout: 5000}); await a.page.waitForTimeout(2000);
    const r = (await a.get(`fin_inbox?select=stage,assigned_pm&id=eq.${it.id}`))[0];
    return {ok: r?.stage === 'with_pm' && !!r.assigned_pm, note: JSON.stringify(r)};
  });
};
