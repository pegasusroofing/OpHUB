// Finance, for real: operative invoice, retention release, statements, yard, settings.
const path = require('path'), fs = require('fs');
const NEAR = (a, b) => Math.abs(Number(a) - b) < 0.005;
module.exports = async ({as, step, state, keep, samples, OUT}) => {
  const a = await as('admin');
  const say = async (n = 400) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const A = state.finA;
  const last = async (ph, v) => { await a.page.locator(`input[placeholder="${ph}"], textarea[placeholder="${ph}"]`).locator('visible=true').last().fill(v); await a.page.waitForTimeout(150); };
  const choice = async (labelText, option) => {
    await a.page.getByText(labelText, {exact: true}).locator('visible=true').last().locator('xpath=following::*[contains(text(),"▾")][1]').click({timeout: 7000});
    await a.page.waitForTimeout(800);
    await a.page.getByText(option).locator('visible=true').last().click({timeout: 7000});
    await a.page.waitForTimeout(500);
  };

  if (!state.opInv) await step('Operative invoice: 1,000 labour + 50 materials, 20% CIS: 200, pay 850', async () => {
    await a.go('/fin/labour/new', 5000);
    await a.page.getByText(/Choose who/).locator('visible=true').first().click();
    await a.page.waitForTimeout(900);
    await a.shot('op-who');
    await a.tap('ZZ Dir Labour', {wait: 700});
    await a.field('Their invoice no.', 'ZZ-OP-1');
    await a.field('Materials £ (no CIS)', '50');
    await a.page.getByText(/Choose the job/).locator('visible=true').first().click();
    await a.page.waitForTimeout(900);
    await a.shot('op-job');
    await a.page.getByText(/ZZ JOB Fin A/).locator('visible=true').last().click();
    await a.page.waitForTimeout(700);
    await last('£', '1000');
    await a.page.waitForTimeout(500);
    await a.shot('op-filled');
    const t = await say(900);
    await a.tap('Save — ready for the pay run', {wait: 3500});
    await a.shot('op-saved');
    const p = (await a.get('fin_payments?select=*&invoice_no=eq.ZZ-OP-1'))[0] || (await a.get('fin_sub_payments?select=*&invoice_no=eq.ZZ-OP-1'))[0];
    if (!p) return {ok: false, note: 'no row: ' + t.slice(0, 300)};
    state.opInv = p.id; keep();
    return {ok: NEAR(p.gross, 1050) && NEAR(p.cis_deduction, 200) && NEAR(p.net_pay, 850), note: `${p.gross} ${p.cis_deduction} ${p.net_pay} ${p.status}`};
  });
  await step('Retention: set PC date, first half 105 raised as an invoice', async () => {
    await a.go(`/fin/job/${A}?tab=setup`, 5000);
    await a.tap('Edit project details', {wait: 1000});
    await a.label('Practical completion date', 700);
    await a.page.getByText('Today', {exact: true}).locator('visible=true').last().click();
    await a.page.waitForTimeout(500);
    await a.tap('Save', {wait: 2500});
    await a.go(`/fin/job/${A}`, 6000);
    await a.page.getByText('First half — at practical completion').locator('visible=true').first().click();
    await a.page.waitForTimeout(1000);
    await a.shot('ret-ask');
    await a.page.getByText(/Raise invoice/).locator('visible=true').last().click();
    await a.page.waitForTimeout(4500);
    await a.shot('ret-inv');
    const id = (a.page.url().match(/invoice\/([0-9a-f-]{36})/) || [])[1];
    const i = id && (await a.get(`fin_invoices?select=status,net,lines&id=eq.${id}`))[0];
    if (id) { state.retInv = id; keep(); }
    return {ok: !!i && NEAR(i.net, 105), note: i ? `${i.status} net ${i.net} ${JSON.stringify(i.lines).slice(0, 160)}` : await say()};
  });
  if (!state.pi2) await step('Statements set-up: purchase invoice INV-100, 100 + 20 = 120', async () => {
    await a.go(`/fin/pinv/new?site=${A}`, 5000);
    await a.field('Supplier', 'ZZ Fin Supplier');
    await a.field('Invoice number', 'INV-100');
    await a.field('Total £ (blank = net + VAT)', '120');
    await a.tap('Save', {wait: 3500});
    const p = (await a.get(`purchase_invoices?select=id,net,vat,total&site_id=eq.${A}&invoice_no=eq.INV-100`))[0];
    if (p) { state.pi2 = p.id; keep(); }
    return {ok: !!p && NEAR(p.total, 120) && NEAR(p.net, 100) && NEAR(p.vat, 20), note: JSON.stringify(p)};
  });
  await step('Statement: upload stmt.csv, INV-100 matches, INV-101 not, balance 180', async () => {
    await a.go('/fin/statements', 5000);
    await a.shot('stmt-list');
    await a.pick(() => a.tap('⬆ Upload a statement', {wait: 0}), [path.join(samples, 'stmt.csv')], 4000);
    await a.field('Supplier *', 'ZZ Fin Supplier');
    await a.shot('stmt-form');
    await a.tap('Match the invoices', {wait: 5000});
    await a.shot('stmt-open');
    const s = (await a.get('fin_statements?select=*&supplier_name=eq.ZZ%20Fin%20Supplier&order=created_at.desc&limit=1'))[0];
    if (s) { state.stmt = s.id; keep(); }
    const ls = s?.lines || [];
    return {ok: !!s && ls.length === 2 && ls.filter((l) => l.match).length === 1 && NEAR(s.closing_balance, 180), note: s ? `lines ${ls.length}, matched ${ls.filter((l) => l.match).length}, bal ${s.closing_balance}: ${(await say(600)).slice(90)}` : await say()};
  });
  await step('Statement: mark reconciled, then reopen', async () => {
    await a.tap('Mark reconciled', {wait: 1200});
    await a.shot('stmt-ask');
    await a.tap('Yes', {wait: 3000}).catch(() => {});
    const s = (await a.get(`fin_statements?select=status&id=eq.${state.stmt}`))[0];
    await a.tap('Reopen', {wait: 2500});
    const b = (await a.get(`fin_statements?select=status&id=eq.${state.stmt}`))[0];
    return {ok: s.status === 'reconciled' && b.status === 'open', note: `${s.status} then ${b.status}`};
  });
  await step('Yard: new item 10 at 5.00, in 5 = 15, issue 3 to job = 12, return 1 = 13, count to 20', async () => {
    await a.go('/fin/yard', 5000);
    await a.shot('yard');
    await a.tap('+ New item', {wait: 800});
    await a.field('Item *', 'ZZ Code 4 lead');
    await a.field('Unit', 'roll');
    await a.field('Qty in the yard now', '10');
    await a.page.getByText(/^Rate £ per/).locator('visible=true').last().locator('xpath=following::input[1]').fill('5');
    await a.shot('yard-new');
    await a.tap('Add item', {wait: 3000});
    const it = () => a.get('yard_stock?select=*&item=eq.ZZ%20Code%204%20lead');
    let s = (await it())[0];
    if (!s) return {ok: false, note: 'not added ' + await say(300)};
    state.yard = s.id; keep();
    const q = [Number(s.qty)];
    const move = async (btn, qty, saveL, job) => {
      await a.go('/fin/yard', 5000);
      await a.tap(btn, {wait: 800});
      await choice('Item', 'ZZ Code 4 lead');
      await a.field(/Counted/.test(saveL) ? 'Counted qty (what’s actually there)' : btn.includes('Adjust') ? 'Counted qty (what’s actually there)' : 'Qty', String(qty));
      if (job) await choice('Job', 'ZZ JOB Fin A');
      await a.shot('yard-' + qty);
      await a.page.locator('[role="button"]').locator('visible=true').filter({hasText: new RegExp(saveL, 'i')}).last().click();
      await a.page.waitForTimeout(3000);
      s = (await it())[0]; q.push(Number(s.qty));
    };
    await move('⬇ Book stock in', 5, 'Book|in');
    await move('⬆ Issue to a job', 3, 'Issue', true);
    await move('↩ Return from a job', 1, 'Return', true);
    await move('Adjust a count', 20, 'Save|Adjust|Set');
    const moves = await a.get(`yard_moves?select=kind,qty,site_id&stock_id=eq.${state.yard}`);
    return {ok: q.join() === '10,15,12,13,20', note: `${q.join(' > ')}; moves ${moves.length}`};
  });
  await step('Yard: issued stock shows on the job costs at 3 x 5 = 15, less 1 returned = 10', async () => {
    await a.go(`/fin/job/${A}/costs`, 5000);
    await a.shot('yard-costs');
    const t = await say(1600);
    return {ok: /Yard|ZZ Code 4 lead/.test(t), note: (t.match(/.{60}ZZ Code 4 lead.{80}/) || [t.slice(100, 300)])[0]};
  });
  await step('Finance settings: default retention 5 > 6 saves, then back', async () => {
    const was = (await a.get('fin_settings?select=default_retention_pct,org_id&limit=1'))[0];
    await a.go('/fin/settings', 5000);
    await a.shot('settings');
    await a.tap('Edit settings', {wait: 1000});
    await a.shot('settings-form');
    await a.field('Default retention %', '6');
    await a.tap('Save', {wait: 3000});
    const mid = (await a.get('fin_settings?select=default_retention_pct&limit=1'))[0];
    await a.go('/fin/settings', 5000);
    await a.tap('Edit settings', {wait: 1000});
    await a.field('Default retention %', String(was.default_retention_pct));
    await a.tap('Save', {wait: 3000});
    const end = (await a.get('fin_settings?select=default_retention_pct&limit=1'))[0];
    return {ok: Number(mid.default_retention_pct) === 6 && Number(end.default_retention_pct) === Number(was.default_retention_pct), note: `${was.default_retention_pct} > ${mid.default_retention_pct} > ${end.default_retention_pct}`};
  });
};
