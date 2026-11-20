// Email templates (Andy, 19 Nov 2026): "in the email templates can we add in the place holders that are possible as add
// buttons and autopopulate the email signatures please like you did for rtb roofing", and "make sure the item is added in
// there, as currently the rams/coshh are just the document number". Finance › Settings › Templates and the quote chaser
// wording: + buttons add {project} and the rest where the cursor is; the signature shows filled in; RAMS / COSHH emails
// have a Document Type fill-in. Fake database, laptop size. node emailtpl19-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  require('./seeds/world')(db);
  const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.finance_enabled = true; me.name = 'Andy Test'; me.phone = '07700 900123';
  const O = db.organizations[0].id; db.organizations[0].rams_settings = {address: 'Unit 1\nTest Road\nTestville', phone: '01234 000000', nextRa: 4};
  db.fin_email_templates = [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

  await page.goto(B + '/fin/templates'); await page.waitForTimeout(4000);
  let t = await text();
  check(/Email Signature/.test(t) && /Andy Test/.test(t) && /07700 900123/.test(t) && /Unit 1, Test Road, Testville/.test(t) && /Tel: 01234 000000/.test(t), 'the signature shows filled in: name, phone, company address and phone');
  await page.screenshot({path: path.join(__dirname, 'shots', 'emailtpl19-page.png')});

  await page.getByText('+ New Template', {exact: true}).click(); await page.waitForTimeout(1200);
  t = await text();
  check(/\+ Client/.test(t) && /\+ Project/.test(t) && /\+ Application No\./.test(t) && /\+ My Name/.test(t), 'the template has add buttons for the fill-ins');
  check(/Under The Message/.test(t), 'the template shows the signature under the message');
  // The cursor at the end of the message, then + Project.
  const msg = page.locator('textarea[aria-label="Message"]');
  await msg.click(); await page.keyboard.press('Control+End'); await page.keyboard.type('\n\nFor '); await page.waitForTimeout(300);
  await page.getByText('+ Project', {exact: true}).click(); await page.waitForTimeout(400);
  let body = await msg.inputValue();
  check(/For \{project\}$/.test(body), `+ Project adds {project} where the cursor is (…${JSON.stringify(body.slice(-20))})`);
  // The subject: cursor at the start, then + Job No.
  const subj = page.locator('input[aria-label="Subject"]');
  await subj.click(); await page.keyboard.press('Home'); await page.waitForTimeout(200);
  t = await text();
  check(/Tap to add to the subject/.test(t), 'tapping the subject makes the buttons add to the subject');
  await page.getByText('+ Job No.', {exact: true}).click(); await page.waitForTimeout(400);
  const s1 = await subj.inputValue();
  check(/^\{job_no\} Application for payment/.test(s1), `+ Job No. goes at the start of the subject (${s1.slice(0, 40)})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'emailtpl19-template.png')});
  await page.locator('input[placeholder="e.g. Standard application"]').fill('Test Template');
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(1500);
  const saved = db.fin_email_templates[0] || {};
  check(/For \{project\}/.test(saved.body || '') && /^\{job_no\}/.test(saved.subject || ''), 'the fill-ins are saved with the template');

  // RAMS / COSHH: a Document Type fill-in, not the number.
  await page.getByText('+ New Template', {exact: true}).click(); await page.waitForTimeout(1000);
  await page.locator('[aria-label="For"] >> visible=true').first().click(); await page.waitForTimeout(600);
  await page.getByText('RAMS / COSHH Documents (H&S)', {exact: true}).last().click(); await page.waitForTimeout(600);
  t = await text();
  check(/\+ Document Type \(RAMS \/ COSHH\)/.test(t) && !/\+ Document /.test(t.replace('+ Document Type', '')), 'RAMS / COSHH templates have a Document Type button');
  await page.getByText('Cancel', {exact: true}).last().click(); await page.waitForTimeout(600);

  // The quote chaser wording.
  await page.goto(B + '/pm/quotes/settings'); await page.waitForTimeout(4000);
  t = await text();
  check(/\+ Contact Name/.test(t) && /\+ Date Quoted/.test(t) && /Email Signature/.test(t), 'the chaser wording has add buttons and the signature');
  const wording = page.locator('textarea[aria-label="Email Wording"]');
  await wording.click(); await page.keyboard.press('Control+Home'); await page.waitForTimeout(200);
  await page.getByText('+ Client', {exact: true}).click(); await page.waitForTimeout(400);
  body = await wording.inputValue();
  check(/^\{client\} Hi/.test(body), `+ Client goes where the cursor is in the wording (${body.slice(0, 20)})`);
  await page.screenshot({path: path.join(__dirname, 'shots', 'emailtpl19-chaser.png'), fullPage: true});
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
