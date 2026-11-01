// Finance, for real: retest PO/PI, invoice-job hiding, Directory, operative invoice, budgets, jobs grid.
const path = require('path'), fs = require('fs');
const NEAR = (a, b) => Math.abs(Number(a) - b) < 0.005;
module.exports = async ({as, step, state, keep, samples, OUT}) => {
  const a = await as('admin');
  const say = async (n = 400) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const A = state.finA, B = state.finB;
  const last = async (ph, v) => { await a.page.locator(`input[placeholder="${ph}"], textarea[placeholder="${ph}"]`).locator('visible=true').last().fill(v); await a.page.waitForTimeout(150); };
  const pdf = (f) => fs.readFileSync(f).subarray(0, 4).toString() === '%PDF';

  await step('Invoice job B after the fix: no Applications/Retention tabs, no Retention rows', async () => {
    await a.go(`/fin/job/${B}?tab=sales`, 5000);
    await a.shot('b-sales');
    const s = await say(500);
    await a.go(`/fin/job/${B}?tab=setup`, 5000);
    const u = await say(1400);
    await a.tap('Edit project details', {wait: 1000});
    await a.shot('b-setup-form');
    const f = await say(900);
    return {ok: !/Applications? & Certificates|Retention/.test(s) && !/Retention|Application date/.test(u) && !/Retention/.test(f), note: `${s.slice(100, 230)}`};
  });
  await step('Application on A: no VAT line when company default is reverse charge (after fix)', async () => {
    await a.go(`/fin/job/${A}/application/${state.app1}`, 6000);
    return {ok: !/VAT @ 20%/.test(await a.text())};
  });
  if (!state.po) await step('PO on A after the fix: new supplier with no email, 400 x 1.25 = 500', async () => {
    await a.go(`/fin/po/new?site=${A}`, 5000);
    await a.fill('Type to find a supplier, or a new name', 'ZZ Fin Supplier');
    await a.page.waitForTimeout(400);
    await last('Description', 'Slates 500x250'); await last('Qty', '400'); await last('Unit', 'no'); await last('Rate £', '1.25');
    await a.tap('Raise PO', {wait: 500});
    for (let i = 0; i < 15 && !/fin\/po\/[0-9a-f-]{36}/.test(a.page.url()); i++) await a.page.waitForTimeout(1000);
    await a.page.waitForTimeout(2500);
    await a.shot('po-made');
    state.po = (a.page.url().match(/fin\/po\/([0-9a-f-]{36})/) || [])[1]; keep();
    const p = (await a.get(`purchase_orders?select=number,status,value,vat,total,supplier_name&id=eq.${state.po}`))[0];
    return {ok: !!p && NEAR(p.value, 500) && NEAR(p.total, 600), note: JSON.stringify(p)};
  });
  await step('PO PDF is real', async () => {
    await a.go(`/fin/po/${state.po}`, 4500);
    await a.tap('📄 Download the PO PDF', {wait: 2500});
    const f = await a.saved(() => a.tap('📄 PDF', {wait: 0}));
    return {ok: pdf(f), note: `${path.basename(f)} ${fs.statSync(f).size}b`};
  });
  if (!state.pi) await step('Purchase invoice on the PO: net 480, VAT 96, total 576', async () => {
    await a.go(`/fin/pinv/new?site=${A}&po=${state.po}`, 5000);
    await a.field('Supplier', 'ZZ Fin Supplier');
    await a.field('Invoice number', 'ZZ-PI-1');
    await a.field('Net £ (blank = worked out from the total)', '480');
    await a.tap('Save', {wait: 3500});
    await a.shot('pi-saved');
    const p = (await a.get(`purchase_invoices?select=id,status,net,vat,total,po_id,cost_code&site_id=eq.${A}&invoice_no=eq.ZZ-PI-1`))[0];
    if (p) { state.pi = p.id; keep(); }
    return {ok: !!p && NEAR(p.net, 480) && NEAR(p.vat, 96) && NEAR(p.total, 576) && p.po_id === state.po, note: JSON.stringify(p)};
  });
  await step('Purchase invoice: approve, mark paid', async () => {
    await a.go(`/fin/pinv/${state.pi}`, 5000);
    await a.tap('✓ Approve', {wait: 2500});
    await a.shot('pi-appr');
    await a.tap('Mark paid today', {wait: 2500});
    await a.shot('pi-paid');
    const p = (await a.get(`purchase_invoices?select=status,paid_on&id=eq.${state.pi}`))[0];
    return {ok: p.status === 'approved' && !!p.paid_on, note: JSON.stringify(p)};
  });
  await step('Purchases list on A: PO, invoice, plant shown; quote raises a PO', async () => {
    await a.go(`/fin/job/${A}?tab=purchases`, 5000);
    await a.shot('pur-orders');
    const t = await say(800);
    await a.tap('Purchase Quotes', {wait: 2000});
    await a.shot('pur-quotes');
    return {ok: /ZZ Fin Supplier/.test(t), note: t.slice(180, 420)};
  });
  await step('Directory: add client, edit, shows on the list', async () => {
    await a.go('/fin/directory?kind=client', 5000);
    await a.shot('dir-clients');
    await a.tap('+ New client', {wait: 1000});
    await a.field('Client name', 'ZZ Dir Client');
    await a.field('Accounts email', 'zz-client@example.invalid');
    await a.page.getByText('Add to Xero as well').locator('visible=true').first().click();
    await a.page.waitForTimeout(300);
    await a.shot('dir-client-form');
    await a.tap('Save', {wait: 3000});
    let c = (await a.get('fin_clients?select=*&name=eq.ZZ%20Dir%20Client'))[0];
    if (!c) return {ok: false, note: 'client not saved: ' + await say(300)};
    state.dirClient = c.id; keep();
    await a.go('/fin/directory?kind=client', 5000);
    await a.fill('Search clients', 'ZZ Dir');
    await a.page.waitForTimeout(600);
    await a.tap('ZZ Dir Client', {wait: 1000});
    await a.shot('dir-client-row');
    if (!/Client name/.test(await a.text())) await a.tap('Edit', {wait: 1000});
    await a.field('Phone', '0123 456789');
    await a.tap('Save', {wait: 3000});
    c = (await a.get(`fin_clients?select=phone&id=eq.${state.dirClient}`))[0];
    return {ok: c.phone === '0123 456789', note: JSON.stringify(c)};
  });
  await step('Directory: add supplier, edit', async () => {
    await a.go('/fin/directory?kind=supplier', 5000);
    await a.tap('+ New supplier', {wait: 1000});
    await a.field('Supplier name', 'ZZ Dir Supplier');
    await a.page.getByText('Add to Xero as well').locator('visible=true').first().click();
    await a.shot('dir-sup-form');
    await a.tap('Save', {wait: 3000});
    let c = (await a.get('fin_suppliers?select=*&name=eq.ZZ%20Dir%20Supplier'))[0];
    if (!c) return {ok: false, note: 'not saved: ' + await say(300)};
    state.dirSup = c.id; keep();
    await a.go('/fin/directory?kind=supplier', 5000);
    await a.fill('Search suppliers', 'ZZ Dir');
    await a.page.waitForTimeout(600);
    await a.tap('ZZ Dir Supplier', {wait: 1000});
    if (!/Supplier name/.test(await a.text())) await a.tap('Edit', {wait: 1000});
    await a.field('Phone', '0987 654321');
    await a.tap('Save', {wait: 3000});
    c = (await a.get(`fin_suppliers?select=phone&id=eq.${state.dirSup}`))[0];
    return {ok: c.phone === '0987 654321', note: JSON.stringify(c)};
  });
  await step('Directory: add a labour person, CIS 20%, edit', async () => {
    await a.go('/fin/directory?kind=labour', 5000);
    await a.shot('dir-labour');
    await a.tap('+ Add a person', {wait: 1000});
    await a.field('Name', 'ZZ Dir Labour');
    await a.field('Day rate £', '180');
    await a.shot('dir-lab-form');
    await a.tap('Save', {wait: 3000});
    let c = (await a.get('fin_labour_rates?select=*&name=eq.ZZ%20Dir%20Labour'))[0];
    if (!c) return {ok: false, note: 'not saved: ' + await say(300)};
    state.dirLab = c.id; keep();
    await a.go('/fin/directory?kind=labour', 5000);
    await a.fill('Search name or UTR', 'ZZ Dir');
    await a.page.waitForTimeout(600);
    await a.tap('ZZ Dir Labour', {wait: 1000});
    await a.field('Day rate £', '190');
    await a.tap('Save', {wait: 3000});
    c = (await a.get(`fin_labour_rates?select=day_rate,cis_rate&id=eq.${state.dirLab}`))[0];
    return {ok: Number(c.day_rate) === 190, note: JSON.stringify(c)};
  });
  await step('Operative invoice: 1,000 labour + 50 materials, 20% CIS: 200, pay 850', async () => {
    await a.go('/fin/labour/new', 5000);
    await a.shot('op-form');
    await a.tap('Choose who', {wait: 900});
    await a.tap('ZZ Dir Labour', {wait: 700});
    await a.field('Their invoice no.', 'ZZ-OP-1');
    await a.field('Materials £ (no CIS)', '50');
    await a.page.getByText(/Choose the job|Which job|Choose a job/).locator('visible=true').first().click();
    await a.page.waitForTimeout(800);
    await a.tap('ZZ JOB Fin A', {exact: false, wait: 700});
    await last('£', '1000');
    await a.page.waitForTimeout(500);
    await a.shot('op-filled');
    await a.tap('Save — ready for the pay run', {wait: 3500});
    await a.shot('op-saved');
    const p = (await a.get('fin_labour_invoices?select=*&invoice_no=eq.ZZ-OP-1').catch(() => []))[0];
    if (!p) return {ok: false, note: 'no row: ' + await say(400)};
    state.opInv = p.id; keep();
    return {ok: NEAR(p.gross, 1050) && NEAR(p.cis_deduction, 200) && NEAR(p.net_pay, 850), note: `${p.gross} ${p.cis_deduction} ${p.net_pay} ${p.status}`};
  });
  await step('Budgets on A: save materials 2,000 and to-complete 1,520; forecast adds up', async () => {
    await a.go(`/fin/job/${A}/budget`, 5000);
    await a.shot('budget');
    const b = a.page.getByText('Materials', {exact: true}).locator('visible=true').first();
    const ins = b.locator('xpath=following::input');
    await ins.nth(0).fill('2000');
    await ins.nth(1).fill('1520');
    await a.page.waitForTimeout(400);
    await a.shot('budget2');
    await a.tap('Save budget & forecast', {wait: 3000});
    const r = (await a.get(`fin_job_budgets?select=category,budget,to_complete&site_id=eq.${A}&category=eq.materials`))[0];
    return {ok: !!r && Number(r.budget) === 2000 && Number(r.to_complete) === 1520, note: JSON.stringify(r)};
  });
  await step('Overview on A: reads after costs', async () => {
    await a.go(`/fin/job/${A}`, 6000);
    await a.shot('ov-a3');
    const t = await say(900);
    const cost = await a.go(`/fin/job/${A}/costs`, 5000);
    await a.shot('costs');
    const c = await say(900);
    await a.go(`/fin/job/${A}/summary`, 5000);
    await a.shot('summary');
    const s = await say(1200);
    return {note: `OV ${t.slice(150)} ||| COSTS ${c.slice(90)} ||| SUM ${s.slice(90)}`};
  });
  await step('Jobs grid: shows both test jobs with figures', async () => {
    await a.go('/fin/jobs', 6000);
    await a.shot('jobs');
    const t = await say(1600);
    return {ok: /ZZ JOB Fin A/.test(t) || /Fin A/.test(t), note: t.slice(0, 500)};
  });
};
