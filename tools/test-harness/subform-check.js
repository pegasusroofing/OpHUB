// Operative: Subcontractor Form tile on Home, submit with blanks shows what's missing, fill in and send.
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const fs = require('fs'), path = require('path');
(async()=>{
  const BASE = 'http://localhost:8081';
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'operative', [], {viewport:{width:1300, height:900}});
  seed(db); const me = db.profiles.find(p=>p.id==='me'); if(me) me.role = 'operative';
  db.subcontractor_applications = [];
  const pl = path.join(__dirname, 'shots', 'pl.pdf'); fs.writeFileSync(pl, '%PDF-1.4\n%%EOF');
  const page = await ctx.newPage(); page.on('pageerror', e=>errs.push(e.message));
  await page.goto(BASE+'/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact:true}).click(); await page.waitForTimeout(6000);
  const home = (await page.evaluate(()=>document.body.innerText)).includes('Subcontractor Form');
  console.log('home tile:', home);
  await page.goto(BASE+'/subform'); await page.waitForTimeout(4000);
  await page.screenshot({path:'shots/subform.png'}); console.log('url now', page.url());
  // The form is in tabs since 20 Nov 2026: open the tab a question is on before using it.
  const reveal = async (loc) => { if (await loc.first().isVisible().catch(() => false)) return; const tabs = page.getByRole('tab'); const n = await tabs.count(); for (let i = 0; i < n; i++) { await tabs.nth(i).click(); await page.waitForTimeout(250); if (await loc.first().isVisible().catch(() => false)) return; } };
  await reveal(page.getByText('Submit', {exact:true}));
  await page.getByText('Submit', {exact:true}).click(); await page.waitForTimeout(800);
  console.log('missing shown:', await page.getByText('This question is required').count());
  const fill = async (label, v)=>{ await page.getByText(label, {exact:true}).locator('xpath=..').locator('input,textarea').first().fill(v); };
  // Answered by each question's wording (19 Nov 2026: the form comes from the company's template, so positions can move).
  const ans = async (re, opt) => { await reveal(page.getByText(re)); await page.getByText(re).first().locator(`xpath=following::div[text()="${opt}"][1]`).click(); };
  const box = async (re, v) => { await reveal(page.getByText(re)); await page.getByText(re).first().locator('xpath=following::*[self::input or self::textarea][1]').fill(v); };
  await box(/^Company Name/, 'Acme Roofing');
  await ans(/^Business Type/, 'Sole trader'); await ans(/^CIS Status/, '20% deduction'); await ans(/^Trades/, 'Leadwork'); await ans(/^Public Liability Cover/, '£5 million');
  await ans(/^Do You Have A Written Health/, 'Yes'); await ans(/^Can You Produce Your Own RAMS/, 'Yes'); await ans(/^Any RIDDOR/, 'No'); await ans(/^Any HSE Improvement/i, 'No');
  await box(/^Business Address/, '1 Road, Town');
  await reveal(page.getByText('Choose a date', {exact:true})); await page.getByText('Choose a date', {exact:true}).first().click(); await page.waitForTimeout(600); await page.getByText('Today', {exact:true}).last().click(); await page.waitForTimeout(400);
  await reveal(page.getByText('⬆ Add file', {exact:true}));
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('⬆ Add file', {exact:true}).first().click()]); await fc.setFiles(pl); await page.waitForTimeout(2500);
  await box(/^Postcode/, 'AB1 2CD');
  await reveal(page.getByText(/^I confirm the information/)); await page.getByText(/^I confirm the information/).click();
  await page.getByText('Submit', {exact:true}).click(); await page.waitForTimeout(3000);
  const left = await page.getByText('This question is required').count();
  console.log('missing which:', await page.evaluate(()=>[...document.querySelectorAll('div')].filter(d=>d.innerText==='This question is required').map(d=>d.parentElement.innerText.split(String.fromCharCode(10))[0]).join(' / ')));
  console.log('still missing:', left, '| sent:', JSON.stringify(db.subcontractor_applications.map(a=>[a.company_name, a.signed_name, (a.files||[]).length])), '| url', page.url().replace(BASE,''), '|', errs.join(' / ') || 'no errors');
  fs.unlinkSync(pl);
  await browser.close(); process.exit(0);
})();
