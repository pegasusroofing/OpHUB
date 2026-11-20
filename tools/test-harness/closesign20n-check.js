// New app: close a RAMS for signing, and the signer boxes centred (Andy, 20 Nov 2026: "Can you centralise the grey boxes.
// Also can you add in to close rams please which project managers can do should no more signatures be needed. Also then
// it closes the notification on the hub"). On a phone. Fake database; nothing is sent. node closesign20n-check.js
// (closesign-check.js is the same feature in the old web app.)
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const now = '2026-10-13T09:00:00Z';
const ramsFor = (org) => [
  {id: 'rms', site_id: S1, org_id: org, name: 'Method Statement — Roof Renewal', storage_path: 'x/ms.pdf', status: 'current', doc_type: 'Method Statement', subcontractor_company_id: null, uploaded_at: now, created_at: now, uploaded_by: 'me'},
  {id: 'rra', site_id: S1, org_id: org, name: 'Risk Assessment — Roof Renewal', storage_path: 'x/ra.pdf', status: 'current', doc_type: 'Risk Assessment', subcontractor_company_id: null, uploaded_at: now, created_at: now, uploaded_by: 'me'},
];
const signIn = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
};
const text = (page) => page.evaluate(() => document.body.innerText);
(async () => {
  const browser = await chromium.launch(); const errs = [];
  // ---------- An admin ----------
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {howto_dismissed: ['*'], finance_enabled: false});
    db.rams_docs = ramsFor(me.org_id); db.rams_signatures = []; db.coshh_docs = []; db.toolbox_talks = [];
    // The HUB lists unsigned RAMS on my own jobs once work has started.
    db.sites.find((x) => x.id === S1).responsible_pm_id = 'me'; db.schedule_tasks = [{id: 'st1', site_id: S1, status: 'in_progress', percent_complete: 20}];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await signIn(page);
    await page.goto(B + `/sites/${S1}/hs/rams`); await page.waitForTimeout(5000);
    // 1. The grey Signed / Outstanding box lines up with View Document: the same gap each side of the card.
    const g = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const view = [...document.querySelectorAll('[role="button"]')].filter(vis).find((e) => /View Document/.test(e.innerText));
      const box = [...document.querySelectorAll('div')].filter(vis).filter((e) => /^SIGNED \(\d+\)/i.test(e.innerText.trim()) && getComputedStyle(e).backgroundColor === 'rgb(249, 250, 251)').pop();
      if (!view || !box) return null;
      const v = view.getBoundingClientRect(), b = box.getBoundingClientRect();
      return {vl: Math.round(v.left), vr: Math.round(v.right), bl: Math.round(b.left), br: Math.round(b.right)};
    });
    check(!!g && Math.abs(g.vl - g.bl) <= 1 && Math.abs(g.vr - g.br) <= 1, `the grey signer box is centred, lined up with View Document (${JSON.stringify(g)})`);
    await page.screenshot({path: path.join(__dirname, 'shots', 'closesign20n-before.png'), fullPage: true});
    // 2. The HUB has the RAMS to sign.
    await page.goto(B + '/inbox?tab=todo'); await page.waitForTimeout(6000);
    check(/RAMS not signed by operatives/.test(await text(page)), 'before: the HUB lists "RAMS not signed by operatives"');
    // 3. Close both RAMS from their ⋮ menus.
    await page.goto(B + `/sites/${S1}/hs/rams`); await page.waitForTimeout(5000);
    for (const id of ['rms', 'rra']) {
      await page.locator('text="⋮" >> visible=true').nth(id === 'rms' ? 0 : 1).click(); await page.waitForTimeout(800);
      const m = await text(page);
      if (id === 'rms') check(/🔒 Close For Signing/.test(m), 'the ⋮ menu offers "🔒 Close For Signing"');
      await page.getByText('🔒 Close For Signing', {exact: true}).first().click(); await page.waitForTimeout(800);
      const q = await text(page);
      if (id === 'rms') check(/for signing\?/.test(q) && /comes off the HUB/.test(q), 'it asks first, saying it comes off the HUB');
      await page.getByText('Yes', {exact: true}).last().click(); await page.waitForTimeout(2500);
      check(!!db.rams_docs.find((r) => r.id === id).signing_closed_at, `${id === 'rms' ? 'the Method Statement' : 'the Risk Assessment'} is closed for signing`);
    }
    let t = await text(page);
    check((t.match(/🔒 Closed \d/g) || []).length === 2 && (t.match(/None — closed for signing/g) || []).length === 2 && !/Jake Morris/.test(t.replace(/SIGNED[\s\S]*?OUTSTANDING/g, '')),
      'both show "🔒 Closed", and nobody is listed as outstanding');
    check(!/Mark All RAMS as Issued/.test(t) && !/Tap To Mark As Issued/.test(t), 'no Mark As Issued on a closed RAMS');
    await page.screenshot({path: path.join(__dirname, 'shots', 'closesign20n-closed.png'), fullPage: true});
    // 4. The HUB notice has gone.
    await page.goto(B + '/inbox?tab=todo'); await page.waitForTimeout(6000);
    check(!/RAMS not signed by operatives/.test(await text(page)), 'after: the HUB notice has gone');
    // 5. Ask Outstanding To Sign has nobody to ask.
    await page.goto(B + `/sites/${S1}/hs/rams`); await page.waitForTimeout(5000);
    await page.locator('text="🔔 Ask Outstanding To Sign" >> visible=true').first().click(); await page.waitForTimeout(700);
    const askT = await text(page); if (process.env.DBG) console.log('ASK:', askT.slice(-900).split('\n').join(' / '));
    check(/No one on this job is still to sign RAMS/.test(askT) && !/Send a sign-reminder/.test(askT), 'Ask Outstanding To Sign leaves closed RAMS out, and says there is no one to ask');
    // 6. Reopen one: back on the HUB.
    await page.locator('text="⋮" >> visible=true').first().click(); await page.waitForTimeout(800);
    await page.getByText('↺ Reopen For Signing', {exact: true}).first().click(); await page.waitForTimeout(2500);
    check(db.rams_docs.find((r) => r.id === 'rms').signing_closed_at == null, 'Reopen For Signing opens it again (no question needed)');
    await page.goto(B + '/inbox?tab=todo'); await page.waitForTimeout(6000);
    check(/RAMS not signed by operatives/.test(await text(page)), 'reopened: back on the HUB');
    await ctx.close();
  }
  // ---------- An operative on the job ----------
  {
    const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {howto_dismissed: ['*'], finance_enabled: false, signature_path: 'sig/me.png'});
    if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
    db.rams_docs = ramsFor(me.org_id); db.rams_docs[0].signing_closed_at = '2026-11-20T10:00:00Z';
    db.rams_signatures = []; db.coshh_docs = []; db.toolbox_talks = [];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await signIn(page);
    await page.goto(B + '/inbox?tab=todo'); await page.waitForTimeout(6000);
    let t = await text(page);
    check(/Sign RAMS: Risk Assessment — Roof Renewal/.test(t) && !/Sign RAMS: Method Statement/.test(t), 'operative To Do: only the open RAMS, not the closed one');
    await page.goto(B + `/sites/${S1}/hs/rams`); await page.waitForTimeout(5000);
    t = await text(page);
    check(/Closed — No Signature Needed/.test(t) && (t.match(/Tap To Sign/g) || []).length === 1, 'operative RAMS page: the closed one says no signature needed; the other can still be signed');
    check(/Sign All RAMS Documents \(1 unsigned\)/.test(t), `Sign All counts only the open one (${(t.match(/Sign All[^\n]*/) || [''])[0]})`);
    await page.screenshot({path: path.join(__dirname, 'shots', 'closesign20n-operative.png'), fullPage: true});
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
