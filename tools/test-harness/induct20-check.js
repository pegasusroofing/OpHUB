// The company's own induction form (Andy, 20 Nov 2026: "the inductions ... need to be a bit more of a customisable form
// that then creates a document for signing by operatives and adding info missing, ie next of kin etc"). The admin adds a
// question; an operative's next of kin carries over from their last induction, a missing answer takes them to its tab,
// and the signed record keeps every answer. Fake database. node induct20-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'induct20'); require('fs').mkdirSync(SHOTS, {recursive: true});
const signIn = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
};
(async () => {
  const browser = await chromium.launch(); const errs = [];
  let saved = null;
  // ---- The admin adds a question to Next Of Kin ----
  {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*']});
    db.induction_templates = [];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    await signIn(page);
    await page.goto(`${B}/pm/admin/inductionform`); await page.waitForTimeout(5000);
    const t = await text();
    check(/Site Induction \(8\)/.test(t) && /Next Of Kin \(4\)/.test(t) && /About You \(5\)/.test(t) && /Health Questionnaire \(6\)/.test(t), 'the standard form: Site Induction / Next Of Kin / About You / Health Questionnaire');
    await page.getByRole('tab').filter({hasText: /^Next Of Kin/}).first().click(); await page.waitForTimeout(600);
    await page.getByText('+ Add Question', {exact: true}).click(); await page.waitForTimeout(500);
    await page.getByLabel('Question 5', {exact: true}).fill('Blood Group'); await page.waitForTimeout(2000);
    await page.screenshot({path: path.join(SHOTS, '1-form-builder-laptop.png'), fullPage: true});
    saved = db.induction_templates[0] && db.induction_templates[0].data;
    const kin = saved && saved.sections.find((s) => s.id === 'kin');
    check(!!kin && kin.items.some((i) => i.label === 'Blood Group' && i.type === 'text' && i.required), 'adding "Blood Group" to Next Of Kin saves by itself (short answer, required)');
    check(Array.isArray(db.organizations[0].site_induction_questions) && db.organizations[0].site_induction_questions.length === 8, 'the tick list is kept in step for the old app');
    await ctx.close();
  }
  // ---- An operative: next of kin carried over; Blood Group missing takes them to its tab ----
  {
    const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {howto_dismissed: ['*'], finance_enabled: false, signature_path: 'sig/me.png'});
    if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
    db.induction_templates = [{org_id: me.org_id, data: saved}];
    db.site_layout_docs = []; db.subcontractor_operatives = [];
    db.site_induction_completions = [{id: 'old', site_id: 'another', operative_id: 'me', completed_at: '2026-10-01T09:00:00Z', answers: {v2: {kin_name: 'Sue Fitter', kin_phone: '07700 900999', kin_relationship: 'Wife', about_cscs: '1234567'}}, emergency_contact_name: 'Sue Fitter', emergency_contact_number: '07700 900999'}];
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const tab = async (re) => { await page.getByRole('tab').filter({hasText: re}).first().click(); await page.waitForTimeout(600); };
    await signIn(page);
    await page.goto(`${B}/sites/${S1}/mc/inductions`); await page.waitForTimeout(6000);
    check(/filled in from your last induction/.test(await text()), 'it says next of kin and details are filled in from last time');
    const n = await page.locator('text="☐" >> visible=true').count();
    for (let i = 0; i < n; i++) { await page.locator('text="☐" >> visible=true').first().click(); await page.waitForTimeout(120); }
    await tab(/^Next Of Kin/);
    check(await page.getByLabel('Name', {exact: true}).inputValue() === 'Sue Fitter' && await page.getByLabel('Phone Number', {exact: true}).inputValue() === '07700 900999', 'their next of kin is filled in from their last induction');
    await page.screenshot({path: path.join(SHOTS, '2-next-of-kin-phone.png')});
    await tab(/^Health/);
    const nos = page.getByRole('button', {name: /: No$/}); const k = await nos.count();
    for (let i = 0; i < k; i++) { await nos.nth(i).click(); await page.waitForTimeout(80); }
    await tab(/^Sign/);
    await page.getByRole('button', {name: 'Sign and complete induction'}).click(); await page.waitForTimeout(1200);
    check(await page.getByLabel('Blood Group', {exact: true}).isVisible() && /Still to answer: Blood Group/.test(await text()), 'a missing answer (Blood Group) takes them to its tab');
    await page.getByLabel('Blood Group', {exact: true}).fill('O+'); await page.waitForTimeout(200);
    await tab(/^Sign/);
    await page.getByRole('button', {name: 'Sign and complete induction'}).click(); await page.waitForTimeout(9000);
    const c = db.site_induction_completions.find((x) => x.site_id === S1);
    const bg = saved.sections.find((s) => s.id === 'kin').items.find((i) => i.label === 'Blood Group').id;
    check(!!c && c.answers.v2[bg] === 'O+' && c.answers.v2.about_cscs === '1234567' && c.emergency_contact_name === 'Sue Fitter' && c.answers.item_0 === true && Array.isArray(c.answers.health), 'the signed record keeps every answer (and the older keys for the old app)');
    check(/completed this site/.test(await text()), 'and it shows as completed');
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
