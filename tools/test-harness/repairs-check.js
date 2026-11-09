// Repair contracts, rebuilt (Andy, 7 Nov 2026; docs/claude-code/REPAIRS-PLAN.md), on a phone, fake database:
// manager — four tiles, Works Orders boxes (To Schedule … Completed Works - Paid, All Jobs), + New Job with one tenant,
// a job's hub (Booked For tappable) and repair page (fault found / repair required, the attendance report, Repair
// Booked with other trades, works notes), a quote from the schedule of rates found by search (less the discount, VAT
// once at the bottom), client approval, notes; operative — their boxes (no invoice wording), their jobs by day, check
// in, the steps (completed whilst in attendance? defaults to No → to price; a works visit → Mark Job As Complete),
// check out; Finance — Live Jobs (the same screen), tick done jobs onto one invoice, Project Financials for a repair
// contract (billed by invoice, the Projects client, Contract Rates?); client — the hub without money or updates, with
// the documents. Then (7 Nov, later): due dates from the priority (Overdue box), Record No Access, the operative's No
// Access, Save & Send To Client's pop-up, the client's approval link, Less / Plus on the rates. node repairs-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const lowestBox = async (page, label) => { const l = page.locator(`text="${label}" >> visible=true`); let b = null; for (let i = 0; i < await l.count(); i++) { const x = await l.nth(i).boundingBox(); if (x && (!b || x.y > b.y)) b = x; } return b; };
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const setup = (db, opId) => {
  seed(db); db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id, s = db.sites.find((x) => x.id === S1);
  s.repair_contract = true; s.repair_discount_pct = 10; s.name = 'Sovereign Repairs'; s.client_name = 'Sovereign Housing'; s.repair_online_approval = true; s.client_email = 'repairs@sovereign.example';
  // Set up in Projects: no billing type or bill-to in Finance yet (the client comes from the project).
  Object.assign(db.job_finance.find((x) => x.site_id === S1) || {}, {billing_type: null, billing_name: null, billing_email: null});
  db.repair_jobs = [
    {id: 'j1', org_id: O, site_id: S1, job_number: 'WO-1001', address: 'Flat 4, Oak House', description: 'Gutter overflowing', priority: 'Emergency', job_status: 'To Survey', survey_required: 'N', created_at: '2026-11-06T09:00:00Z'},
    {id: 'j2', org_id: O, site_id: S1, job_number: 'WO-1002', address: '3 Mill Lane', description: 'Leak to porch roof', tenant_name: 'Mr K Hughes', tenant_phone: '07700 900456', job_status: 'To Survey', survey_required: 'N', survey_booking_date: day(0), survey_booking_assigned_to: opId, created_at: '2026-11-05T09:00:00Z'},
    {id: 'j3', org_id: O, site_id: S1, job_number: 'WO-1003', address: '14 Elm Close', description: 'Leak above bedroom', job_status: 'Surveyed - Awaiting Cost', survey_required: 'Y', survey_date: '2026-11-04T10:00:00Z', completed_in_visit: false, fault_description: 'Slipped tiles at the chimney', repair_description: 'Refix 4 tiles, new lead flashing', created_at: '2026-11-03T09:00:00Z'},
    {id: 'j4', org_id: O, site_id: S1, job_number: 'WO-1004', address: '9 Park Road', description: 'Ridge tile loose', job_status: 'Closed', survey_required: 'Y', survey_date: '2026-11-01T10:00:00Z', completed_in_visit: true, works_completed: true, works_completed_date: '2026-11-01T14:00:00Z', closed: true, variation_cost: 460, created_at: '2026-10-30T09:00:00Z'},
    {id: 'j5', org_id: O, site_id: S1, job_number: 'WO-1005', address: '8 Station Rd', description: 'Missing ridge tiles', job_status: 'Approved - To Do', survey_required: 'Y', survey_date: '2026-11-02T10:00:00Z', completed_in_visit: false, variation_issued_at: '2026-11-02T12:00:00Z', variation_cost: 300, quote_approved: true, works_booking_date: day(1), works_booking_assigned_to: opId, created_at: '2026-11-01T09:00:00Z'},
  ];
  db.repair_job_photos = [{id: 'ph2', repair_job_id: 'j2', category: 'survey', storage_path: 'x/p2.jpg', deleted_at: null}, {id: 'ph5', repair_job_id: 'j5', category: 'completion', storage_path: 'x/p5.jpg', deleted_at: null}];
  db.repair_job_notes = []; db.repair_rates = [
    {id: 'r1', org_id: O, site_id: S1, code: 'RF101', description: 'Replace slipped tile', unit: 'nr', rate: 45, sort: 0, category: 'Pitched Roofing', section: 'Plain Tiles'},
    {id: 'r2', org_id: O, site_id: S1, code: 'RF205', description: 'Clear gutters', unit: 'm', rate: 3.5, sort: 1, category: 'Fascia, Soffit, Gutters', section: 'Gutters'}];
  db.checkins = db.checkins || [];
};
const login = async (page) => {
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
};
const stubs = async (ctx) => {
  await ctx.route('**/rest/v1/rpc/repair_contract_vat', (r) => r.fulfill({status: 200, contentType: 'application/json', body: '"standard"'}));
  await ctx.route('**/api.postcodes.io/**', (r) => r.abort());
};
const fns = [];
global.__fn = (name, b) => { fns.push([name, b]); return name === 'onedrive-repair-folder' ? {error: 'no_site_folder'} : name === 'send-repair-quote' && b.action === 'link' ? {ok: true, link: 'https://operativehub.co.uk/quote.html?t=11111111-1111-4111-8111-111111111111'} : {ok: true}; };
(async () => {
  const browser = await chromium.launch(); const errs = [];

  // ---------- Manager ----------
  const A = await makeContext(browser, 'admin', [], {shot: true}); setup(A.db, 'o1'); await stubs(A.ctx);
  const page = await A.ctx.newPage(); page.on('pageerror', (e) => errs.push('mgr: ' + e.message)); page.on('dialog', (d) => d.accept());
  await login(page);
  await page.goto(`http://localhost:8081/sites/${S1}`); await page.waitForTimeout(5000);
  let t = await page.locator('body').innerText();
  check(/Works Orders/.test(t) && /Health & Safety/.test(t) && /Calendar/.test(t) && /To Do List/.test(t) && !/Materials/.test(t), 'home: Works Orders, Calendar, To Do List, Health & Safety');
  {
    const wo = await page.getByLabel(/^Works Orders, /).boundingBox(), cal = await lowestBox(page, 'Calendar'), todo = await lowestBox(page, 'To Do List'), hs = await lowestBox(page, 'Health & Safety');
    // Rows, not tiles (Andy, 9 Nov 2026): Calendar, To Do List, Health & Safety one under another, under Works Orders.
    check(!!wo && !!cal && !!todo && !!hs && wo.y < cal.y && cal.y < todo.y && todo.y < hs.y, `home: Works Orders on top, then rows: Calendar, To Do List, Health & Safety (${wo && cal && todo && hs ? [wo.y, cal.y, todo.y, hs.y].map(Math.round).join(' / ') : '?'})`);
    const vw = page.viewportSize().width;
    check(!!wo && wo.width > vw * 0.8, `home: Works Orders full width, like Live Projects (${wo ? Math.round(wo.width) : '?'} of ${vw})`);
    check(/\d+ open/.test(await page.getByLabel(/^Works Orders, /).innerText()), 'home: the Works Orders card says how many are open');
  }
  await page.screenshot({path: 'shots/repair-home.png'});
  await page.goto(`http://localhost:8081/sites/${S1}/repairs`); await page.waitForTimeout(5000);
  t = await page.locator('body').innerText();
  // Tabs in place of the boxes (Andy, 9 Nov 2026): All first, then each stage, with counts.
  check(['Overdue', 'To Schedule', 'Scheduled - Awaiting Attendance', 'Quotation Required', 'Awaiting Client Approval', 'Approved - Requires Booking Date', 'On Hold / Other Trades', 'Completed Works - To Invoice', 'Completed Works - Paid'].every((l) => t.includes(l)) && /^All/.test((await page.getByRole('tab').first().innerText()).trim()), 'Works Orders: tabs in Andy’s words, All first');
  check(/^Overdue\s*1$/.test((await page.getByRole('tab', {name: /^Overdue/}).innerText()).trim()), 'Overdue tab: the Emergency job past its 24 hours');
  await page.getByRole('tab', {name: /^Overdue/}).click(); await page.waitForTimeout(1200);
  t = await page.locator('body').innerText();
  check(/box=overdue/.test(page.url()) && /WO-1001/.test(await page.getByLabel('Jobs table').innerText()) && /Overdue \d+ (Hr|Day)/.test(t), 'Overdue tab: WO-1001 with how late it is');
  await page.getByRole('tab', {name: /^All/}).click(); await page.waitForTimeout(1000);
  const plusBox = await page.getByRole('button', {name: '+ New Job (Read Works Order)'}).boundingBox(), firstTab = await page.getByRole('tab').first().boundingBox();
  check(!!plusBox && !!firstTab && plusBox.y < firstTab.y && plusBox.width > 300, '+ New Job: full width, above the tabs');
  await page.getByRole('tab', {name: /^To Schedule/}).click(); await page.waitForTimeout(1200);
  t = await page.getByLabel('Jobs table').innerText();
  check(/WO-1001/.test(t) && /Flat 4, Oak House/.test(t), 'To Schedule tab: lists WO-1001');
  await page.getByRole('tab', {name: /^Quotation Required/}).click(); await page.waitForTimeout(1200);
  check(/box=quote_needed/.test(page.url()) && /WO-1003/.test(await page.getByLabel('Jobs table').innerText()), 'another tab: Quotation Required');
  await page.goto(`http://localhost:8081/sites/${S1}/repairs`); await page.waitForTimeout(4000);
  const close = page.getByLabel('Close', {exact: true});
  if (await close.count()) { await close.first().click(); await page.waitForTimeout(400); check(!/Nobody is assigned/.test(await page.locator('body').innerText()), 'the assign-operatives banner closes with ✕'); }
  await page.getByText('+ New Job (Read Works Order)', {exact: true}).click(); await page.waitForTimeout(500);
  await page.getByLabel('Priority', {exact: true}).fill('7 Days'); await page.waitForTimeout(300);
  check(/Due .* \(from the priority\)/.test(await page.locator('body').innerText()), '+ New Job: the due date from the priority');
  await page.getByLabel('Priority', {exact: true}).fill('');
  check(await page.getByPlaceholder('Resident Name', {exact: true}).count() === 1 && await page.getByPlaceholder('Resident Contact Number').count() === 1 && await page.getByPlaceholder('Tenant No.').count() === 0, '+ New Job: one resident (name and contact number), no Tenant No.');
  await page.screenshot({path: 'shots/repair-worksorders.png'});
  await page.getByLabel('Address', {exact: true}).fill('22 New Street, OX16 1AA'); await page.getByLabel('Works Order Number').fill('WO-1006');
  await page.getByText('Add Job', {exact: true}).click(); await page.waitForTimeout(3000);
  const j6 = A.db.repair_jobs.find((j) => j.job_number === 'WO-1006');
  check(!!j6 && fns.some(([n, b]) => n === 'onedrive-repair-folder' && b.repair_job_id === j6.id), 'adding a job makes its OneDrive folder straight away');
  check(/no OneDrive folder yet/.test(await page.locator('body').innerText()), 'no contract folder: offers to choose it');
  const later = page.locator('text="Later" >> visible=true'); if (await later.count()) await later.last().click();

  // A job needing a quote: hub, repair page, the quote.
  await page.goto(`http://localhost:8081/sites/${S1}/repairs/job/j3`); await page.waitForTimeout(5000);
  t = await page.locator('body').innerText();
  // A PM / admin prices it from Projects too (Andy, 9 Nov 2026).
  check(/Quotation Required/.test(t) && /Next: price it/.test(t) && /Price It/.test(t), 'hub (Projects): the stage, and an admin can price it here');
  check(/Call-Out/.test(t) && /Resident/.test(t) && !/Tenant/.test(t) && /Booking Date/.test(t) && /Attended/.test(t) && /Completed/.test(t), 'hub: details (one resident) and the three dates');
  check(!/MONEY/.test(t) && !/£/.test(t), 'Projects: no money anywhere');
  await page.getByLabel(/^Booking Date: .*Change$/).click(); await page.waitForTimeout(600);
  check(/Book In/.test(await page.locator('body').innerText()) && await page.getByLabel('Operative').count() > 0, 'Booking Date: tap to change the booking');
  await page.getByText('Cancel', {exact: true}).last().click(); await page.waitForTimeout(300);
  await page.screenshot({path: 'shots/repair-hub.png', fullPage: true});
  // One page (Andy, 9 Nov 2026): the Work Summary under the details, no tabs.
  {
    const res = await lowestBox(page, 'Resident'), ws = await lowestBox(page, 'WORK SUMMARY');
    check(await page.getByRole('tab', {name: /^Work Summary/}).count() === 0 && !!res && !!ws && ws.y > res.y, 'the Work Summary is on the job page, under the address and resident (no tabs)');
  }
  t = await page.locator('body').innerText();
  check(/Description Of Fault Found/.test(t) && /Slipped tiles at the chimney/.test(t) && /Description Of Repair Required/.test(t) && /Booking Visit Report/.test(t), 'repair page: fault found, repair required, the booking visit report');
  check(/Repair Booked/.test(t) && /OTHER TRADES/.test(t) && /Works Done/.test(t), 'repair page: Repair Booked (with other trades) after Approved');
  await page.getByText('+ Add Other Trade', {exact: true}).click(); await page.waitForTimeout(500);
  await page.getByLabel('Trade', {exact: true}).fill('Scaffold'); await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(1500);
  let j3 = A.db.repair_jobs.find((j) => j.id === 'j3');
  check(Array.isArray(j3.trades) && j3.trades[0]?.trade === 'Scaffold' && j3.other_trades === 'Scaffold', 'an other trade is added (the old field kept in step)');
  check(/Scaffold Completed/.test(await page.locator('body').innerText()), 'the trade has its own photo upload');
  await page.getByLabel('Works done notes').fill('Access via the rear garden'); await page.getByText('Save Notes', {exact: true}).click(); await page.waitForTimeout(1500);
  check(A.db.repair_jobs.find((j) => j.id === 'j3').works_notes === 'Access via the rear garden', 'Works Done: notes without marking it complete');
  await page.screenshot({path: 'shots/repair-page.png', fullPage: true});
  await page.goto(`http://localhost:8081/fin/job/${S1}/quote/j3`); await page.waitForTimeout(5000);
  check(await page.getByLabel('Category').count() === 1 && await page.getByLabel('Item').count() === 1, 'quote: Category ▾ and Item ▾ to find rates');
  await page.getByLabel('Search the schedule of rates').fill('tile'); await page.waitForTimeout(400);
  await page.getByLabel(/^Add RF101/).click(); await page.waitForTimeout(300);
  await page.getByLabel('Line 1 quantity').fill('4');
  await page.getByText('+ Add Your Own Line', {exact: true}).click(); await page.waitForTimeout(300);
  await page.getByLabel('Line 2 description').fill('New lead flashing');
  await page.getByLabel('Line 2 rate').fill('120'); await page.waitForTimeout(300);
  t = await page.locator('body').innerText();
  // 4 × £45 = £180 less 10% = £162; + £120 = £282 net; VAT 20% £56.40; total £338.40
  check(/£162\.00/.test(t) && /£282\.00/.test(t) && /£56\.40/.test(t) && /£338\.40/.test(t), 'quote: schedule of rates less 10%, own line in full, VAT once (£338.40)');
  t = await page.locator('body').innerText();
  check(/Save or Send To Client puts the job in Awaiting Client Approval/.test(t.replace(/\s+/g, ' ')), 'the quote says Save or Send puts it in Awaiting Client Approval');
  const vq = await page.getByText('📄 View Quote', {exact: true}).boundingBox(), sv = await page.getByText('Save', {exact: true}).last().boundingBox(), sd = await page.getByText('Send To Client', {exact: true}).boundingBox();
  check(!!vq && !!sv && !!sd && Math.abs(vq.y - sv.y) < 14 && Math.abs(sv.y - sd.y) < 14 && vq.x < sv.x && sv.x < sd.x, 'one row: View Quote on the left, then Save and Send To Client');
  await page.getByText('Save', {exact: true}).last().click(); await page.waitForTimeout(2500);
  const j3s = A.db.repair_jobs.find((j) => j.id === 'j3');
  check(!!j3s.variation_issued_at && j3s.job_status === 'Surveyed - Variation Issued' && (j3s.quote_lines || []).length === 2, 'Save: the lines saved, Awaiting Client Approval');
  await page.goto(`http://localhost:8081/fin/job/${S1}/quote/j3`); await page.waitForTimeout(5000);
  check(/Less/.test(await page.locator('body').innerText()), 'quote: Less (discount) on the rates');
  await page.getByLabel('Less or plus').click(); await page.waitForTimeout(400); await page.locator('text="Plus (Uplift)" >> visible=true').last().click(); await page.waitForTimeout(400);
  t = await page.locator('body').innerText();
  // 4 × £45 = £180 plus 10% = £198; + £120 = £318
  check(/Plus 10% on £180\.00/.test(t) && /£318\.00/.test(t), 'quote: Plus 10% puts an uplift on the rates (£318 net)');
  await page.getByLabel('Less or plus').click(); await page.waitForTimeout(400); await page.locator('text="Less (Discount)" >> visible=true').last().click(); await page.waitForTimeout(400);
  await page.getByText('🔗 Copy Approval Link', {exact: true}).click(); await page.waitForTimeout(1500);
  check(fns.some(([n, b]) => n === 'send-repair-quote' && b.action === 'link' && b.repair_job_id === 'j3') && /quote\.html\?t=|Approval link copied/.test(await page.locator('body').innerText()), 'Copy Approval Link: the client’s link (online approval on)');
  const okBtn = page.locator('text="OK" >> visible=true'); if (await okBtn.count()) await okBtn.last().click();
  await page.screenshot({path: 'shots/repair-quote.png', fullPage: true});
  await page.getByText('Send To Client', {exact: true}).click(); await page.waitForTimeout(800);
  t = await page.locator('body').innerText();
  check(/Send Quote To Client/.test(t) && /Approve Or Reject Online/.test(t) && (await page.getByLabel('To', {exact: true}).inputValue()) === 'repairs@sovereign.example', 'Save & Send: the send pop-up, to the client’s email, with the online approval button');
  await page.getByText('Send', {exact: true}).last().click(); await page.waitForTimeout(4000);
  check(/Finance is in trial/.test(await page.locator('body').innerText()), 'Finance trial: saved as Awaiting Approval, the email held back');
  const ok2 = page.locator('text="OK" >> visible=true'); if (await ok2.count()) await ok2.last().click();
  j3 = A.db.repair_jobs.find((j) => j.id === 'j3');
  check(Number(j3.variation_cost) === 282 && !!j3.variation_issued_at && j3.job_status === 'Surveyed - Variation Issued' && Array.isArray(j3.quote_lines) && j3.quote_lines.length === 2, 'Save & Send: net £282 saved, Awaiting Approval (old status kept in step)');
  await page.goto(`http://localhost:8081/sites/${S1}/repairs/job/j3`); await page.waitForTimeout(5000);
  t = await page.locator('body').innerText();
  // PMs and admins quote from Projects (Andy, 9 Nov 2026), so the Quote line has its total here; still no costs or profit.
  check(/Awaiting Client Approval/.test(t) && /Quote submitted/i.test(t) && /£338\.40/.test(t) && !/MONEY/.test(t), 'the hub: Awaiting Client Approval, “quote submitted”, the quote’s total (no costs or profit)');
  await page.getByText('Quote Update ▾', {exact: true}).last().click(); await page.waitForTimeout(600);
  await page.locator('text="Quote Approved" >> visible=true').last().click(); await page.waitForTimeout(2500);
  check(j3.quote_approved === true && j3.job_status === 'Approved - To Do', 'Quote Update ▾ › Quote Approved: the repair to book');
  await page.getByLabel('Add a note').fill('Tenant prefers mornings'); await page.getByText('Add', {exact: true}).click(); await page.waitForTimeout(1500);
  check(A.db.repair_job_notes.some((n) => n.repair_job_id === 'j3' && /mornings/.test(n.body)), 'a note is added');
  // No access on a booked job: back to be booked again.
  await page.goto(`http://localhost:8081/sites/${S1}/repairs/job/j2`); await page.waitForTimeout(5000);
  await page.getByText('Update ▾', {exact: true}).click(); await page.waitForTimeout(600);
  await page.locator('text="Record No Access" >> visible=true').last().click(); await page.waitForTimeout(600);
  await page.getByLabel('What Happened').fill('No answer, card left'); await page.getByText('Record No Access', {exact: true}).last().click(); await page.waitForTimeout(2500);
  const j2m = A.db.repair_jobs.find((j) => j.id === 'j2');
  check(Array.isArray(j2m.no_access) && j2m.no_access.length === 1 && !j2m.survey_booking_date && j2m.job_status === 'To Survey', 'Record No Access: noted, the booking off, back To Schedule');
  check(/No Access ×1/.test(await page.locator('body').innerText()), 'the hub shows No Access ×1');

  // ---------- Operative ----------
  const B = await makeContext(browser, 'operative', [], {shot: true}); setup(B.db, 'me'); await stubs(B.ctx);
  await B.ctx.grantPermissions(['geolocation']); await B.ctx.setGeolocation({latitude: 52.06, longitude: -1.34});
  const op = await B.ctx.newPage(); op.on('pageerror', (e) => errs.push('op: ' + e.message)); op.on('dialog', (d) => d.accept());
  await login(op);
  await op.goto(`http://localhost:8081/sites/${S1}/repairs`); await op.waitForTimeout(5000);
  t = await op.locator('body').innerText();
  check(/My Jobs \(2\)/.test(t) && /Show All/.test(t) && /TODAY/.test(t) && /TOMORROW/.test(t), 'operative: my jobs by day (Today, Tomorrow) with Show All');
  check(t.indexOf('WO-1002') < t.indexOf('WO-1005') && !/WO-1001/.test(t), 'soonest first; other people’s / unbooked jobs not in My Jobs');
  check(/To Schedule/.test(t) && /Awaiting Client Approval/.test(t) && /Completed Works/.test(t) && !/Invoice/i.test(t) && !/Quotation Required/.test(t) && !/Paid/.test(t), 'operative boxes: no Quotation Required or Paid, no mention of invoicing');
  await op.screenshot({path: 'shots/repair-operative-list.png'});
  await op.goto(`http://localhost:8081/sites/${S1}/repairs/job/j2`); await op.waitForTimeout(5000);
  check(/Check In To Start/.test(await op.locator('body').innerText()), 'opening a job: check in first');
  await op.getByRole('button', {name: 'Check In', exact: true}).first().click(); await op.waitForTimeout(3000);
  check(B.db.checkins.some((c) => c.repair_job_id === 'j2' && c.type === 'in'), 'checked in to the job (with the job on the row)');
  t = await op.locator('body').innerText();
  check(/Description Of Fault Found/.test(t) && /Description Of Repair Required/.test(t) && /Completed Repair Whilst In Attendance\?/.test(t), 'operative steps: the new wording');
  await op.getByText('No Access?', {exact: true}).click(); await op.waitForTimeout(500);
  check(/Photo Of The Card Left/.test(await op.locator('body').innerText()), 'operative: No Access? asks for a photo of the card left');
  await op.getByText('Cancel', {exact: true}).last().click(); await op.waitForTimeout(400);
  await op.getByLabel('What’s wrong, what you found').fill('Split joint in the porch felt'); await op.getByText('Save', {exact: true}).first().click(); await op.waitForTimeout(1200);
  await op.getByLabel('What needs doing to fix it').fill('Cut out and patch, new flashing'); await op.getByText('Save', {exact: true}).first().click(); await op.waitForTimeout(1200);
  check(await op.getByRole('radio', {name: 'No — Needs A Quote', checked: true}).count() === 1, 'completed whilst in attendance: No — Needs A Quote is picked to start with');
  await op.screenshot({path: 'shots/repair-operative-steps.png', fullPage: true});
  await op.getByText('Save Attendance', {exact: true}).click(); await op.waitForTimeout(2500);
  const j2 = B.db.repair_jobs.find((j) => j.id === 'j2');
  check(j2.completed_in_visit === false && j2.survey_required === 'Y' && j2.job_status === 'Surveyed - Awaiting Cost' && /porch felt/.test(j2.fault_description), 'not done in the visit: attended, to the office to price');
  check(/Booking Visit Report/.test(await op.locator('body').innerText()), 'the attendance report is there straight after');
  await op.getByText('Check Out', {exact: true}).last().click(); await op.waitForTimeout(3000);
  check(B.db.checkins.some((c) => c.repair_job_id === 'j2' && c.type === 'out'), 'checked out');
  await op.goto(`http://localhost:8081/sites/${S1}/repairs/job/j5`); await op.waitForTimeout(5000);
  await op.getByRole('button', {name: 'Check In', exact: true}).first().click(); await op.waitForTimeout(3000);
  t = await op.locator('body').innerText();
  check(/Works visit/.test(t) && /Completion Photos And Works Completed/.test(t) && !/Description Of Fault/.test(t) && !/£/.test(t), 'a works visit goes straight to the completion step (no figures)');
  await op.getByLabel('Description of the works completed').fill('Rebedded ridge, all sound'); await op.getByText('Mark Job As Complete', {exact: true}).click(); await op.waitForTimeout(3000);
  const j5 = B.db.repair_jobs.find((j) => j.id === 'j5');
  check(j5.works_completed === true && j5.job_status === 'Awaiting Sign-off', 'Mark Job As Complete');

  // ---------- Finance ----------
  A.db.profiles[0].finance_enabled = true;
  await page.goto(`http://localhost:8081/fin/job/${S1}/repairs`); await page.waitForTimeout(6000);
  t = await page.locator('body').innerText();
  check(/Live Jobs/.test(t) && !/Bill Of Quantities/.test(t) && !/\bVariations\b/.test(t) && /To Schedule/.test(t) && /\+ New Job/.test(t), 'Finance: a Live Jobs tab (no BoQ or Variations), the same tabs as Projects');
  await page.getByRole('tab', {name: /^Completed Works - To Invoice/}).click(); await page.waitForTimeout(800);
  await page.getByLabel('Tick WO-1004').click(); await page.waitForTimeout(300);
  await page.screenshot({path: 'shots/repair-finance.png', fullPage: true});
  await page.getByText('Invoice Ticked Jobs (1)', {exact: true}).click(); await page.waitForTimeout(800);
  const y2 = page.locator('text="Yes, Invoice Them" >> visible=true'); if (await y2.count()) await y2.last().click();
  await page.waitForTimeout(5000);
  const j4 = A.db.repair_jobs.find((j) => j.id === 'j4'), inv = (A.db.fin_invoices || []).find((i) => i.id === j4.invoice_id);
  check(!!inv && inv.status === 'draft' && (inv.lines || []).some((l) => /WO-1004 — 9 Park Road/.test(l.description) && Number(l.amount) === 460), 'ticked jobs go on one draft invoice (WO-1004 at £460)');
  await page.goto(`http://localhost:8081/fin/job/${S1}/repair/j4`); await page.waitForTimeout(6000);
  t = await page.locator('body').innerText();
  check(/MONEY/.test(t) && /Quoted/.test(t) && /Open Invoice/.test(t), 'Finance hub: the money box and the invoice');
  // Project Financials for a repair contract.
  await page.goto(`http://localhost:8081/fin/job/${S1}?tab=setup`); await page.waitForTimeout(6000);
  t = await page.locator('body').innerText();
  check(/By Invoice/.test(t) && /Sovereign Housing/.test(t) && /Contract Rates/.test(t) && !/Retention/.test(t) && !/Application Date/.test(t), 'Project Financials: billed by invoice, the Projects client, Contract Rates; no retention or application date');
  await page.getByText('Edit ▾', {exact: true}).click(); await page.waitForTimeout(500);
  await page.locator('text="Edit Project Financials" >> visible=true').last().click(); await page.waitForTimeout(800);
  t = await page.locator('body').innerText();
  check(/Contract Rates\?/.test(t) && !/Retention %/.test(t) && !/Final Date/.test(t) && !/Application Date/.test(t), 'the pop-up: Contract Rates?, no retention or final / application dates for an invoice job');
  await page.getByLabel('Contract Rates?').click(); await page.waitForTimeout(400); await page.locator('text="Yes" >> visible=true').last().click(); await page.waitForTimeout(400);
  check(await page.getByLabel('Less Or Plus').count() === 1 && await page.getByLabel('Rates Adjustment %').count() === 1, 'Contract Rates? Yes: Less or Plus, and the %');
  check(await page.getByLabel('Client Approves Quotes Online?').count() === 1 && await page.getByLabel('No Access Charge £').count() === 1, 'the online approval switch and the no access charge');
  await page.getByLabel('Billed By').click(); await page.waitForTimeout(400); await page.locator('text="Application (With Retention)" >> visible=true').last().click(); await page.waitForTimeout(400);
  check(/Retention %/.test(await page.locator('body').innerText()), 'switching to Application brings retention back at once');
  await page.screenshot({path: 'shots/repair-fin-setup.png', fullPage: true});
  await page.getByText('Cancel', {exact: true}).last().click();

  // ---------- Client ----------
  const C = await makeContext(browser, 'client', [], {shot: true}); setup(C.db, 'o1'); await stubs(C.ctx);
  const cl = await C.ctx.newPage(); cl.on('pageerror', (e) => errs.push('client: ' + e.message));
  await login(cl);
  await cl.goto(`http://localhost:8081/sites/${S1}/repairs/job/j3`); await cl.waitForTimeout(5000);
  t = await cl.locator('body').innerText();
  check(!/Update ▾/.test(t) && !/MONEY/.test(t) && !/Work Summary/.test(t), 'client: no updates, no money');
  check(/Booking Visit Report/.test(t) && /NOTES/.test(t), 'client: the documents and the notes');
  await cl.screenshot({path: 'shots/repair-client.png', fullPage: true});

  check(!errs.length, `no errors ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
})();
