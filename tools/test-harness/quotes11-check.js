// Quotes as Andy asked on 11 Nov 2026, on a phone, fake database (server calls are caught; nothing is emailed or saved to
// OneDrive): Live / Quoted / All tabs (a returned quote is Quoted, not Live); the outcome filter; the tiles open their view;
// the status bar moves the folder; Submit Quotation marks it quoted with the mark-up and who priced it; Negotiating; Won –
// Convert To Project goes into Create Project filled in from the quote, and making it marks the quote won; New Enquiry with
// Discipline Other typed and + Multiple Clients; Export ▾ offers the views. node quotes11-check.js
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*'];
  const org = me.org_id;
  db.quotes = [
    {id: 'q1', org_id: org, client_name: 'Bellway Homes', contact_name: 'Bob', contact_email: 'bob@bellway.example', title: 'Hove Flats re-roof', address: '12 Kings Rd, Hove', postcode: 'BN3 1AA', discipline: 'Flat Roofing', status: 'pricing', return_date: '2026-11-20', chase_on: true, chase_count: 0, folder_id: 'f1', folder_drive_id: 'd1', guide_markup_pct: 15, priced_by: 'o1', priced_by_name: 'Jake Morris', created_at: '2026-11-03T08:00:00Z'},
    {id: 'q2', org_id: org, client_name: 'Persimmon', contact_phone: '01234', title: 'Ashford School', address: '1 School Lane', postcode: 'TN24 8AA', discipline: 'Pitched Roofing', status: 'returned', value: 84000, profit_pct: 0.12, return_date: '2026-11-01', returned_at: '2026-11-01', chase_on: true, next_chase_date: '2026-12-01', chase_count: 0, created_at: '2026-10-20T08:00:00Z'},
    {id: 'q3', org_id: org, client_name: 'Osborne', title: 'Croydon Depot', status: 'won', value: 120500, return_date: '2026-09-10', returned_at: '2026-09-10', completed_at: '2026-10-02', chase_on: false, chase_count: 1, created_at: '2026-09-01T08:00:00Z'},
    {id: 'q4', org_id: org, client_name: 'Wates', title: 'Leyton Library', status: 'lost', value: 46000, return_date: '2026-08-10', returned_at: '2026-08-10', completed_at: '2026-09-02', chase_on: false, chase_count: 2, created_at: '2026-08-01T08:00:00Z'},
  ];
  db.quote_clients = []; db.quote_chases = [];
  db.quote_settings = [{org_id: org, chase_enabled: true, chase_first_days: 30, chase_every_days: 14, chase_max: 3, cc_email: 'estimating@rtb.example', open_path: 'Est/Open Tenders', template_path: 'Est/Open Tenders/1. New Enquiry - Template'}];
  const calls = [];
  await ctx.route(/functions\/v1\/(quote-tracker|onedrive-[a-z-]+|onedrive-job-pack)/, (r) => {
    const body = JSON.parse(r.request().postData() || '{}'); calls.push({fn: r.request().url().split('/').pop(), ...body});
    const fn = r.request().url().split('/').pop();
    const out = fn === 'onedrive-list-folders' ? (body.parent_id === 'f1' ? {folders: [{id: 'tf', name: '1. Tender Documents'}, {id: 'qf', name: '3. Quotation'}], files: []} : body.parent_id === 'qf' ? {folders: [], files: [{id: 'doc1', name: 'Quote Hove.pdf'}]} : {folders: [], files: [{id: 'doc2', name: 'Drawings.pdf'}]}) : {ok: true};
    r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(out)});
  });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  const body = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const vis = (t) => page.locator(`text="${t}" >> visible=true`);

  // ---- The list ----
  await page.goto(B + '/pm/quotes'); await page.waitForTimeout(4500);
  let t = await body();
  check(/Hove Flats re-roof/.test(t) && !/Ashford School/.test(t), 'Live: being priced, and the returned quote is not in Live');
  check(!/Jake Morris/.test(t), 'who priced it is not shown in the table');
  await page.screenshot({path: path.join(__dirname, 'shots', 'andy11', 'q11-live.png')});
  await page.getByRole('button', {name: /^Quoted Projects/}).click(); await page.waitForTimeout(800);
  t = await body();
  check(/Ashford School/.test(t) && /Croydon Depot/.test(t) && /Leyton Library/.test(t) && !/Hove Flats/.test(t), 'the Quoted Projects tile opens Quoted: every returned job, won and lost too');
  check(/RETURNED/.test(t) && /CHASE/.test(t) && /No News/.test(t), 'Quoted shows returned, chase and the status (No News)');
  await page.getByRole('button', {name: /^Won 1/}).click(); await page.waitForTimeout(600);
  t = await body();
  check(/Croydon Depot/.test(t) && !/Ashford School/.test(t), 'the outcome filter: Won only');
  await page.screenshot({path: path.join(__dirname, 'shots', 'andy11', 'q11-quoted-won.png')});
  await page.getByRole('button', {name: 'Export'}).click(); await page.waitForTimeout(600);
  t = await body();
  check(/What To Export/.test(t) && /This View \(Quoted · Won/.test(t) && /Tender Tracker/.test(t), 'Export ▾ asks what to export: this view, or a report');
  await page.screenshot({path: path.join(__dirname, 'shots', 'andy11', 'q11-export.png')});
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  if (await vis('✕').count()) await vis('✕').last().click().catch(() => {});

  // ---- A tender being priced: the status bar, documents, Submit Quotation ----
  await page.goto(B + '/pm/quotes/q1'); await page.waitForTimeout(4500);
  check(/Quote Hove\.pdf/.test(await body()), 'Documents: the OneDrive files show as links, no "link a folder"');
  await page.getByRole('button', {name: 'Awaiting Information'}).click(); await page.waitForTimeout(1500);
  check(db.quotes.find((x) => x.id === 'q1').status === 'awaiting' && calls.some((c) => c.action === 'status' && c.status === 'awaiting'), 'the status bar saves Awaiting Information and moves the folder');
  await vis('📨 Submit Quotation').click(); await page.waitForTimeout(1500);
  t = await body();
  check(/Quote Hove\.pdf/.test(t) && /1 document ticked/.test(t), 'Submit Quotation: the Quotation folder’s file is ticked to start');
  await page.getByLabel('Contract Value £ *').fill('92000'); await page.getByLabel('Profit Mark-Up %').fill('14');
  await page.screenshot({path: path.join(__dirname, 'shots', 'andy11', 'q11-submit.png')});
  await vis('Next: The Email ›').click(); await page.waitForTimeout(600);
  t = await body();
  check(/estimating@rtb\.example/.test(t) && /bob@bellway\.example/.test(await page.getByLabel('To *').inputValue()), 'the email: To the contact, the preset copy-to shown (on)');
  await page.screenshot({path: path.join(__dirname, 'shots', 'andy11', 'q11-email.png')});
  await vis('Send And Submit').click(); await page.waitForTimeout(600);
  await vis('Send').last().click(); await page.waitForTimeout(3000);
  const q1 = db.quotes.find((x) => x.id === 'q1'), send = calls.find((c) => c.action === 'send');
  check(!!send && send.cc?.includes('estimating@rtb.example') && send.files?.length === 1, 'sent with the preset CC and the ticked document');
  check(q1.status === 'returned' && !!q1.returned_at && Number(q1.value) === 92000 && Math.abs(Number(q1.profit_pct) - 0.14) < 1e-9 && q1.priced_by === 'me', `submitted: quoted, value, mark-up 14%, priced by the person submitting (${q1.status}, ${q1.priced_by})`);
  t = await body();
  check(/Won – Convert To Project/.test(t) && /Negotiating/.test(t) && /Lost/.test(t), 'once quoted, the outcome buttons show');
  await page.screenshot({path: path.join(__dirname, 'shots', 'andy11', 'q11-quoted.png')});
  await vis('Negotiating').first().click(); await page.waitForTimeout(1500);
  check(db.quotes.find((x) => x.id === 'q1').status === 'negotiating', 'Negotiating saved');

  // ---- Won – Convert To Project ----
  await page.goto(B + '/pm/quotes/q2'); await page.waitForTimeout(4000);
  await vis('🏆 Won – Convert To Project').click(); await page.waitForTimeout(700);
  t = await body();
  check(/Won, Convert To Project/.test(t) && /\bNo\b/.test(t), 'the pop-up says No / Won, Convert To Project');
  await vis('Won, Convert To Project').last().click(); await page.waitForTimeout(4000);
  check(/\/sites\/new/.test(page.url()) && (await page.locator('input').first().inputValue()) === 'Ashford School', `Create Project, filled in from the quote (${page.url().replace(B, '')})`);
  await page.locator('input').nth(3).fill('J777');
  await page.getByText('Upcoming', {exact: true}).click();
  await page.getByText('Choose a date', {exact: true}).last().click(); await page.waitForTimeout(600); await page.getByText('Today', {exact: true}).last().click(); await page.waitForTimeout(400);
  await page.screenshot({path: path.join(__dirname, 'shots', 'andy11', 'q11-convert.png')});
  await page.getByText('Create Project', {exact: true}).click(); await page.waitForTimeout(6000);
  const site = (db.sites || []).find((s) => s.name === 'Ashford School');
  const q2 = db.quotes.find((x) => x.id === 'q2');
  check(!!site && q2.site_id === site.id && q2.status === 'won' && (db.sites || []).filter((s) => s.name === 'Ashford School').length === 1, 'one project made, the quote marked won and linked to it');
  check(new RegExp(`/sites/${site?.id}`).test(page.url()), 'and it opens the new project (no stuck page)');
  await page.goto(B + '/pm/quotes/q2'); await page.waitForTimeout(4000);
  await vis('🏆 Won – Convert To Project').click(); await page.waitForTimeout(700);
  check(/already has a project/.test(await body()), 'a quote with a project asks before making another');
  await vis('No').last().click(); await page.waitForTimeout(400);

  // ---- New Enquiry ----
  await page.goto(B + '/pm/quotes/new'); await page.waitForTimeout(4000);
  await page.getByLabel('Client *').fill('Kier Group'); await page.getByLabel('Project Name *').fill('Brent Block D');
  await page.getByRole('button', {name: 'Discipline'}).click(); await page.waitForTimeout(500); await vis('Other').last().click(); await page.waitForTimeout(400);
  await page.getByLabel('Discipline (Type It)').fill('Cladding');
  await vis('+ Multiple Clients').click(); await page.waitForTimeout(600);
  await page.getByLabel('Search clients').fill('Wates Ltd'); await page.waitForTimeout(800);
  await page.getByText('+ Add "Wates Ltd" As A New Client').click(); await page.waitForTimeout(300);
  await vis('Add 1 Client').click(); await page.waitForTimeout(500);
  await page.screenshot({path: path.join(__dirname, 'shots', 'andy11', 'q11-new.png')});
  await vis('Create Enquiry').click(); await page.waitForTimeout(5000);
  const nq = db.quotes.find((x) => x.title === 'Brent Block D');
  check(!!nq && nq.discipline === 'Cladding' && db.quote_clients.some((c) => c.quote_id === nq.id && c.client_name === 'Wates Ltd'), 'New Enquiry: Discipline Other typed, and the second client added');
  check(calls.some((c) => c.action === 'folder' && c.quote_id === nq?.id), 'and its OneDrive folder is made straight away');
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
