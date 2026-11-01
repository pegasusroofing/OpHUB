// Finance, for real: application, certificate, invoice from certificate, second application, sums by hand.
const path = require('path'), fs = require('fs');
const NEAR = (a, b) => Math.abs(Number(a) - b) < 0.005;
module.exports = async ({as, step, state, keep, samples, OUT}) => {
  const a = await as('admin');
  const say = async (n = 400) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const J = state.finA;
  const appr = async (id) => (await a.get(`fin_applications?select=*&id=eq.${id}`))[0];
  const setLine = async (desc, v) => { const el = a.page.getByText(new RegExp(desc)).locator('visible=true').first().locator('xpath=following::input[1]'); await el.fill(String(v)); await a.page.waitForTimeout(200); };
  await step('Application 1: starts from the BOQ, 5% retention carried over', async () => {
    await a.go(`/fin/job/${J}/application/new`, 7000);
    state.app1 = (a.page.url().match(/application\/([0-9a-f-]{36})/) || [])[1]; keep();
    await a.shot('app1-new');
    const r = await appr(state.app1);
    return {ok: !!r && r.number === 1 && Number(r.retention_pct) === 5 && (r.lines || []).length === 6, note: `no ${r?.number}, ret ${r?.retention_pct}, lines ${(r?.lines || []).length}, ${await say(200)}`};
  });
  await step('Application 1: 50/100/25/0%, gross 4,300, retention 215, due 4,085 by hand', async () => {
    await a.go(`/fin/job/${J}/application/${state.app1}`, 6000);
    await setLine('Strip and re-slate', 50); await setLine('Lead flashing', 100); await setLine('Scaffold weeks', 25);
    await a.page.waitForTimeout(600);
    await a.shot('app1-fill');
    await a.tap('Save', {wait: 3000});
    const r = await appr(state.app1);
    const t = await say(5000);
    return {ok: NEAR(r.gross_to_date ?? r.gross, 4300) && NEAR(r.retention, 215) && NEAR(r.net_due, 4085), note: `gross ${r.gross_to_date ?? r.gross}, ret ${r.retention}, net ${r.net_due}; ${(t.match(/VAT @ 20%[^.]*/) || [''])[0].slice(0, 60)}`};
  });
  await step('Application 1: PDF and Excel are real', async () => {
    await a.page.getByText('⬇ Download PDF').locator('visible=true').first().click();
    await a.page.waitForTimeout(2500);
    const p = await a.saved(() => a.tap('📄 PDF', {wait: 0}));
    state.appPdf = p; keep();
    await a.page.waitForTimeout(1000);
    await a.page.getByText('⬇ Download Excel').locator('visible=true').first().click();
    await a.page.waitForTimeout(2500);
    const x = await a.saved(() => a.tap('⬇️ Download', {wait: 0}));
    return {ok: fs.readFileSync(p).subarray(0, 4).toString() === '%PDF' && fs.readFileSync(x).subarray(0, 2).toString() === 'PK', note: `${path.basename(p)} ${fs.statSync(p).size}b; ${path.basename(x)} ${fs.statSync(x).size}b`};
  });
  await step('Application 1: Mark as Applied locks it', async () => {
    await a.tap('Mark as Applied (locks it)', {wait: 1500});
    await a.tap('Mark applied', {wait: 3500});
    await a.shot('app1-applied');
    const r = await appr(state.app1);
    const inputs = await a.page.getByText(/Less retention/).locator('visible=true').locator('xpath=following::input[1]').count();
    return {ok: r.status === 'submitted', note: `status ${r.status}: ${await say(120)}`};
  });
  await step('Certificate: client certifies 4,200, retention 210, net 3,990, short 95 of applied', async () => {
    await a.go(`/fin/job/${J}/application/${state.app1}`, 6000);
    const inp = (l) => a.page.getByText(l, {exact: true}).locator('visible=true').last().locator('xpath=following::input[1]');
    await inp('Total certified to date (£)').fill('4200');
    await inp('Retention held (£)').fill('210');
    await a.page.waitForTimeout(400);
    const t = await a.text();
    const short = /Short by £95\.00/.test(t);
    await a.fill('Notes, e.g. reason for any shortfall', 'ZZ test: scaffold queried');
    await a.shot('cert-form');
    await a.tap('Save certificate', {wait: 3500});
    await a.shot('cert-saved');
    const r = await appr(state.app1);
    return {ok: short && NEAR(r.cert_gross, 4200) && NEAR(r.cert_retention, 210) && NEAR(r.cert_net, 3990), note: `short shown ${short}; cert ${r.cert_gross}/${r.cert_retention}/${r.cert_net}`};
  });
  await step('Invoice from the certificate: net 3,990, VAT 798, total 4,788', async () => {
    await a.tap('🧾 Raise invoice', {wait: 4500});
    await a.shot('cert-inv');
    const r = await appr(state.app1);
    state.appInv = r.invoice_id || (a.page.url().match(/invoice\/([0-9a-f-]{36})/) || [])[1]; keep();
    const i = (await a.get(`fin_invoices?select=*&id=eq.${state.appInv}`))[0];
    return {ok: i && NEAR(i.net, 3990) && NEAR(i.vat, 798) && NEAR(i.total, 4788), note: i ? `${i.status} ${i.number || ''} net ${i.net} vat ${i.vat} total ${i.total}, lines ${JSON.stringify(i.lines).slice(0, 220)}` : await say()};
  });
  await step('Project set-up: retention limit 3% (300 on 10,000)', async () => {
    await a.go(`/fin/job/${J}?tab=setup`, 5000);
    await a.tap('Edit project details', {wait: 1000});
    await a.field('Retention limit %', '3');
    await a.tap('Save', {wait: 2500});
    const jf = (await a.get(`job_finance?select=retention_limit_pct&site_id=eq.${J}`))[0];
    return {ok: Number(jf.retention_limit_pct) === 3, note: JSON.stringify(jf)};
  });
  await step('Application 2: all 100%, retention capped at 300, less 3,990 previous, due 5,710', async () => {
    await a.go(`/fin/job/${J}/application/new`, 7000);
    state.app2 = (a.page.url().match(/application\/([0-9a-f-]{36})/) || [])[1]; keep();
    await a.page.waitForTimeout(800);
    for (const [d] of [['Strip and re-slate'], ['Lead flashing'], ['Scaffold weeks'], ['Skip hire']]) await setLine(d, 100);
    await a.page.waitForTimeout(500);
    await a.shot('app2');
    await a.tap('Save', {wait: 3000});
    const r = await appr(state.app2);
    return {ok: r.number === 2 && NEAR(r.gross_to_date ?? r.gross, 10000) && NEAR(r.retention, 300) && NEAR(r.net_due, 5710), note: `no ${r.number}, gross ${r.gross_to_date ?? r.gross}, ret ${r.retention}, prev ${r.previous_certified ?? r.previous}, net ${r.net_due}`};
  });
  await step('Applied list and overview: read the figures', async () => {
    await a.go(`/fin/job/${J}?tab=sales`, 5000);
    await a.tap('Applications & Certificates', {wait: 2000});
    await a.shot('sales-apps');
    const l = await say(800);
    await a.go(`/fin/job/${J}`, 6000);
    await a.shot('ov-a2');
    return {note: `${l.slice(100, 500)} ||| ${(await say(1400)).slice(120)}`};
  });
  await step('Delete a draft: application 2 goes through the app’s own delete', async () => {
    await a.go(`/fin/job/${J}/application/${state.app2}`, 6000);
    await a.tap('Delete draft', {wait: 1500});
    await a.tap('Delete', {wait: 3500});
    const r = await appr(state.app2);
    return {ok: !r || r.status === 'void', note: r ? `status ${r.status}` : 'row gone'};
  });
};
