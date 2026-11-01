// Finance, for real: issuing invoices with PDFs and payments, invoice job, PO, purchase invoice, plant, quotes, subcontractor CIS, operative invoice.
const path = require('path'), fs = require('fs');
const NEAR = (a, b) => Math.abs(Number(a) - b) < 0.005;
module.exports = async ({as, step, state, keep, samples, OUT}) => {
  const a = await as('admin');
  const say = async (n = 400) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const A = state.finA, B = state.finB;
  const inv = async (id) => (await a.get(`fin_invoices?select=*&id=eq.${id}`))[0];
  const choose = async (label, option) => { await a.page.getByText(label, {exact: true}).locator('visible=true').last().locator('xpath=following::*[contains(text(),"▾")][1]').click({timeout: 7000}); await a.page.waitForTimeout(700); await a.tap(option, {wait: 500}); };
  const last = async (ph, v) => { await a.page.locator(`input[placeholder="${ph}"], textarea[placeholder="${ph}"]`).locator('visible=true').last().fill(v); await a.page.waitForTimeout(150); };

  await step('Cert invoice on A: issue with Bill to, gets a number and PDF', async () => {
    await a.go(`/fin/job/${A}/invoice/${state.appInv}`, 5000);
    const billEl = a.page.getByText('Bill to', {exact: true}).locator('visible=true').last().locator('xpath=following::input[1] | following::textarea[1]').first();
    const was = await billEl.inputValue();
    if (!was) await billEl.fill('ZZ Fin Client');
    await a.shot('inv-draft');
    await a.tap('Issue invoice…', {wait: 1500});
    await a.shot('inv-issue-q');
    await a.tap('Issue invoice', {wait: 5000});
    await a.shot('inv-issued');
    const i = await inv(state.appInv);
    return {ok: i.status !== 'draft' && !!i.number, note: `bill-to prefilled "${was}"; ${i.status} ${i.number}, pdf ${i.pdf_path ? 'stored' : 'none'}, net ${i.net} vat ${i.vat} rc ${i.rc_vat} total ${i.total}: ${await say(100)}`};
  });
  await step('Job B: raise a sales invoice, 2 lines, VAT 20%: 1,000 + 250 = 1,250, VAT 250, total 1,500', async () => {
    await a.go(`/fin/job/${B}/invoice/new`, 6000);
    state.bInv = (a.page.url().match(/invoice\/([0-9a-f-]{36})/) || [])[1]; keep();
    await last('Description', 'Roof strip first stage'); await last('£0.00', '1000');
    await a.tap('+ Add line', {wait: 400});
    await last('Description', 'Lead work'); await last('£0.00', '250');
    await a.tap('VAT for all lines', {wait: 700}); await a.tap('20%', {wait: 600});
    await a.field('Bill to', 'ZZ Fin Client');
    await a.tap('Save draft', {wait: 2000});
    const t = await a.text();
    await a.shot('b-inv');
    const i = await inv(state.bInv);
    return {ok: NEAR(i.net, 1250) && NEAR(i.vat, 250) && NEAR(i.total, 1500), note: `net ${i.net} vat ${i.vat} total ${i.total}, ${i.status}`};
  });
  await step('Job B invoice: issue, PDF stored, record part payment 500, outstanding 1,000', async () => {
    await a.tap('Issue invoice…', {wait: 1500});
    await a.tap('Issue invoice', {wait: 5000});
    let i = await inv(state.bInv);
    await a.go(`/fin/job/${B}/invoice/${state.bInv}`, 5000);
    await a.tap('View PDF', {wait: 5000});
    await a.shot('b-inv-pdf');
    i = await inv(state.bInv);
    await a.page.keyboard.press('Escape').catch(() => {});
    await a.go(`/fin/job/${B}/invoice/${state.bInv}`, 5000);
    await a.tap('+ Record payment', {wait: 800});
    await a.field('Amount received (£)', '500');
    await a.tap('Save', {wait: 3000});
    await a.shot('b-inv-paid');
    const after = await inv(state.bInv);
    const t = await say(800);
    return {ok: i.status !== 'draft' && !!i.pdf_path && NEAR(after.paid, 500) && /Outstanding/i.test(t) && /£1,000\.00/.test(t), note: `${i.status} ${i.number}, pdf ${i.pdf_path ? 'stored' : 'NONE'}, paid ${after.paid}, status ${after.status}`};
  });
  await step('Job B: overview, Invoiced 1,250, Owed; no applied or retention tiles', async () => {
    await a.go(`/fin/job/${B}`, 6000);
    await a.shot('b-ov');
    const t = await say(700);
    return {ok: !/Applied|Retention/i.test(t.slice(0, 600)) && /Invoiced/.test(t), note: t.slice(120, 560)};
  });
  await step('Job B: what the Sales tab and Project Admin offer an invoice job', async () => {
    await a.go(`/fin/job/${B}?tab=sales`, 5000);
    await a.shot('b-sales');
    const s = await say(500);
    await a.go(`/fin/job/${B}?tab=setup`, 5000);
    await a.shot('b-setup');
    const u = await say(700);
    return {ok: !/Applications? & Certificates|Retention/.test(s) && !/Retention/.test(u), note: `sales: ${s.slice(120, 300)} || setup has Retention row: ${/Retention/.test(u)}`};
  });
  await step('PO on A: 400 slates x 1.25 = 500, numbered', async () => {
    await a.go(`/fin/po/new?site=${A}`, 5000);
    await a.fill('Type to find a supplier, or a new name', 'ZZ Fin Supplier');
    await a.page.waitForTimeout(400);
    await last('Description', 'Slates 500x250'); await last('Qty', '400'); await last('Unit', 'no'); await last('Rate £', '1.25');
    await a.shot('po-form');
    await a.tap('Raise PO', {wait: 500});
    for (let i = 0; i < 15 && !/fin\/po\/[0-9a-f-]{36}/.test(a.page.url()); i++) await a.page.waitForTimeout(1000);
    await a.page.waitForTimeout(2000);
    await a.shot('po-made');
    state.po = (a.page.url().match(/fin\/po\/([0-9a-f-]{36})/) || [])[1]; keep();
    const p = (await a.get(`purchase_orders?select=number,status,value,vat,total,supplier_name,site_id&site_id=eq.${A}`))[0];
    return {ok: p && NEAR(p.value, 500), note: JSON.stringify(p) + ' ' + await say(100)};
  });
  await step('PO PDF is real', async () => {
    if (!/fin\/po\/[0-9a-f-]{36}/.test(a.page.url())) { const p = (await a.get(`purchase_orders?select=id&site_id=eq.${A}`))[0]; state.po = p.id; keep(); await a.go(`/fin/po/${p.id}`, 4500); }
    await a.tap('📄 Download the PO PDF', {wait: 2500});
    const f = await a.saved(() => a.tap('📄 PDF', {wait: 0}));
    return {ok: fs.readFileSync(f).subarray(0, 4).toString() === '%PDF', note: `${path.basename(f)} ${fs.statSync(f).size}b`};
  });
  await step('Purchase invoice on the PO: net 480, VAT worked out 96, total 576', async () => {
    await a.go(`/fin/pinv/new?site=${A}&po=${state.po}`, 5000);
    await a.field('Supplier', 'ZZ Fin Supplier');
    await a.field('Invoice number', 'ZZ-PI-1');
    await a.field('Net £ (blank = worked out from the total)', '480');
    await a.shot('pi-form');
    await a.tap('Save', {wait: 3500});
    await a.shot('pi-saved');
    const p = (await a.get(`purchase_invoices?select=id,status,net,vat,total,po_id,cost_code&site_id=eq.${A}&invoice_no=eq.ZZ-PI-1`))[0];
    if (p) { state.pi = p.id; keep(); }
    return {ok: p && NEAR(p.net, 480) && NEAR(p.vat, 96) && NEAR(p.total, 576) && p.po_id === state.po, note: JSON.stringify(p)};
  });
  await step('Purchase invoice: approve, mark paid', async () => {
    await a.go(`/fin/pinv/${state.pi}`, 5000);
    await a.tap('✓ Approve', {wait: 2500});
    await a.shot('pi-appr');
    await a.tap('Mark paid today', {wait: 2500});
    const p = (await a.get(`purchase_invoices?select=status,paid_on&id=eq.${state.pi}`))[0];
    return {ok: p.status === 'approved' && !!p.paid_on, note: JSON.stringify(p)};
  });
  await step('Plant: 70 a week, on hire 15 Oct, off-hire today: 18 days = 180', async () => {
    await a.go(`/fin/plant/new?site=${A}`, 4500);
    await a.field('What’s on hire', 'ZZ Telehandler');
    await a.field('Supplier', 'ZZ Hire Co');
    await a.field('Hire rate £', '70');
    await a.label('On hire', 700);
    await a.label('Previous month', 500);
    await a.label('15 Oct 2026', 500).catch(async () => { await a.shot('plant-cal'); throw new Error('no 15 Oct day: ' + await say(300)); });
    await a.shot('plant-form');
    await a.tap('Save', {wait: 3000});
    const h = (await a.get(`fin_plant_hires?select=*&site_id=eq.${A}&item=eq.ZZ%20Telehandler`))[0];
    if (h) { state.hire = h.id; keep(); }
    await a.go(`/fin/plant/${h.id}`, 4500);
    await a.tap('Off-hire today', {wait: 2500});
    const after = (await a.get(`fin_plant_hires?select=on_hire,off_hire,rate,rate_period&id=eq.${h.id}`))[0];
    await a.go(`/fin/plant/${h.id}`, 4500);
    const t = await say(300);
    return {ok: after.on_hire === '2026-10-15' && !!after.off_hire && /£180\.00/.test(t), note: `${JSON.stringify(after)} screen: ${t.slice(0, 140)}`};
  });
  await step('Purchase Quotes: upload quote.csv for this project, 2 priced items', async () => {
    await a.go(`/fin/job/${A}?tab=purchases`, 5000);
    await a.tap('Purchase Quotes', {wait: 2000});
    await a.fill('Supplier name', 'ZZ Fin Supplier');
    await a.pick(() => a.page.getByText(/Upload quotes/).locator('visible=true').first().click(), [path.join(samples, 'quote.csv')], 5000);
    await a.shot('quote-up');
    const q = await a.get(`fin_quotes?select=id,supplier_name,site_id,purpose&site_id=eq.${A}`);
    const it = q[0] ? await a.get(`fin_quote_items?select=code,description,rate&quote_id=eq.${q[0].id}`) : [];
    if (q[0]) { state.pq = q[0].id; keep(); }
    return {ok: it.length === 2 && NEAR(it.find((x) => x.code === 'L4')?.rate, 85), note: JSON.stringify(it) + (await say(100))};
  });
  await step('Subcontractor PO: 5,000 order, 5% retention, 20% CIS', async () => {
    await a.go(`/fin/sub/new?site=${A}`, 5000);
    await a.field('Subcontractor', 'ZZ Sub Ltd');
    await a.field('Work', 'ZZ roofing labour');
    await a.field('Order value £', '5000');
    await a.field('Retention %', '5');
    await a.shot('sub-form');
    await a.tap('Save', {wait: 4000});
    await a.shot('sub-made');
    const s = (await a.get(`fin_subcontracts?select=*&site_id=eq.${A}`))[0];
    if (s) { state.sub = s.id; keep(); }
    return {ok: s && NEAR(s.order_value, 5000) && Number(s.retention_pct) === 5 && Number(s.cis_rate) === 20, note: s ? `${s.number} value ${s.order_value} ret ${s.retention_pct} cis ${s.cis_rate}` : await say()};
  });
  await step('Sub application: 2,000 inc 500 mats, contra 100: net 1,800, CIS 280, pay 1,520', async () => {
    await a.go(`/fin/sub/${state.sub}`, 5000);
    await a.tap('+ Record an application', {wait: 1000});
    const inp = (l) => a.page.getByText(l, {exact: true}).locator('visible=true').last().locator('xpath=following::input[1]');
    await inp('Applied for, gross to date £').fill('2000');
    await inp('Of which materials to date £').fill('500');
    await inp('Certified gross to date £ (blank until checked)').fill('2000');
    await inp('Contra charges to date £').fill('100');
    await a.page.waitForTimeout(500);
    await a.shot('sub-app');
    const t = await say(1800);
    await a.page.locator('[role="button"]').getByText('Certify', {exact: true}).locator('visible=true').last().click().catch(() => a.tap('Certify'));
    await a.page.waitForTimeout(3500);
    await a.shot('sub-cert');
    const r = (await a.get(`fin_sub_apps?select=*&subcontract_id=eq.${state.sub}`))[0];
    if (r) { state.subApp = r.id; keep(); }
    return {ok: r && NEAR(r.retention, 100) && NEAR(r.net_due, 1800) && NEAR(r.cis_deduction, 280) && NEAR(r.pay_amount, 1520), note: r ? `ret ${r.retention} net ${r.net_due} cis ${r.cis_deduction} pay ${r.pay_amount} ${r.status}` : t.slice(0, 300)};
  });
  await step('Sub application: mark paid, it goes on the CIS return, statement PDF real', async () => {
    await a.go(`/fin/sub/${state.sub}`, 5000);
    await a.page.getByText(/No\. 1/).locator('visible=true').first().click();
    await a.page.waitForTimeout(1200);
    await a.tap('Mark paid today', {wait: 1200});
    await a.tap('Mark paid', {wait: 3500});
    await a.shot('sub-paid');
    const r = (await a.get(`fin_sub_apps?select=status,paid_on&id=eq.${state.subApp}`))[0];
    const p = await a.get(`fin_sub_payments?select=*&sub_app_id=eq.${state.subApp}`);
    await a.go(`/fin/sub/${state.sub}`, 5000);
    await a.page.getByText(/No\. 1/).locator('visible=true').first().click();
    await a.page.waitForTimeout(1200);
    await a.tap('CIS payment statement', {wait: 2500});
    const f = await a.saved(() => a.tap('📄 PDF', {wait: 0}));
    return {ok: r.status === 'paid' && p.length === 1 && NEAR(p[0].cis_deducted ?? p[0].cis_deduction ?? p[0].cis, 280) && fs.readFileSync(f).subarray(0, 4).toString() === '%PDF', note: `${r.status}; payment ${JSON.stringify(p[0]).slice(0, 300)}; ${path.basename(f)}`};
  });
};
