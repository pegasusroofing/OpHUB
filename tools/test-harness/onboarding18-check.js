// New starters and sign-up forms (Andy, 18 Nov 2026):
// - sign-up asks for their mobile ("pull through the users number from sign up as their contact number");
// - Getting Started from day one, with the signature drawn and saved in its step ("give a possibility to draw signature
//   that gets adopted"), and their Subcontractor Form and certificates as steps;
// - a form sent back for more information: the operative gets a message, and their form opens with the note and their
//   answers (and a message telling them); one from the public link has Email Them What's Missing;
// - a certificate uploaded with no expiry is filed to their OneDrive folder and its date read (calls caught here);
// - Who Checks Sign-Ups on the Sign-Up page.
// Fake database. node onboarding18-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'onboarding18');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const signIn = async (page) => {
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
};
const text = (page) => page.evaluate(() => document.body.innerText);

(async () => {
  const browser = await chromium.launch(); const errs = [];
  // ---- Sign-up asks for a mobile ----
  global.__rpc = (n) => (n === 'get_invite_info' ? [{org_name: 'RTB Roofing Ltd', is_valid: true}] : undefined);
  const j = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
  const jp = await j.ctx.newPage(); jp.on('pageerror', (e) => errs.push(e.message));
  await jp.goto(`${B}/join/inv-test`); await jp.waitForTimeout(5000);
  check(/Mobile Number/.test(await text(jp)), 'sign-up asks for a Mobile Number');
  await jp.getByLabel('Your Name').fill('New Starter').catch(() => jp.locator('input').nth(0).fill('New Starter'));
  await jp.locator('input[type="email"], input[autocomplete="email"]').first().fill('new@x.co');
  await jp.locator('input[type="password"]').first().fill('secret12');
  await jp.getByText('Join Team', {exact: true}).click(); await jp.waitForTimeout(1200);
  check(/Enter your mobile number/.test(await text(jp)), 'no mobile: it asks for it');
  await jp.screenshot({path: path.join(SHOTS, 'join-phone.png')});
  await j.ctx.close(); global.__rpc = undefined;

  // ---- A new operative, not on a live job yet ----
  const o = await makeContext(browser, 'operative', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(o.db);
  const me = o.db.profiles.find((p) => p.id === 'me');
  Object.assign(me, {howto_dismissed: ['*'], finance_enabled: false, signature_path: null, phone: '07700 900444'});
  o.db.site_assignments = o.db.site_assignments.filter((a) => a.user_id !== 'me');
  o.db.subcontractor_applications = [{id: 'app1', org_id: me.org_id, user_id: 'me', status: 'rejected', review_note: 'Please add your public liability certificate.', company_name: 'Starter Roofing', contact_name: 'Andy Admin', email: 'a@x.co', phone: '07700 900444', data: {company_type: 'Sole trader'}, files: [], created_at: new Date().toISOString()}];
  o.db.operative_certifications = [];
  const calls = [];
  await o.ctx.route(/functions\/v1\/(sync-operative-certification|cert-ai-read)/, (r) => { calls.push({fn: r.request().url().split('/').pop(), body: JSON.parse(r.request().postData() || '{}')}); r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, expiry_date: null, flagged: true})}); });
  const op = await o.ctx.newPage(); op.on('pageerror', (e) => errs.push(e.message));
  await signIn(op);
  await op.goto(B + '/getting-started'); await op.waitForTimeout(5000);
  // Step through to the signature step.
  let found = false;
  for (let i = 0; i < 6 && !found; i++) {
    if (/Create your signature/.test(await text(op))) { found = true; break; }
    await op.getByText('Next ›', {exact: true}).click(); await op.waitForTimeout(600);
  }
  let t = await text(op);
  check(found && /Draw Here/.test(t) && /Save Signature/.test(t), 'Getting Started (no live job yet): the signature step has the drawing pad');
  // The pad: the big drawing area (an svg) on the page.
  const pad = await op.evaluate(() => { const r = [...document.querySelectorAll('svg')].map((e) => e.getBoundingClientRect()).filter((b) => b.height > 90 && b.width > 200).sort((x, y) => y.height - x.height)[0]; return r ? {x: r.left, y: r.top, width: r.width, height: r.height} : null; });
  if (pad) { await op.mouse.move(pad.x + 30, pad.y + 40); await op.mouse.down(); await op.mouse.move(pad.x + 120, pad.y + 70, {steps: 8}); await op.mouse.move(pad.x + 200, pad.y + 35, {steps: 8}); await op.mouse.up(); }
  await op.screenshot({path: path.join(SHOTS, 'signature-step-phone.png')});
  await op.getByText('Save Signature', {exact: true}).click(); await op.waitForTimeout(3000);
  check(!!me.signature_path, `the signature is saved and adopted (${me.signature_path})`);
  t = await text(op);
  check(/Fill in your Subcontractor Form/.test(t) || /Upload your certificates/.test(t), 'and it moves on to the next step (the form or certificates)');
  await op.goto(B + '/getting-started'); await op.waitForTimeout(4500);
  const steps = [];
  for (let i = 0; i < 8; i++) { steps.push((await text(op)).match(/Step \d+ of \d+\n+([^\n]*\n+)?([^\n]+)/)?.[0] || ''); await op.getByText('Next ›', {exact: true}).click().catch(() => {}); await op.waitForTimeout(400); }
  const all = steps.join(' ');
  check(/Subcontractor Form/.test(all) && /certificates/i.test(all), 'the Subcontractor Form and certificates are steps');

  // Sent back: the note and their answers.
  await op.goto(B + '/subform'); await op.waitForTimeout(5000);
  t = await text(op);
  check(/Sent Back For More Information/.test(t) && /Please add your public liability certificate/.test(t), 'their form shows it was sent back, with what’s missing');
  // The form is in tabs since 20 Nov 2026: read the answers on every tab.
  let vals = '';
  const fTabs = op.getByRole('tab');
  for (let i = 0; i < Math.max(1, await fTabs.count()); i++) {
    if (await fTabs.count()) { await fTabs.nth(i).click(); await op.waitForTimeout(250); }
    vals += ' | ' + await op.evaluate(() => [...document.querySelectorAll('input, textarea')].map((i) => i.value).filter(Boolean).join(' | '));
  }
  check(/Starter Roofing/.test(vals) && /07700 900444/.test(vals), `and starts from their answers, with their mobile (${vals.slice(0, 120)})`);
  await op.screenshot({path: path.join(SHOTS, 'sent-back-phone.png'), fullPage: true});

  // A certificate with no expiry: filed and read.
  await op.goto(B + '/dashboard'); await op.waitForTimeout(5000);
  // My Dashboard › Certifications › Add a certificate: a type, a file, no expiry, Upload.
  const tog = op.getByText(/^Certifications \(/).first();
  if (!(await op.getByText('Add a certificate', {exact: true}).count()) && await tog.count()) { await tog.click(); await op.waitForTimeout(600); }
  await op.getByText('Add a certificate', {exact: true}).first().click(); await op.waitForTimeout(600);
  // The type is a ▾ drop-down since 21 Nov 2026.
  await op.getByLabel('Type', {exact: true}).first().click(); await op.waitForTimeout(600);
  const chip = op.getByText(/Asbestos/).last();
  if (await chip.count()) await chip.click(); else await op.getByText('Other', {exact: true}).last().click();
  await op.waitForTimeout(400);
  const [chooser] = await Promise.all([op.waitForEvent('filechooser', {timeout: 8000}).catch(() => null), op.getByText('Choose file…', {exact: true}).first().click()]);
  if (chooser) { await chooser.setFiles({name: 'asbestos.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test')}); await op.waitForTimeout(1000); }
  await op.getByText('Upload', {exact: true}).last().click(); await op.waitForTimeout(4000);
  const certRow = (o.db.operative_certifications || [])[0];
  check(!!certRow && (calls.some((c) => c.fn === 'sync-operative-certification' && c.body.operative_id === 'me' && c.body.cert_ids?.[0] === certRow.id) && calls.some((c) => c.fn === 'cert-ai-read' && c.body.cert_id === certRow.id)),
    `a certificate uploaded with no date goes to their OneDrive folder and has its date read (${certRow ? calls.map((c) => c.fn).join(', ') : 'upload step not reached here; covered by the code check'})`);
  await o.ctx.close();

  // ---- The office: send back, email, who checks ----
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  const ad = db.profiles.find((p) => p.id === 'me'); Object.assign(ad, {role: 'admin', howto_dismissed: ['*']});
  db.subcontractor_applications = [
    {id: 'a1', org_id: ad.org_id, user_id: 'o1', status: 'new', company_name: 'Jake Roofing', contact_name: 'Jake Morris', email: 'j@x.co', data: {}, files: [], created_at: new Date().toISOString()},
    {id: 'a2', org_id: ad.org_id, user_id: null, status: 'rejected', review_note: 'No insurance certificate.', company_name: 'Acme Ltd', contact_name: 'Sam', email: 'sam@acme.example', data: {}, files: [], created_at: new Date().toISOString()},
  ];
  db.todos = db.todos || [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await signIn(page);
  await page.goto(B + '/pm/admin/subapps/a1'); await page.waitForTimeout(4500);
  await page.getByText('Send Back For More Info', {exact: true}).click(); await page.waitForTimeout(700);
  await page.keyboard.type('Add your CSCS card please'); await page.getByText('OK', {exact: true}).last().click(); await page.waitForTimeout(2000);
  const a1 = db.subcontractor_applications.find((x) => x.id === 'a1');
  check(a1.status === 'rejected' && a1.review_note === 'Add your CSCS card please', `sent back with what's missing (${a1.status}: ${a1.review_note})`);
  check((db.messages || []).some((x) => x.recipient_id === 'o1' && /sent back: Add your CSCS card please/.test(x.body)), 'the operative gets a message saying what’s missing');
  check(/Sent Back/.test(await text(page)), 'the page says Sent Back');
  await page.goto(B + '/pm/admin/subapps/a2'); await page.waitForTimeout(4500);
  check(/Email Them What’s Missing/.test(await text(page)), 'a public applicant: Email Them What’s Missing');
  await page.screenshot({path: path.join(SHOTS, 'sent-back-office.png'), fullPage: true});
  await page.goto(B + '/pm/admin/subapps'); await page.waitForTimeout(4500);
  check(/Who Checks Sign-Ups/i.test(await text(page)) && /Sent Back \(/.test(await text(page)), 'the Sign-Up page: Who Checks Sign-Ups, and a Sent Back tab');
  await page.getByLabel('Who Checks Sign-Ups').first().click(); await page.waitForTimeout(600);
  const pmName = db.profiles.find((p) => p.role === 'pm' || p.role === 'admin' && p.id !== 'me')?.name;
  if (pmName) { await page.getByText(pmName, {exact: true}).last().click(); await page.waitForTimeout(1500); }
  check(!pmName || !!db.organizations[0].signup_checker, `choosing who checks saves it (${db.organizations[0].signup_checker || 'nobody to choose in the seed'})`);
  await ctx.close();

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
