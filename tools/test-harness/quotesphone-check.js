// Andy's Quotes list on the phone, 11 Nov 2026 (evening), touch phone, fake database (server calls caught, nothing sent):
// the columns per tab (Live: Due Back with a red border once past, no discipline; Quoted: Value and a short Chase date;
// All: Date), dates centred and Status at the right, no View drop-down, the thin footer with Export left and Settings
// right; Directory › Estimating saves a client's estimator and Auto Chase; a New Enquiry fills the contact from it and
// starts with the chaser off; Submit Quotation's + Add Documents puts a file in the Quotation folder, ticked to send.
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'andy11');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {shot: true});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*'];
  const org = me.org_id;
  db.quotes = [
    {id: 'q1', org_id: org, client_name: 'Bellway Homes', contact_name: 'Bob', contact_email: 'bob@bellway.example', title: 'Hove Flats re-roof', discipline: 'Flat Roofing', status: 'pricing', return_date: '2026-11-01', chase_on: true, chase_count: 0, folder_id: 'f1', created_at: '2026-10-20T08:00:00Z'},
    {id: 'q5', org_id: org, client_name: 'Countryside', title: 'Lewes Barns', discipline: 'Pitched Roofing', status: 'pricing', return_date: '2099-01-30', chase_on: true, chase_count: 0, created_at: '2026-10-21T08:00:00Z'},
    {id: 'q2', org_id: org, client_name: 'Persimmon', title: 'Ashford School', status: 'returned', value: 84000, profit_pct: 0.12, return_date: '2026-11-01', returned_at: '2026-11-01', chase_on: true, next_chase_date: '2026-12-01', chase_count: 0, created_at: '2026-10-01T08:00:00Z'},
    {id: 'q3', org_id: org, client_name: 'Osborne', title: 'Croydon Depot', status: 'won', value: 120500, return_date: '2026-09-10', returned_at: '2026-09-10', completed_at: '2026-10-02', chase_on: false, chase_count: 1, created_at: '2026-09-01T08:00:00Z'},
  ];
  db.quote_clients = []; db.quote_chases = [];
  db.quote_settings = [{org_id: org, chase_enabled: true, chase_first_days: 30, chase_every_days: 14, chase_max: 3, cc_email: 'estimating@rtb.example', open_path: 'Est/Open Tenders', template_path: 'Est/Open Tenders/1. New Enquiry - Template'}];
  // OneDrive: the tender folder f1 has 1. Tender Documents and 3. Quotation (with one quote in it); uploads land there.
  const qfiles = [{id: 'doc1', name: 'Quote Hove.pdf'}]; const calls = [];
  await ctx.route(/functions\/v1\/(quote-tracker|onedrive-[a-z-]+|onedrive-job-pack)/, (r) => {
    const fn = r.request().url().split('/').pop(); const body = JSON.parse(r.request().postData() || '{}'); calls.push({fn, ...body});
    if (fn === 'onedrive-upload') { if (body.folder_id === 'qf') qfiles.push({id: `up${qfiles.length}`, name: body.filename}); return r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true})}); }
    const out = fn === 'onedrive-list-folders' ? (body.parent_id === 'f1' ? {folders: [{id: 'tf', name: '1. Tender Documents'}, {id: 'qf', name: '3. Quotation'}], files: []} : body.parent_id === 'qf' ? {folders: [], files: qfiles} : {folders: [], files: []}) : {ok: true, id: 'f9', path: 'Est/Open Tenders/X'};
    r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(out)});
  });
  db.fin_clients.push({id: 'cl2', org_id: org, name: 'Countryside Partnerships', email: 'accounts@countryside.example', created_at: new Date().toISOString()});
  // Save To Directory, as the database does it.
  await ctx.route(/rest\/v1\/rpc\/quote_set_client_estimator/, (r) => { const b = JSON.parse(r.request().postData() || '{}'); const c = db.fin_clients.find((x) => x.id === b.p_client); if (c) Object.assign(c, {estimator_name: b.p_name || null, estimator_email: b.p_email || null, estimator_phone: b.p_phone || null}); r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(!!c)}); });
  // The client search (v3) as the database answers it, with the Directory › Estimating fields.
  await ctx.route(/rest\/v1\/rpc\/quote_client_search_v\d/, (r) => r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(db.fin_clients.map((c) => ({id: c.id, name: c.name, email: c.email || null, phone: c.phone || null, markup: c.estimating_markup_pct ?? null, estimator_name: c.estimator_name || null, estimator_email: c.estimator_email || null, estimator_phone: c.estimator_phone || null, quote_chase: c.quote_chase !== false})))}));
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  const table = async () => page.locator('[aria-label="Quotes table"] >> visible=true').first().innerText();
  const align = (text) => page.evaluate((t) => { const e = [...document.querySelectorAll('[aria-label="Quotes table"] div')].find((d) => d.textContent === t && !d.children.length); return e ? getComputedStyle(e).textAlign : ''; }, text);

  // ---- Live ----
  await page.goto(B + '/pm/quotes'); await page.waitForTimeout(5000);
  let t = await table();
  check(/DUE BACK/.test(t) && /STATUS/.test(t), 'Live: Project, Due Back, Status');
  check(!/Flat Roofing|Pitched Roofing/.test(t), 'Live: no discipline under the client');
  check(await page.locator('[aria-label$=", overdue"] >> visible=true').count() === 1, 'the past Due Back date has the red border (one quote)');
  const red = await page.locator('[aria-label$=", overdue"] >> visible=true').first().evaluate((e) => getComputedStyle(e).borderTopColor);
  check(red === 'rgb(200, 16, 46)', `and it is red (${red})`);
  check(await align('DUE BACK') === 'center' && await align('STATUS') === 'right', 'Due Back centred, Status at the right');
  check(await page.getByLabel('View', {exact: true}).count() === 0, 'no View drop-down');
  const ex = await page.locator('[aria-label="Export"] >> visible=true').first().boundingBox();
  const st = await page.locator('[aria-label="Quote Settings"] >> visible=true').first().boundingBox();
  check(!!ex && !!st && ex.x < 120 && st.x > 220, `footer: Export bottom left, Settings bottom right (${ex && Math.round(ex.x)}, ${st && Math.round(st.x)})`);
  await page.screenshot({path: path.join(SHOTS, 'qp-live.png'), fullPage: true});

  // ---- Quoted ----
  await page.getByRole('tab', {name: /^Quoted/}).first().click(); await page.waitForTimeout(1000);
  t = await table();
  check(/VALUE/.test(t) && /CHASE/.test(t) && !/RETURNED/.test(t), 'Quoted: Project, Value, Chase, Status');
  check(/£84k/.test(t) && /1 Dec/.test(t) && !/1 Dec 26/.test(t) && /Off/.test(t), 'Value short (£84k), Chase short with no year (1 Dec), Off when the chaser is off');
  check(await align('CHASE') === 'center' && await align('VALUE') === 'center' && await align('STATUS') === 'right', 'Value and Chase centred, Status at the right');
  await page.screenshot({path: path.join(SHOTS, 'qp-quoted.png'), fullPage: true});

  // ---- All ----
  await page.getByRole('tab', {name: /^All/}).first().click(); await page.waitForTimeout(1000);
  t = await table();
  check(/DATE/.test(t) && await align('DATE') === 'center' && await align('STATUS') === 'right', 'All: Date centred, Status at the right');
  await page.screenshot({path: path.join(SHOTS, 'qp-all.png'), fullPage: true});

  // ---- Directory › Estimating ----
  await page.goto(B + '/fin/directory?kind=estimating'); await page.waitForTimeout(5000);
  t = await page.locator('body').innerText();
  check(/Estimating/.test(t) && /Bellway Homes/.test(t) && /No Estimator Yet/.test(t), 'Directory has an Estimating tab with the clients');
  await page.locator('[aria-label="Estimating"] >> text=Bellway Homes').first().click(); await page.waitForTimeout(1000);
  await page.getByLabel('Estimator Name', {exact: true}).fill('Sam Estimator');
  await page.getByLabel('Estimator Email', {exact: true}).fill('sam@bellway.example');
  await page.getByLabel('Estimator Phone', {exact: true}).fill('07700 900123');
  await page.getByLabel('Estimating Mark-Up %', {exact: true}).fill('15');
  await page.getByLabel('Auto Chase New Quotes?', {exact: true}).click(); await page.waitForTimeout(500);
  await page.getByText('No', {exact: true}).last().click(); await page.waitForTimeout(400);
  await page.screenshot({path: path.join(SHOTS, 'qp-estimating-form.png')});
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2000);
  const c1 = db.fin_clients.find((c) => c.id === 'cl1');
  check(c1.estimator_name === 'Sam Estimator' && c1.estimator_email === 'sam@bellway.example' && c1.estimator_phone === '07700 900123' && Number(c1.estimating_markup_pct) === 15 && c1.quote_chase === false, 'Estimating saves the estimator, mark-up and Auto Chase No');
  check(!c1.xero_contact_id && !calls.some((c) => /xero/.test(c.fn)), 'nothing goes to Xero');
  await page.screenshot({path: path.join(SHOTS, 'qp-estimating.png'), fullPage: true});

  // ---- New Enquiry fills from it ----
  await page.goto(B + '/pm/quotes/new'); await page.waitForTimeout(4500);
  await page.getByLabel('Client *', {exact: true}).fill('Bell'); await page.waitForTimeout(1500);
  await page.getByText('Bellway Homes', {exact: true}).last().click(); await page.waitForTimeout(600);
  const val = (l) => page.getByLabel(l, {exact: true}).first().inputValue();
  check(await val('Contact Name') === 'Sam Estimator' && await val('Contact Email (For The Chaser)') === 'sam@bellway.example' && await val('Contact Number') === '07700 900123', 'New Enquiry: the estimator fills the contact');
  check(await page.locator('[aria-label="Save To Directory"] >> visible=true').count() === 0, 'no Save To Directory when the client already has an estimator');
  await page.getByLabel('Project Name *', {exact: true}).fill('Brighton Marina'); await page.waitForTimeout(200);
  await page.getByText('Create Enquiry', {exact: true}).last().click(); await page.waitForTimeout(4000);
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const nq = db.quotes.find((x) => x.title === 'Brighton Marina');
  check(!!nq && nq.contact_email === 'sam@bellway.example' && nq.chase_on === false, `saved with the estimator's email and the chaser off (${nq && nq.chase_on})`);
  check(!!nq && nq.received_date === today, `Enquiry Received is the day it was added (${nq && nq.received_date})`);

  // ---- A client with no estimator: Save To Directory ----
  await page.goto(B + '/pm/quotes/new'); await page.waitForTimeout(4500);
  await page.getByLabel('Client *', {exact: true}).fill('Country'); await page.waitForTimeout(1500);
  await page.getByText('Countryside Partnerships', {exact: true}).last().click(); await page.waitForTimeout(600);
  check(await val('Contact Name') === '' && await page.locator('[aria-label="Save To Directory"] >> visible=true').count() === 0, 'no estimator saved: the contact starts empty, nothing to save yet');
  await page.getByLabel('Contact Name', {exact: true}).fill('Priya Patel');
  await page.getByLabel('Contact Email (For The Chaser)', {exact: true}).fill('priya@countryside.example');
  await page.getByLabel('Contact Number', {exact: true}).fill('01273 000111'); await page.waitForTimeout(300);
  check(await page.locator('[aria-label="Save To Directory"] >> visible=true').count() === 1, 'typed a contact: Save To Directory is offered');
  await page.screenshot({path: path.join(SHOTS, 'qp-save-to-directory.png')});
  await page.locator('[aria-label="Save To Directory"] >> visible=true').click(); await page.waitForTimeout(1500);
  const c2 = db.fin_clients.find((c) => c.id === 'cl2');
  check(c2.estimator_name === 'Priya Patel' && c2.estimator_email === 'priya@countryside.example' && c2.estimator_phone === '01273 000111', 'saved as their estimator in Directory › Estimating');
  check(/In The Directory As Countryside Partnerships’s Estimator/.test(await page.locator('body').innerText()) && await page.locator('[aria-label="Save To Directory"] >> visible=true').count() === 0, 'it says so, and the button goes');

  // ---- Submit Quotation: + Add Documents ----
  await page.goto(B + '/pm/quotes/q1'); await page.waitForTimeout(5000);
  await page.locator('text="📨 Submit Quotation" >> visible=true').click(); await page.waitForTimeout(2000);
  check(/1 document ticked/.test(await page.locator('body').innerText()), 'Submit Quotation starts with the quote ticked');
  const fc = page.waitForEvent('filechooser');
  await page.locator('text="+ Add Documents" >> visible=true').last().click();
  await (await fc).setFiles([path.join(__dirname, 'shots', 'samples', 'sample.pdf')]); await page.waitForTimeout(4000);
  t = await page.locator('body').innerText();
  check(calls.some((c) => c.fn === 'onedrive-upload' && c.folder_id === 'qf' && c.filename === 'sample.pdf'), 'the file goes in the Quotation folder');
  check(/sample\.pdf/.test(t) && /2 documents ticked/.test(t), 'and comes back ticked to send');
  await page.screenshot({path: path.join(SHOTS, 'qp-submit-add.png')});

  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
