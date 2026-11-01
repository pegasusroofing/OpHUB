// The real AI reader on Sandbox (run with AI_TEST=1): made-up invoices drawn as PDFs and a photo, uploaded in Purchases, read by the
// real server function. Nothing is stood in. Each read costs a few pence. Nothing is sent to anyone but the AI.
const path = require('path');
module.exports = async ({as, step, state, keep, OUT}) => {
  const a = await as('admin');
  const S = 'SUPPLIER ZZ Reader Roofing Ltd';
  const [A, B] = await a.get(`sites?select=id,name,job_number,address,postcode&name=like.ZZ%20JOB%20Fin*&limit=2`);
  const stamp = Date.now() % 100000;
  const nos = {clean: `ZZA-C${stamp}`, two: `ZZA-T${stamp}`, dear: `ZZA-D${stamp}`, lost: `ZZA-L${stamp}`};
  const row = (code, d, q, u, p, ref) => `<tr><td>${code}</td><td>${d}${ref ? `<br><small>Deliver to job ${ref}</small>` : ''}</td><td>${q}</td><td>${u}</td><td>${p.toFixed(2)}</td><td>${(q * p).toFixed(2)}</td></tr>`;
  const doc = (no, ref, rows, net) => `<html><body style="font:14px Arial;margin:40px"><h1>${S}</h1><p>12 Trade Park, Brighton BN1 1AA<br>VAT No GB 000 0000 00</p><h2>TAX INVOICE</h2>
    <p>Invoice No: <b>${no}</b><br>Invoice date: 28/10/2026<br>Due: 30/11/2026${ref ? `<br>Your job ref: <b>${ref}</b>` : ''}</p>
    <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>Code</th><th>Description</th><th>Qty</th><th>Unit</th><th>Price</th><th>Net £</th></tr>${rows}</table>
    <p style="text-align:right">Net £${net.toFixed(2)}<br>VAT 20% £${(net * 0.2).toFixed(2)}<br><b>Total £${(net * 1.2).toFixed(2)}</b></p></body></html>`;
  const docs = {
    clean: doc(nos.clean, A.job_number, row('FR10', 'ZZ reader felt roll', 10, 'roll', 40) + row('', 'Delivery', 1, 'nr', 100), 500),
    two: doc(nos.two, '', row('FR10', 'ZZ reader felt roll', 5, 'roll', 40, A.job_number) + row('SC1', 'Screws', 1, 'box', 100, B.job_number), 300),
    dear: doc(nos.dear, A.job_number, row('FR10', 'ZZ reader felt roll', 10, 'roll', 50), 500),
    lost: doc(nos.lost, '', row('FR10', 'ZZ reader felt roll', 5, 'roll', 40) + row('SC1', 'Screws', 1, 'box', 100), 300),
  };
  const files = [];
  const pg = await a.ctx.newPage();
  for (const k of Object.keys(docs)) {
    await pg.setContent(docs[k]);
    // Three PDFs and one photo, as both come in.
    const p = path.join(OUT, `zza-${k}.${k === 'lost' ? 'png' : 'pdf'}`);
    if (k === 'lost') await pg.screenshot({path: p}); else await pg.pdf({path: p, format: 'A4'});
    files.push(p);
  }
  await pg.close();
  // The photo's invoice number may not be read, so that one is found by its file name.
  const inbox = (no) => no === nos.lost ? a.get('fin_inbox?select=id,status,stage,query_reason,site_id,extracted,purchase_invoice_id,auto_filed&file_name=eq.zza-lost.png&order=created_at.desc&limit=1').then((r) => r[0]) : a.get(`fin_inbox?select=id,status,stage,query_reason,site_id,extracted,purchase_invoice_id,auto_filed&order=created_at.desc&limit=25`).then((r) => r.find((x) => x.extracted?.doc_number === no || x.extracted?.invoice_no === no));
  const pinv = async (id) => (await a.get(`purchase_invoices?select=*&id=eq.${id}`))[0];
  const near = (x, y) => Math.abs(Number(x) - y) < 0.01;

  await step('Upload three PDFs and a photo: the real AI reads them', async () => {
    await a.go('/fin/purchases?tab=invoices', 6000);
    await a.pick(() => a.page.getByText(/\+ Add invoices/i).locator('visible=true').first().click({timeout: 7000}), files, 15000);
    let r = [];
    for (let i = 0; i < 60; i++) { r = await Promise.all(Object.values(nos).map(inbox)); if (r.every(Boolean)) break; await a.page.waitForTimeout(3000); }
    await a.shot('u1');
    const failed = await a.get(`fin_inbox?select=file_name,query_reason&query_reason=like.Couldn*&order=created_at.desc&limit=5`);
    console.log('read:', JSON.stringify(r.map((x) => x && {no: x.extracted?.doc_number, sup: x.extracted?.supplier, net: x.extracted?.net, vat: x.extracted?.vat, total: x.extracted?.total, lines: x.extracted?.lines?.map((l) => [l.description, l.qty, l.unit_price, l.amount, l.kind, l.site_reference])})), 'failed:', JSON.stringify(failed));
    return {ok: r.every(Boolean), note: `${r.filter(Boolean).length} of 4 read`};
  });
  await step('Figures read correctly (clean invoice)', async () => {
    const e = (await inbox(nos.clean))?.extracted;
    return {ok: near(e?.net, 500) && near(e?.vat, 100) && near(e?.total, 600) && e?.lines?.length === 2 && /felt roll/i.test(e.lines[0].description) && near(e.lines[0].unit_price, 40), note: JSON.stringify(e?.lines || []).slice(0, 220)};
  });
  await step('Clear invoice: filed to its job by itself', async () => {
    const it = await inbox(nos.clean), p = it?.purchase_invoice_id && await pinv(it.purchase_invoice_id);
    return {ok: it?.auto_filed === true && p?.site_id === A.id && near(p.total, 600), note: p ? `${p.status}, £${p.total}` : it?.query_reason};
  });
  await step('Two deliveries: each line on its own job, split by value', async () => {
    const it = await inbox(nos.two), p = it?.purchase_invoice_id && await pinv(it.purchase_invoice_id), s = p?.split || [];
    return {ok: s.some((x) => x.site_id === A.id && near(x.amount, 200)) && s.some((x) => x.site_id === B.id && near(x.amount, 100)), note: JSON.stringify(s).slice(0, 200) + ' ' + (it?.query_reason || '')};
  });
  await step('Dearer than the price list: goes on as a query', async () => {
    const it = await inbox(nos.dear), p = it?.purchase_invoice_id && await pinv(it.purchase_invoice_id);
    return {ok: p?.status === 'query' && /£50.00.*£40.00/.test(p?.match_notes || ''), note: p ? `${p.status}: ${p.match_notes}` : it?.query_reason};
  });
  await step('Photo with no job on it: read, stays Unallocated with the reason', async () => {
    const it = await inbox(nos.lost);
    return {ok: it?.status === 'new' && /job/i.test(it?.query_reason || '') && near(it?.extracted?.total, 360), note: `${it?.query_reason}, total ${it?.extracted?.total}`};
  });
};
