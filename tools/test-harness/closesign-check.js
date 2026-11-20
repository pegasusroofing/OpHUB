// Close RAMS / COSHH for signing (20 Nov 2026). Fake database; nothing is sent.
const H = require('./harness'); const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const R1 = 'aaaaaaaa-0000-0000-0000-000000000001', C1 = 'cccccccc-0000-0000-0000-000000000001';
const docs = (db) => {
  const now = new Date(Date.now()-86400000).toISOString();
  db.rams_docs = [{id:R1, site_id:H.S1, name:'Risk Assessment — Roof', storage_path:'x/r1.pdf', status:'current', doc_type:'RAMS', uploaded_at:now, uploaded_by:'o1', subcontractor_company_id:null, signing_closed_at:null}];
  db.coshh_docs = [{id:C1, site_id:H.S1, name:'COSHH — Primer', storage_path:'x/c1.pdf', uploaded_at:now, uploaded_by:'o1', subcontractor_company_id:null, signing_closed_at:null}];
  db.rams_signatures = []; db.coshh_signatures = [];
};
(async () => {
  const {srv, port} = await H.serve(); const browser = await H.chromium.launch(); const errs = [];
  // ---- PM closes the RAMS ----
  {
    const {ctx, db} = await H.makeContext(browser, 'pm', [], {viewport:{width:1300,height:900}});
    seed(db); docs(db); db.profiles[0].howto_dismissed = ['*'];
    const page = await ctx.newPage(); page.on('pageerror', e => errs.push('pm: '+e.message));
    await H.login(page, port);
    await page.evaluate(h => { location.hash = h; }, '#/site/'+H.S1+'/hs/rams'); await page.waitForTimeout(2500);
    await page.evaluate(id => { rowActionsMenuOpenFor = 'ramsdoc-'+id; render(); }, R1); await page.waitForTimeout(1200);
    check(/Close for signing/.test(await page.locator('#app').innerText()), 'RAMS ⋯ menu has Close for signing');
    await page.evaluate(id => { window.customConfirm = async () => true; return hsSetSigningClosed('rams_docs', id, true); }, R1); await page.waitForTimeout(1500);
    check(!!db.rams_docs[0].signing_closed_at, 'RAMS row is marked closed in the database');
    const t = await page.locator('#app').innerText();
    check(/Closed/.test(t) && /Closed for signing/.test(t), 'RAMS row shows Closed');
    await page.evaluate(h => { location.hash = h; }, '#/site/'+H.S1+'/hs/coshh'); await page.waitForTimeout(2500);
    await page.evaluate(id => { rowActionsMenuOpenFor = 'coshhdoc-'+id; render(); }, C1); await page.waitForTimeout(1200);
    await page.waitForTimeout(1500);
    check(/Close for signing/.test(await page.locator('#app').innerText()), 'COSHH ⋯ menu has Close for signing');
    let items = await page.evaluate(async () => { const {rows} = await computeOutstandingRows('me'); return rows.flatMap(r => r.items.map(i => i.type)); });
    check(!items.includes('rams') && items.includes('coshh'), 'PM outstanding/HUB list: closed RAMS gone, open COSHH still there');
    await page.evaluate(id => hsSetSigningClosed('coshh_docs', id, true), C1); await page.waitForTimeout(1500);
    items = await page.evaluate(async () => { const {rows} = await computeOutstandingRows('me'); return rows.flatMap(r => r.items.map(i => i.type)); });
    check(!items.includes('coshh'), 'after closing the COSHH it is gone from the list too');
    await page.evaluate(id => hsSetSigningClosed('coshh_docs', id, false), C1); await page.waitForTimeout(1500);
    check(db.coshh_docs[0].signing_closed_at === null, 'Reopen for signing clears it');
    await ctx.close();
  }
  // ---- Operative: closed RAMS no longer asked for; COSHH still is ----
  {
    const {ctx, db} = await H.makeContext(browser, 'operative', [], {viewport:{width:390,height:844}});
    seed(db); docs(db); db.rams_docs[0].signing_closed_at = new Date().toISOString(); db.profiles[0].howto_dismissed = ['*'];
    const page = await ctx.newPage(); page.on('pageerror', e => errs.push('op: '+e.message));
    await H.login(page, port);
    await page.evaluate(h => { location.hash = h; }, '#/site/'+H.S1+'/hs/rams'); await page.waitForTimeout(2500);
    check(/No signature needed/.test(await page.locator('#app').innerText()), 'operative sees "Closed — No signature needed" instead of a sign box');
    await ctx.close();
  }
  console.log(errs.length ? 'ERRS '+errs.join(' | ') : 'no page errors');
  await browser.close(); srv.close();
})();
