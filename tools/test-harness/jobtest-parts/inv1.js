// Purchase invoices on Sandbox, with a stand-in for the AI's answer as its key isn't set up: everything after the read is
// real (the job for each line, price checks, filing, Unallocated, splits). The stand-in is chosen by file name.
const path = require('path'), fs = require('fs');
module.exports = async ({as, step, state, keep, samples, OUT}) => {
  const a = await as('admin');
  const say = async (n = 300) => (await a.text()).replace(/\s+/g, ' ').slice(0, n);
  const S = 'SUPPLIER ZZ Reader Roofing Ltd';
  const jobs = (await a.get(`sites?select=id,name,job_number,address,postcode&name=like.ZZ%20JOB%20Fin*&limit=2`));
  const [A, B] = jobs;
  const stamp = Date.now() % 100000;
  // The answers the AI would give, one per file.
  const clean = {doc_type: 'invoice', supplier: S, doc_number: `ZZ-C${stamp}`, doc_date: '2026-10-28', site_reference: A.job_number, net: 500, vat: 100, total: 600, lines: [{description: 'ZZ reader felt roll', qty: 10, unit: 'roll', unit_price: 40, amount: 400, kind: 'item'}, {description: 'Delivery', amount: 100, kind: 'delivery', qty: 1, unit_price: 100}]};
  const twoJobs = {doc_type: 'invoice', supplier: S, doc_number: `ZZ-T${stamp}`, doc_date: '2026-10-28', net: 300, vat: 60, total: 360, lines: [{description: 'ZZ reader felt roll', qty: 5, unit_price: 40, amount: 200, kind: 'item', site_reference: A.job_number}, {description: 'Screws', qty: 1, unit_price: 100, amount: 100, kind: 'item', site_reference: B.job_number}]};
  const dear = {doc_type: 'invoice', supplier: S, doc_number: `ZZ-D${stamp}`, doc_date: '2026-10-28', site_reference: A.job_number, net: 500, vat: 100, total: 600, lines: [{description: 'ZZ reader felt roll', qty: 10, unit_price: 50, amount: 500, kind: 'item'}]};
  const lost = {doc_type: 'invoice', supplier: S, doc_number: `ZZ-L${stamp}`, doc_date: '2026-10-28', net: 300, vat: 60, total: 360, lines: [{description: 'ZZ reader felt roll', qty: 5, unit_price: 40, amount: 200, kind: 'item'}, {description: 'Screws', qty: 1, unit_price: 100, amount: 100, kind: 'item'}]};
  const answers = {clean, two: twoJobs, dear, lost};
  await a.ctx.route(/functions\/v1\/finance-ai-read/, async (route) => {
    const body = route.request().postDataJSON() || {};
    const key = Object.keys(answers).find((k) => String(body.path).includes(`zz-${k}`));
    return route.fulfill({status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin': '*'}, body: JSON.stringify(key ? {ok: true, data: answers[key]} : {error: 'not_configured'})});
  });
  const files = Object.keys(answers).map((k) => { const p = path.join(OUT, `zz-${k}.pdf`); fs.copyFileSync(path.join(samples, 'sds.pdf'), p); return p; });
  const inbox = (no) => a.get(`fin_inbox?select=id,status,stage,query_reason,site_id,extracted,purchase_invoice_id,auto_filed&order=created_at.desc&limit=12`).then((r) => r.find((x) => x.extracted?.doc_number === no || x.extracted?.invoice_no === no));
  const pinv = async (id) => (await a.get(`purchase_invoices?select=*&id=eq.${id}`))[0];

  await step('Price list: a yearly list for this supplier, in the system', async () => {
    await a.go('/fin/purchases?tab=pricelists', 5000);
    await a.shot('pl0');
    return {ok: (await a.get(`fin_quote_items?select=id&description=eq.ZZ%20reader%20felt%20roll&limit=1`)).length === 1, note: await say(240)};
  });
  await step('Upload four invoices: read and sorted by themselves', async () => {
    await a.go('/fin/purchases?tab=invoices', 6000);
    await a.pick(() => a.page.getByText(/\+ Add invoices/i).locator('visible=true').first().click({timeout: 7000}), files, 15000);
    for (let i = 0; i < 15 && !(await inbox(lost.doc_number)); i++) await a.page.waitForTimeout(2500);
    await a.shot('u1');
    const r = await Promise.all([clean, twoJobs, dear, lost].map((x) => inbox(x.doc_number)));
    console.log(JSON.stringify(r.map((x) => x && [x.status, x.stage, x.auto_filed, x.query_reason])));
    return {ok: r.every(Boolean), note: await say(160)};
  });
  await step('Clear invoice: filed to its job by itself', async () => {
    const it = await inbox(clean.doc_number), p = it?.purchase_invoice_id && await pinv(it.purchase_invoice_id);
    return {ok: it?.auto_filed === true && p?.site_id === A.id && Number(p.total) === 600 && p.lines?.length === 2, note: p ? `${p.status}, £${p.total}, ${p.lines?.length} lines` : JSON.stringify(it || {}).slice(0, 200)};
  });
  await step('Two jobs on one invoice: filed with each line on its job, split by value', async () => {
    const it = await inbox(twoJobs.doc_number), p = it?.purchase_invoice_id && await pinv(it.purchase_invoice_id);
    const s = p?.split || [];
    return {ok: s.length === 2 && s.some((x) => x.site_id === A.id && Number(x.amount) === 200) && s.some((x) => x.site_id === B.id && Number(x.amount) === 100), note: JSON.stringify(s).slice(0, 220)};
  });
  await step('Nothing on it to say which job: stays Unallocated with the reason', async () => {
    const it = await inbox(lost.doc_number);
    state.lostItem = it?.id; keep();
    return {ok: it?.status === 'new' && /job/i.test(it?.query_reason || ''), note: it?.query_reason};
  });
  await step('Unallocated: choose a job per line, amend a line, file it', async () => {
    await a.go(`/fin/inbox/${state.lostItem}`, 6000);
    await a.shot('l1');
    const pick = async (n, job) => { await a.page.locator(`[aria-label="Line ${n} job"]`).first().click({timeout: 6000}); await a.page.waitForTimeout(700); await a.page.getByText(new RegExp(job.job_number)).locator('visible=true').last().click({timeout: 6000}); await a.page.waitForTimeout(500); };
    await pick(1, A); await pick(2, B);
    await a.page.locator('[aria-label="Line 2 description"]').first().fill('Screws, amended');
    await a.shot('l2');
    await a.page.getByText(/File to this project/).locator('visible=true').first().click({timeout: 6000}); await a.page.waitForTimeout(1000);
    await a.shot('l3');
    await a.page.getByText(/^(File|File it|Save)$/i).locator('visible=true').last().click({timeout: 6000}).catch(() => {});
    await a.page.waitForTimeout(6000);
    await a.shot('l4');
    const it = (await a.get(`fin_inbox?select=status,purchase_invoice_id&id=eq.${state.lostItem}`))[0], p = it?.purchase_invoice_id && await pinv(it.purchase_invoice_id);
    return {ok: it?.status === 'filed' && (p?.split || []).length === 2 && p.lines.some((l) => l.description === 'Screws, amended'), note: JSON.stringify(p?.split || it).slice(0, 200)};
  });
  await step('Price check: dearer than the newest list goes on as a query', async () => {
    const it = await inbox(dear.doc_number);
    const p = it?.purchase_invoice_id && await pinv(it.purchase_invoice_id);
    return {ok: p?.status === 'query' && /£50.00.*£40.00/.test(p?.match_notes || ''), note: p ? `${p.status}, flags: ${p.match_notes}` : `not filed: ${it?.query_reason}`};
  });
};
