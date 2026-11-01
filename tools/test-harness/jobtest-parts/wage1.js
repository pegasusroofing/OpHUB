// Labour and wages from Finance onto a job's price, on Sandbox. Admin saves an operative invoice, books one job to a price and
// week, and the week's booked-in amount follows. Changing the invoice follows through; voiding takes it off. PM books from the Price tile.
module.exports = async ({as, step, state, keep}) => {
  const a = await as('admin');
  const clear = async (p = a) => { await p.page.getByText(/^not now$/i).locator('visible=true').first().click({timeout: 1200}).catch(() => {}); };
  const [A, B] = await a.get(`sites?select=id,name,job_number,start_date&name=like.ZZ%20JOB%20Fin*&limit=2`);
  const W = '2026-10-26', stamp = Date.now() % 100000;
  const el = (await a.get(`pricing_elements?select=id,name,closed&site_id=eq.${A.id}&closed=eq.false&limit=1`))[0];
  state.wageEl = el?.id; keep();
  const week = async (e, wk) => (await a.get(`price_weeks?select=amount&element_id=eq.${e}&week_number=eq.${wk}`))[0]?.amount;
  const pushes = (id) => a.get(`wage_pushes?select=*&src_key=like.pay%7C${id}%7C*`);

  await step('Set-up: job has a price to book to', async () => ({ok: !!el, note: el ? el.name : 'No open price on the first ZZ JOB Fin job: add one in its Price tile'}));
  await step('Operative invoice for two jobs: each waits to be booked', async () => {
    await a.go('/fin/labour/new', 5000); await clear();
    await a.page.getByText(/Choose who/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(800);
    const who = (await a.get(`fin_labour_rates?select=name,trading_name,user_id,pay_type,active&pay_type=neq.paye&limit=20`)).filter((x) => x.active !== false && !x.user_id)[0];
    await a.page.getByText(who?.trading_name || who?.name || /ZZ/).locator('visible=true').last().click({timeout: 5000}); await a.page.waitForTimeout(600);
    const pick = async (i, job) => { await a.page.getByText(/Choose the job/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(800); await a.page.getByText(new RegExp(job.job_number)).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(500); await a.page.getByPlaceholder('£').nth(i).fill(i ? '100' : '250'); };
    await pick(0, A);
    await a.page.getByText(/\+ Another job/i).locator('visible=true').first().click();
    await a.page.waitForTimeout(400);
    await pick(1, B);
    await a.shot('n1');
    await a.page.getByText(/Save — ready for the pay run/i).locator('visible=true').first().click({timeout: 6000});
    await a.page.waitForTimeout(6000);
    await a.shot('n2');
    const id = (new URL(a.page.url()).pathname.match(/labour\/([0-9a-f-]{36})/) || [])[1];
    state.wageInv = id; keep();
    const r = id ? await pushes(id) : [];
    return {ok: r.length === 2 && r.every((x) => x.status === 'pending') && r.some((x) => x.site_id === A.id && Number(x.amount) === 250), note: `${id || 'stayed on new'} ${JSON.stringify(r.map((x) => [x.status, x.amount]))}`};
  });
  await step('Book one job to a price and week from the invoice: the booked-in amount follows', async () => {
    const before = Number(await week(el.id, 1) || 0);
    const t = await a.text(), from = t.search(/BOOK TO A PRICE SHEET/i);
    const row = a.page.getByText(/^Book to a price…$/i).locator('visible=true').nth(t.indexOf(A.job_number, from) < t.indexOf(B.job_number, from) ? 0 : 1);
    await row.click({timeout: 6000}); await a.page.waitForTimeout(800);
    await a.shot('b1');
    const many = await a.page.getByText(/^Which price\?/).count();
    if (many) { await a.page.getByText(new RegExp(el.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).locator('visible=true').last().click({timeout: 5000}); await a.page.waitForTimeout(800); }
    await a.shot('b2');
    await a.page.getByText(/^(✓ )?Week 1\b/).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(3000);
    await a.shot('b3');
    const p = (await pushes(state.wageInv)).find((x) => x.status === 'price');
    state.wageBefore = before; state.wagePush = p?.id; state.wageSite = p?.site_id; keep();
    const eid = p?.element_id, sheet = eid ? (await a.get(`price_builder_sheets?select=id&pricing_element_id=eq.${eid}&limit=1`)).length : 0;
    const e = p?.price_entry_id ? (await a.get(`price_week_operative_entries?select=amount,kind,week_number&id=eq.${p.price_entry_id}`))[0] : null;
    const now = Number(await week(eid, 1) || 0);
    return {ok: !!p && Number(e?.amount) === Number(p.amount) && now >= Number(p.amount) && now > before, note: `${JSON.stringify(e)} week now ${await week(eid, 1)} sheet ${sheet}`};
  });
  await step('Other job costs: the second job goes there', async () => {
    await a.page.getByText(/^Other job costs$/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(2500);
    const r = await pushes(state.wageInv);
    return {ok: r.some((x) => x.status === 'general') && r.some((x) => x.status === 'price'), note: JSON.stringify(r.map((x) => x.status))};
  });
  await step('Finance > Wages to book: tab shows, PAYE button answers', async () => {
    await a.go('/fin/subs?tab=wages', 5000); await clear(); await a.shot('w1');
    await a.page.getByText(/Bring in PAYE wages/i).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(3000);
    await a.shot('w2');
    return {note: (await a.text()).replace(/\s+/g, ' ').slice(0, 260)};
  });
  await step('Void the invoice: comes off the price, nothing left counted', async () => {
    await a.go(`/fin/labour/${state.wageInv}`, 5000); await clear();
    await a.page.getByText(/Void this invoice/i).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(700);
    await a.page.getByText(/^Void$/i).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(4000);
    const r = await pushes(state.wageInv);
    const w = await week(el.id, 1);
    return {ok: r.every((x) => x.status === 'withdrawn' || x.status === 'general' || x.amount === 0) && r.filter((x) => x.price_entry_id).length === 0 && Number(w || 0) === Number(state.wageBefore || 0), note: `${JSON.stringify(r.map((x) => [x.status, x.amount]))} week ${w} before ${state.wageBefore}`};
  });
};
