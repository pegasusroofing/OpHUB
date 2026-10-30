// Operative: Subcontractor form tile on Home, submit with blanks shows what's missing, fill in and send.
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
  const home = (await page.evaluate(()=>document.body.innerText)).includes('Subcontractor form');
  console.log('home tile:', home);
  await page.goto(BASE+'/subform'); await page.waitForTimeout(4000);
  await page.screenshot({path:'shots/subform.png'}); console.log('url now', page.url());
  await page.getByText('Submit', {exact:true}).click(); await page.waitForTimeout(800);
  console.log('missing shown:', await page.getByText('This question is required').count());
  const fill = async (label, v)=>{ await page.getByText(label, {exact:true}).locator('xpath=..').locator('input,textarea').first().fill(v); };
  await page.getByPlaceholder('Your answer').first().fill('Acme Roofing');
  for(const o of ['Sole trader','20% deduction','Leadwork','£5 million']) await page.getByText(o, {exact:true}).first().click();
  await page.getByText('Yes', {exact:true}).nth(1).click(); // H&S policy
  const yes = page.getByText('Yes', {exact:true}); await yes.nth(3).click(); // RAMS
  const no = page.getByText('No', {exact:true}); await no.nth(2).click(); await no.nth(3).click(); // RIDDOR, notices
  const inputs = page.locator('input, textarea');
  await page.locator('textarea').first().fill('1 Road, Town');
  await page.getByText('Choose a date', {exact:true}).first().click(); await page.waitForTimeout(600); await page.getByText('Today', {exact:true}).last().click(); await page.waitForTimeout(400);
  const all = await inputs.evaluateAll(els=>els.map((e,i)=>[i,e.placeholder,e.value]));
  const pcIdx = all.findIndex(([i,ph,v],k)=>k>2 && ph==='Your answer' && !v); await inputs.nth(all[pcIdx][0]).fill('AB1 2CD');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('⬆ Add file', {exact:true}).first().click()]); await fc.setFiles(pl); await page.waitForTimeout(2500);
  await page.getByText(/^Postcode/).first().locator("xpath=following::input[1]").fill("AB1 2CD");
  await page.getByText(/^Any HSE improvement/).first().locator("xpath=following::div[text()=\"No\"][1]").click();
  await page.getByText(/^I confirm the information/).click();
  await page.getByText('Submit', {exact:true}).click(); await page.waitForTimeout(3000);
  const left = await page.getByText('This question is required').count();
  console.log('missing which:', await page.evaluate(()=>[...document.querySelectorAll('div')].filter(d=>d.innerText==='This question is required').map(d=>d.parentElement.innerText.split(String.fromCharCode(10))[0]).join(' / ')));
  console.log('still missing:', left, '| sent:', JSON.stringify(db.subcontractor_applications.map(a=>[a.company_name, a.signed_name, (a.files||[]).length])), '| url', page.url().replace(BASE,''), '|', errs.join(' / ') || 'no errors');
  fs.unlinkSync(pl);
  await browser.close(); process.exit(0);
})();
