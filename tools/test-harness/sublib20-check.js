// Subcontractor sign-up → Company Library → a job (Andy, 20 Nov 2026: "Approving a sign-up doesn't set anything up ... fix
// this"; insurance check; "the subcontractors dont need their operatives to fill out a subcontractor sign up form, just onto
// the app as normal"; "lighter login"). Laptop, then a phone. Fake database; nothing is sent. node sublib20-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'sublib20'); require('fs').mkdirSync(SHOTS, {recursive: true});
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*'], finance_enabled: false});
  const O = me.org_id;
  db.profiles.push({id: 'dan', name: 'Dan Price', role: 'operative', org_id: O, email: 'dan@acme.co'});
  db.subcontractor_applications = [{id: 'ap1', org_id: O, user_id: 'dan', company_name: 'Acme Scaffolding Ltd', contact_name: 'Dan Price', email: 'dan@acme.co', phone: '07700 900111', status: 'new', created_at: '2026-11-19T09:00:00Z', signed_name: 'Dan Price',
    data: {pl_expiry: '12/03/2027', el_expiry: '01/10/2026', trades: ['Scaffolding']},
    files: [{label: 'Public Liability Insurance', name: 'PL certificate.pdf', path: 'ap1/pl.pdf', bucket: 'subcontractor-apps'}, {label: "Employer's Liability Insurance", name: 'EL certificate.pdf', path: 'ap1/el.pdf', bucket: 'subcontractor-apps'}, {label: 'CHAS', name: 'CHAS.pdf', path: 'ap1/chas.pdf', bucket: 'subcontractor-apps'}]}];
  db.subcontractor_company_profiles = []; db.subcontractor_company_documents = []; db.subcontractor_companies = []; db.subcontractor_operatives = [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const vis = (l) => page.locator(`text="${l}" >> visible=true`);
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // ---- Approve the sign-up: it goes into the Company Library ----
  await page.goto(`${B}/pm/admin/subapps/ap1`); await page.waitForTimeout(5000);
  await vis('✓ Approve').first().click(); await page.waitForTimeout(800);
  await vis('OK').last().click(); await page.waitForTimeout(1500); const said = await text(); await page.waitForTimeout(3000);
  const prof = db.subcontractor_company_profiles[0];
  check(!!prof && prof.name === 'Acme Scaffolding Ltd' && !!prof.approved_at && prof.contact_user_id === 'dan' && prof.application_id === 'ap1', 'approving makes their Company Library entry, approved, with who signed them up');
  const docs = db.subcontractor_company_documents.map((d) => `${d.category}:${d.expiry_date || '-'}`).sort().join(' | ');
  check(docs === 'accreditation:- | employers_liability_insurance:2026-10-01 | public_liability_insurance:2027-03-12', `their documents filed under the right headings with the insurance dates (${docs})`);
  check(/Acme Scaffolding Ltd is in the Company Library with 3 documents/.test(said), 'and it says so');

  // ---- Add them to a job ----
  await page.goto(`${B}/sites/${S1}/mc/subcontractors`); await page.waitForTimeout(5000);
  await vis('+ Add Subcontractor').first().click(); await page.waitForTimeout(1500);
  let t = await text();
  check(/Add A Subcontractor/.test(t) && /Acme Scaffolding Ltd · ✓ Approved Sign-Up/.test(t) && /⚠ Employer's liability insurance expired 1 Oct 2026/.test(t) && /\+ A New Company/.test(t), 'the picker: approved sign-ups first, with their insurance; + A New Company');
  await page.screenshot({path: path.join(SHOTS, 'picker.png')});
  await page.getByText(/Acme Scaffolding Ltd\s+·\s+✓ Approved Sign-Up/).first().click(); await page.waitForTimeout(1000);
  check(/Employer's liability insurance expired 1 Oct 2026\. Add them to this job anyway\?/.test(await text()), 'expired insurance: it asks first');
  await vis('Yes').last().click(); await page.waitForFunction(() => /Project Manager on this job/.test(document.body.innerText), null, {timeout: 8000}).catch(() => {});
  const co = db.subcontractor_companies[0];
  check(!!co && co.master_company_id === prof.id && co.site_id === S1, 'added to the job, linked to their library entry');
  // Since 20 Nov the person who signed them up is their Project Manager straight away, and it says so.
  check(/Dan Price is Acme Scaffolding Ltd’s Project Manager on this job/.test(await text()), 'makes Dan (who signed them up) their Project Manager, and says so');
  if (await page.locator('text="OK" >> visible=true').count()) { await page.locator('text="OK" >> visible=true').last().click(); await page.waitForTimeout(800); }
  check(db.subcontractor_operatives.some((x) => x.user_id === 'dan' && x.subcontractor_company_id === co.id && x.is_admin) && db.site_assignments.some((a) => a.user_id === 'dan' && a.site_id === S1), 'Dan is on the job as their admin');
  t = await text();
  check(/Acme Scaffolding Ltd/.test(t) && /⚠ Employer's liability insurance expired/.test(t), 'their row on the job shows the insurance warning');
  await page.screenshot({path: path.join(SHOTS, 'list.png')});

  // ---- A lighter login for their operatives ----
  db.profiles.push({id: 'lee', name: 'Lee Fitter', role: 'operative', org_id: O, email: 'lee@acme.co'});
  db.subcontractor_operatives.push({id: 'so2', site_id: S1, subcontractor_company_id: co.id, user_id: 'me', is_admin: false});
  Object.assign(me, {role: 'operative'});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto(`${B}/home`); await page.waitForTimeout(6000);
  t = await text();
  // Getting Started before any job steps: phone, signature, certificates; one of our own operatives also has the form.
  // Since 21 Nov a subcontractor company operative fills in a Company Induction (no financial) instead of the Subcontractor Form: 4 steps.
  check(/of 4 steps done/.test(t) && !/Subcontractor Form/.test(t), `their operative's Getting Started has 4 steps with the Company Induction, no Subcontractor Form (${(t.match(/\d+ of \d+ steps done/) || [''])[0]})`);
  await page.screenshot({path: path.join(SHOTS, 'operative-home.png'), fullPage: true});
  await page.goto(`${B}/account`); await page.waitForTimeout(4000);
  check(!/My Employee Record/.test(await text()), 'and no "My Employee Record" in Settings');
  // One of our own operatives still gets both.
  db.subcontractor_operatives = db.subcontractor_operatives.filter((x) => x.user_id !== 'me');
  await page.goto(`${B}/account`); await page.waitForTimeout(4000);
  check(/My Employee Record/.test(await text()), 'one of our own operatives still has My Employee Record');
  await page.goto(`${B}/home`); await page.waitForTimeout(6000);
  t = await text();
  check(/of 4 steps done/.test(t), `and the Subcontractor Form step (${(t.match(/\d+ of \d+ steps done/) || [''])[0]})`);
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
