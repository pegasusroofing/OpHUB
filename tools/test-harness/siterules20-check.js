// Site Rules & Layout sheet builder (Andy, 20 Nov 2026: "the site rules and layouts need to be a customisable (template
// style) sheet, where we can add in numbered items and it creates a pdf with the site rules etc. allow upload still but
// needs to be a bit like the rams build"). Fake database. node siterules20-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'siterules20'); require('fs').mkdirSync(SHOTS, {recursive: true});
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [w, h, tag] of [[1300, 900, 'laptop'], [390, 844, 'phone']]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: w, height: h}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
    db.cpp_plans = [{id: 'cp1', org_id: me.org_id, site_id: S1, status: 'draft', version: 1, updated_at: new Date().toISOString(), data: {siteHours: 'The hours on site will be 8.00am - 5.00pm Monday - Friday. Weekend working will only be carried out upon agreement of all parties.', firstAiders: 'Jake Morris Tel: 07700 1', pm: {name: 'Andy Admin', phone: '07700 900123'}, emergencyMobile: '07700 900999'}}];
    db.site_rules_builds = []; db.site_layout_docs = [];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const tab = async (re) => { await page.getByRole('tab').filter({hasText: re}).first().click(); await page.waitForTimeout(800); };
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
    await page.goto(`${B}/sites/${S1}/mc/layout`); await page.waitForTimeout(5000);
    let t = await text();
    check(/Site Rules Sheet/i.test(t) && /\+ Build Site Rules/.test(t) && /Upload/i.test(t), `${tag}: Site Rules & Layout offers Build Site Rules, and upload is still there`);
    await page.getByText('+ Build Site Rules', {exact: true}).click(); await page.waitForTimeout(5000);
    const row = db.site_rules_builds[0];
    check(!!row && row.site_id === S1 && /8\.00am - 5\.00pm/.test(row.data.info.siteHours) && row.data.info.emergencyPhone === '07700 900999' && /Jake Morris/.test(row.data.info.firstAiders), `${tag}: a new sheet starts from the job and its CPP (hours, site contact, first aiders)`);
    t = await text();
    check(/Rules \(21\)/.test(t) && /Details/.test(t) && /Layout/.test(t) && /Issue/.test(t), `${tag}: tabs Details / Rules (21) / Layout / Issue`);
    await tab(/^Rules/);
    await page.getByText('+ Add Rule', {exact: true}).click(); await page.waitForTimeout(500);
    await page.getByLabel('Rule 22', {exact: true}).fill('No mobile phones while operating plant.'); await page.waitForTimeout(400);
    await page.getByLabel('Move rule 22 up').click(); await page.waitForTimeout(1500);
    const rules = db.site_rules_builds[0].data.rules;
    check(rules.length === 22 && rules[20] === 'No mobile phones while operating plant.', `${tag}: add a numbered rule and move it (it saves by itself)`);
    await page.screenshot({path: path.join(SHOTS, `rules-${tag}.png`)});
    await tab(/^Issue/);
    await page.getByText('Issue Site Rules', {exact: true}).click(); await page.waitForTimeout(800);
    if (/Issue it anyway/.test(await text())) { await page.getByText('Yes', {exact: true}).last().click(); }
    await page.waitForTimeout(7000);
    const doc = db.site_layout_docs[0];
    check(!!doc && /Site Rules v1/.test(doc.name) && db.site_rules_builds[0].status === 'issued', `${tag}: Issue files it in Site Rules & Layout for signing (${doc && doc.name})`);
    t = await text();
    check(/Site Rules · Version 1/.test(t) && /✎ Edit/.test(t) && /👁 View/.test(t) && await page.getByRole('tab').count() === 0, `${tag}: once issued it closes: Edit / View`);
    await page.screenshot({path: path.join(SHOTS, `issued-${tag}.png`)});
    await page.goto(`${B}/sites/${S1}/mc/layout`); await page.waitForTimeout(5000);
    t = await text();
    check(/Issued · version 1/.test(t) && /Site Rules v1/.test(t), `${tag}: the Site Rules & Layout page lists the sheet and its document to sign`);
    await page.screenshot({path: path.join(SHOTS, `layout-page-${tag}.png`), fullPage: true});
    if (tag === 'laptop') {
      await page.goto(`${B}/pm/admin/siterules`); await page.waitForTimeout(5000);
      t = await text();
      check(/Site Rules Template/.test(t) && await page.getByRole('tab').filter({hasText: /^Rules/}).count() === 1 && await page.getByRole('tab').filter({hasText: /^Layout/}).count() === 0, 'the company template: Details / Rules (no job layout or issuing)');
      await page.getByRole('tab').filter({hasText: /^Rules/}).first().click(); await page.waitForTimeout(600);
      await page.getByLabel('Rule 1', {exact: true}).fill('Hard hats on at all times.'); await page.waitForTimeout(1800);
      const tpl = db.site_rules_builds.find((x) => !x.site_id);
      check(!!tpl && tpl.data.rules[0] === 'Hard hats on at all times.', 'the template saves by itself');
    }
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
