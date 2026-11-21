// One Directory that talks to Xero (Andy, 21 Nov 2026): "It's a single directory that talks to Xero, I don't want
// duplicates. So whatever Xero needs for suppliers, clients etc we need to make sure we have in the directory to fill in
// and issue to Xero. We have estimating tab in directory which isn't needed ... the estimating just pulls through from ANY
// (client, supplier etc)". Laptop, fake database (Xero answered by the harness). node dir21-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const seed = require('./fresh/seed');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'dir21'); require('fs').mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id;
  db.fin_clients = [{id: 'fc1', org_id: O, name: 'Bellway Homes', email: 'acc@bellway.example', xero_contact_id: '11111111-2222-3333-4444-555555555555'},
    {id: 'fc2', org_id: O, name: 'Acme Roofing Supplies', email: 'old@acme.example', phone: '0100 000000'}];
  db.fin_suppliers = [{id: 'fs1', org_id: O, name: 'Acme Roofing Supplies', email: 'old@acme.example', phone: '0100 000000'}];
  db.fin_cost_codes = [{id: 'cc1', org_id: O, name: 'Sales', code: '200', grp: 'Income', active: true}];
  const fns = [];
  global.__fn = (name, b) => {
    fns.push([name, b]);
    if (name !== 'xero') return {ok: true};
    if (b.action === 'status') return {configured: true, connected: true, tenant_name: 'Test Xero'};
    if (b.action === 'create_contact') return {ok: true, contact: {id: '99999999-8888-7777-6666-555555555555', name: b.name}};
    if (b.action === 'update_contact') return {ok: true, id: b.id};
    return {ok: true};
  };
  global.__rpc = (n, b) => (n === 'quote_client_search_v4' ? [
    {id: 'fc1', kind: 'client', name: 'Bellway Homes', email: 'acc@bellway.example', phone: null},
    {id: 'fs9', kind: 'supplier', name: 'Slate & Tile Co', email: 'sales@slate.example', phone: null},
  ].filter((h) => h.name.toLowerCase().includes(String(b.q || '').toLowerCase())) : undefined);
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  await page.goto(B + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  await page.goto(B + '/fin/directory?kind=client'); await page.waitForTimeout(5000);
  const tabs = (await page.getByRole('tab').allInnerTexts()).map((x) => x.trim());
  check(tabs.includes('Clients') && tabs.includes('Suppliers') && !tabs.includes('Estimating'), `Directory tabs: Clients, Suppliers, no Estimating (${tabs.join(' | ')})`);
  // A client linked to Xero: every Xero field, its estimating details, and the change goes to Xero.
  await page.getByText('Bellway Homes', {exact: true}).first().click(); await page.waitForTimeout(1200);
  let t = await text();
  check(['Contact', 'Address', 'VAT, CIS And Payment Terms', 'Estimating'].every((h) => t.includes(h)) && /Main Contact First Name/.test(t) && /Mobile/.test(t) && /Account Number \(Your Reference\)/.test(t) && /Country/.test(t) && /Estimator Name/.test(t) && /Update Xero As Well/.test(t),
    'a client: Contact / Address / VAT, CIS And Payment Terms / Estimating, with the Xero fields and Update Xero As Well');
  await page.getByLabel('Main Contact First Name', {exact: true}).fill('Jane');
  await page.getByLabel('Main Contact Last Name', {exact: true}).fill('Smith');
  await page.getByLabel('Mobile', {exact: true}).fill('07700 900555');
  await page.getByLabel('Account Number (Your Reference)', {exact: true}).fill('BEL001');
  await page.getByLabel('VAT Number', {exact: true}).fill('GB123456789');
  await page.getByLabel('Estimator Name', {exact: true}).fill('Sam Estimator');
  await page.getByLabel('Estimating Mark-Up %', {exact: true}).fill('12');
  await page.screenshot({path: path.join(SHOTS, 'client-form-laptop.png'), fullPage: true});
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(3000);
  const c1 = db.fin_clients.find((c) => c.id === 'fc1');
  check(c1.first_name === 'Jane' && c1.last_name === 'Smith' && c1.mobile === '07700 900555' && c1.account_number === 'BEL001' && c1.estimator_name === 'Sam Estimator' && Number(c1.estimating_markup_pct) === 12, 'saved in the Directory: contact, mobile, account number, estimator, mark-up');
  const up = fns.find(([n, b]) => n === 'xero' && b.action === 'update_contact');
  check(!!up && up[1].id === c1.xero_contact_id && up[1].first_name === 'Jane' && up[1].mobile === '07700 900555' && up[1].account_number === 'BEL001' && !up[1].supplier, `the change goes to its Xero contact (${up ? Object.keys(up[1]).filter((k) => up[1][k]).join(', ') : 'nothing sent'})`);

  // A supplier: bank details, added to Xero with them; its client twin follows its details.
  await page.goto(B + '/fin/directory?kind=supplier'); await page.waitForTimeout(5000);
  await page.getByText('Acme Roofing Supplies', {exact: true}).first().click(); await page.waitForTimeout(1200);
  t = await text();
  check(/Bank Details \(For Paying Them\)/.test(t) && /Sort Code/.test(t) && /Bank Account Number/.test(t) && /Add To Xero As Well/.test(t) && !/Estimator Name/.test(t), 'a supplier: Bank Details, Add To Xero As Well, no Estimating');
  await page.getByLabel('Sort Code', {exact: true}).fill('12345');
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(1500);
  check(/A sort code is 6 numbers/.test(await text()), 'a short sort code is stopped');
  await page.getByLabel('Sort Code', {exact: true}).fill('123456');
  await page.getByLabel('Bank Account Number', {exact: true}).fill('12345678');
  await page.getByLabel('Phone', {exact: true}).fill('0200 111222');
  await page.getByLabel('Supplier Email', {exact: true}).fill('accounts@acme.example');
  await page.screenshot({path: path.join(SHOTS, 'supplier-form-laptop.png'), fullPage: true});
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(3000);
  const s1 = db.fin_suppliers.find((x) => x.id === 'fs1');
  check(s1.bank_sort_code === '12-34-56' && s1.bank_account_number === '12345678' && s1.xero_contact_id === '99999999-8888-7777-6666-555555555555', `the supplier saves its bank details and is linked to its new Xero contact (${s1.bank_sort_code}, ${s1.xero_contact_id})`);
  const cr = fns.find(([n, b]) => n === 'xero' && b.action === 'create_contact');
  check(!!cr && cr[1].supplier === true && cr[1].bank_sort_code === '12-34-56' && cr[1].bank_account_number === '12345678' && cr[1].email === 'accounts@acme.example', 'added to Xero with its bank details and email');
  const twin = db.fin_clients.find((c) => c.id === 'fc2');
  check(twin.phone === '0200 111222' && twin.email === 'accounts@acme.example' && twin.xero_contact_id === s1.xero_contact_id, 'the same company as a client follows: phone, email and the one Xero contact (no second Xero record)');

  // Estimating finds suppliers as well as clients.
  await page.goto(B + '/pm/quotes/new'); await page.waitForTimeout(5000);
  const box = page.getByPlaceholder('Start Typing To Search Your Directory').first();
  if (await box.count()) { await box.fill('Sla'); await page.waitForTimeout(1500); }
  t = await text();
  check(/Slate & Tile Co/.test(t), 'a new enquiry\'s client search finds a supplier in the Directory');
  await page.screenshot({path: path.join(SHOTS, 'enquiry-search-laptop.png')});
  await ctx.close();
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
