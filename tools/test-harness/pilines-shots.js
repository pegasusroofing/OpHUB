// Purchase invoice lines, tidied (Andy, 6 Nov 2026): one centred row per line beside the PDF and with it folded away,
// cost codes as numbers, the "couldn't read" note closes with ✕, Due Date beside the Project, "Allocate To PO", and
// the › strip down the PDF's left edge folds it away. Fake database only.
// node pilines-shots.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1500, height: 950}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*']; db.organizations[0].has_pm = true;
  const O = db.organizations[0].id;
  db.fin_cost_codes = [{id: 'cc1', org_id: O, code: 'M100', name: 'Materials', category: 'materials', active: true}, {id: 'cc2', org_id: O, code: 'P200', name: 'Plant hire', category: 'plant', active: true}];
  db.fin_inbox = db.fin_inbox || []; db.fin_inbox.push({id: 'ib9', org_id: O, status: 'new', stage: 'query', received_at: '2026-11-01T09:00:00Z', file_name: 'zza-two.pdf', file_path: `${O}/inbox/zza-two.pdf`, query_reason: 'Reader error'});
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/inbox/ib9'); await page.waitForTimeout(5000);
  await page.getByLabel('Line 1 description').fill('Bauder K4E capsheet'); await page.getByLabel('Line 1 quantity').fill('24'); await page.getByLabel('Line 1 unit price').fill('86.45');
  await page.getByText('+ Add A Line', {exact: true}).click(); await page.waitForTimeout(300);
  await page.getByLabel('Line 2 description').fill('Type 3 trim'); await page.getByLabel('Line 2 quantity').fill('40'); await page.getByLabel('Line 2 unit price').fill('7.71');
  await page.getByLabel('Line 2 cost code').click(); await page.waitForTimeout(300); await page.getByText('P200 – Plant hire').last().click(); await page.waitForTimeout(300);
  const y = async (l) => Math.round((await page.getByLabel(l).boundingBox()).y);
  check(Math.abs(await y('Line 1 job') - await y('Line 1 VAT')) < 3, 'beside the PDF: the description, then job, code and figures on one row');
  check(await page.getByText('Description', {exact: true}).count() >= 2, 'beside the PDF each line has its own Description heading');
  const x = async (l) => Math.round((await page.getByLabel(l, {exact: true}).last().boundingBox()).x);
  check(await x('Project') < await x('Allocate To PO') && await x('Allocate To PO') < await x('Due date'), 'Project, then Allocate To PO, then Due Date on the right');
  // The drop-down list floats over the page: its top item is what's under the pointer.
  await page.getByLabel('Line 1 cost code').click(); await page.waitForTimeout(400);
  const it = page.getByText('P200 – Plant hire').last(); const b = await it.boundingBox();
  const hit = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.textContent || '', [b.x + 20, b.y + b.height / 2]);
  check(hit.includes('P200'), 'the cost code list sits on top of the page (' + hit.slice(0, 30) + ')');
  await page.screenshot({path: 'shots/job/pilines-drop-1500.png'});
  await page.keyboard.press('Escape'); await page.getByLabel('Line 2 description').click();
  // Tab to + Add A Line and press Enter: the cursor lands in the new line's description.
  await page.getByRole('button', {name: '+ Add A Line'}).focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  check(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Line 3 description', 'Enter on + Add A Line goes to the new line’s description');
  await page.keyboard.type('Ridge tiles'); check(await page.getByLabel('Line 3 description').inputValue() === 'Ridge tiles', 'and you can keep typing');
  await page.getByLabel('Remove line 3').click(); await page.waitForTimeout(300);
  check(await page.getByLabel('Line 2 cost code').inputValue() === 'P200', 'the cost code shows just the number');
  check(await page.getByLabel('Allocate To PO').count() >= 1, 'Allocate To PO');
  await page.screenshot({path: 'shots/job/pilines-pdf-1500.png'});
  await page.getByLabel('Close the note').click(); await page.waitForTimeout(300);
  check(await page.getByText(/Couldn’t read this one automatically/).count() === 0, 'the note closes with its ✕');
  await page.getByLabel('Close the document').click(); await page.waitForTimeout(800);
  check(await page.getByLabel('Show the document').count() === 1, 'the › strip folds the PDF away (a DOCUMENT tab brings it back)');
  await page.getByText('Show Code Descriptions').click(); await page.waitForTimeout(300);
  check((await page.getByLabel('Line 2 cost code').inputValue()).includes('Plant hire'), 'Show Code Descriptions shows the names');
  await page.screenshot({path: 'shots/job/pilines-full-1500.png'});
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
