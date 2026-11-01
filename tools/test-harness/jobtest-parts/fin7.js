// Yard moves retried by pressing the drop-down itself, then the admin items that only read or put back.
module.exports = async ({as, step, state, keep}) => {
  const a = await as('admin');
  const say = async (n = 400) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const stock = async () => Number((await a.get(`yard_stock?select=qty&id=eq.${state.yard}`))[0].qty);
  const openDrop = async (nth) => { await a.page.getByText(/^Choose…/).locator('visible=true').nth(nth).click({timeout: 7000}); await a.page.waitForTimeout(900); };
  const move = async (btn, qtyLabel, qty, saveL, job) => {
    await a.go('/fin/yard', 5000);
    await a.tap(btn, {wait: 800});
    await openDrop(0);
    await a.shot('menu-' + qty);
    await a.page.getByText(/ZZ Code 4 lead/).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(500);
    await a.field(qtyLabel, String(qty));
    if (job) { await openDrop(0); await a.shot('menuj-' + qty); await a.page.getByText(/ZZ JOB Fin A/).locator('visible=true').last().click({timeout: 7000}); await a.page.waitForTimeout(500); }
    await a.shot('yard-' + qty);
    await a.tap(saveL, {wait: 3000});
    return stock();
  };
  await step('Yard: issue 3 to the job = 12', async () => { const q = await move('⬆ Issue to a job', 'Qty', 3, 'Issue to job', true); return {ok: q === 12, note: String(q)}; });
  await step('Yard: return 1 = 13', async () => { const q = await move('↩ Return from a job', 'Qty', 1, 'Return to yard', true); return {ok: q === 13, note: String(q)}; });
  await step('Yard: count to 20', async () => { const q = await move('Adjust a count', 'Counted qty (what’s actually there)', 20, 'Save count', false); return {ok: q === 20, note: String(q)}; });
  await step('Costs ledger: yard 3 x 5 less 1 x 5 = 10 on the job', async () => {
    await a.go(`/fin/job/${state.finA}/costs`, 5000);
    await a.shot('costs');
    const t = await say(2500);
    const m = await a.get(`yard_moves?select=kind,qty&stock_id=eq.${state.yard}`);
    return {ok: /ZZ Code 4 lead/.test(t), note: `${JSON.stringify(m)} ${(t.match(/.{30}ZZ Code 4 lead.{90}/g) || []).join(' | ').slice(0, 300)}`};
  });
};
