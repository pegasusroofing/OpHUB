// New app: + Add Operative by hand (9219zzg, 4 Nov 2026), fake database only.
// Add someone by name / number / email / trade, see them under "Not Signed Up Yet", open their page
// (details, OneDrive Sync Now, certificates, Training Matrix), then Link them to a signed-up login.
// node manualop-check.js   (Expo dev server on :8081)
const {chromium, makeContext} = require('./harness');
const path = require('path');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'job');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 390, height: 844}});
  require('./seeds/world')(db); const me = db.profiles.find((p) => p.id === 'me'); me.role = 'admin'; me.howto_dismissed = ['*'];
  const calls = []; global.__fn = (name, b) => { if (name === 'sync-operative-certification') { calls.push(b); return {pulled: 0, pushed: (b.cert_ids || []).length}; } };
  const rpcs = [];
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  // The company OneDrive is connected; link_manual_operative moves the certificates onto the login (as the live function does).
  await page.route(/\/rest\/v1\/rpc\/onedrive_status/, (r) => r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({exists: true, connected: true, needs_reconnect: false})}));
  await page.route(/\/rest\/v1\/rpc\/link_manual_operative/, (r) => {
    const b = JSON.parse(r.request().postData() || '{}'); rpcs.push(b);
    const m = (db.manual_operatives || []).find((x) => x.id === b.p_manual);
    if (m) { m.linked_profile_id = b.p_profile; (db.operative_certifications || []).forEach((c) => { if (c.manual_operative_id === m.id) { c.operative_id = b.p_profile; c.manual_operative_id = null; } }); }
    return r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(!!m)});
  });
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // 1. Add an operative by hand
  await page.goto(B + '/pm/operatives'); await page.waitForTimeout(5000);
  check(await page.getByText('+ Add Operative', {exact: true}).count() > 0, '+ Add Operative button on the Operatives page');
  await page.getByText('+ Add Operative', {exact: true}).click(); await page.waitForTimeout(600);
  await page.getByPlaceholder('Full name').fill('Sam Price');
  await page.getByPlaceholder('e.g. 07123 456789').fill('07123 456789');
  await page.getByPlaceholder('name@example.com').fill('Sam@Example.com');
  await page.getByPlaceholder('e.g. Roofer, Labourer').fill('Roofer');
  await page.screenshot({path: path.join(SHOTS, 'manualop-add-phone.png')});
  await page.getByText('Add Operative', {exact: true}).click(); await page.waitForTimeout(3000);
  const m = (db.manual_operatives || [])[0];
  check(m && m.name === 'Sam Price' && m.phone === '07123 456789' && m.email === 'sam@example.com' && m.trade === 'Roofer' && m.org_id === me.org_id, 'saved to manual_operatives (name, number, lower-case email, trade)');
  check(m && page.url().endsWith('/pm/operatives/m-' + m.id), 'opens their page');

  // 2. Their page
  await page.waitForTimeout(2000);
  for (const t of ['Not Signed Up Yet', 'Details', 'Signed Up Already?', 'OneDrive Sync', 'Link OneDrive Folder', 'Certificates', 'Add a certificate', '📊 Export Full Training Matrix (Excel)', 'Remove Sam Price'])
    check(await page.getByText(t, {exact: true}).count() > 0, `their page shows "${t}"`);
  check(await page.getByText(/When they sign up with sam@example.com/).count() > 0, 'says they link up by themselves with that email');
  await page.screenshot({path: path.join(SHOTS, 'manualop-page-phone.png'), fullPage: true});

  // Edit their trade
  await page.getByText('Edit', {exact: true}).first().click(); await page.waitForTimeout(500);
  await page.locator('input[value="Roofer"]').fill('Roofer / Leadworker');
  await page.getByText('Save', {exact: true}).click(); await page.waitForTimeout(2000);
  check(m.trade === 'Roofer / Leadworker', 'Edit saves their details');

  // OneDrive folder linked + a certificate: Sync Now goes to the function with manual_operative_id
  Object.assign(m, {onedrive_folder_id: 'F1', onedrive_folder_name: 'Sam Price Certs', onedrive_drive_id: 'D1'});
  db.operative_certifications = (db.operative_certifications || []).concat([{id: 'mc1', org_id: me.org_id, operative_id: null, manual_operative_id: m.id, category: 'cscs_card', name: 'CSCS card.pdf', storage_path: me.org_id + '/m-' + m.id + '/x-CSCS.pdf', expiry_date: '2027-06-30', source: 'upload', created_at: new Date().toISOString()}]);
  await page.reload(); await page.waitForTimeout(6000);
  check(await page.getByText(/Linked to “Sam Price Certs”/).count() > 0, 'shows their linked OneDrive folder');
  check(await page.getByText('CSCS card.pdf', {exact: false}).count() > 0, 'their certificate is listed');
  await page.getByText('🔄 Sync Now', {exact: true}).click(); await page.waitForTimeout(2500);
  check(calls.some((c) => c.manual_operative_id === m.id && !c.operative_id), 'Sync Now sends manual_operative_id');
  await page.getByText(/Upload to OneDrive \(1\)/).click(); await page.waitForTimeout(2500);
  check(calls.some((c) => c.manual_operative_id === m.id && (c.cert_ids || []).includes('mc1')), 'Upload to OneDrive sends their certificate');

  // 3. In the list and the Training Matrix
  await page.goto(B + '/pm/operatives'); await page.waitForTimeout(5000);
  check(await page.getByText('Not Signed Up Yet (1)', {exact: true}).count() > 0, 'list shows "Not Signed Up Yet (1)"');
  check(await page.getByText('Sam Price', {exact: true}).count() > 0, 'Sam Price is in the list');
  check(await page.getByText('Signed Up', {exact: true}).count() > 0, '"Signed Up" heading over the usual list');
  await page.screenshot({path: path.join(SHOTS, 'manualop-list-phone.png'), fullPage: true});
  await page.goto(B + '/pm/operatives/matrix'); await page.waitForTimeout(5000);
  check(await page.getByText('Sam Price (not signed up)', {exact: true}).count() > 0, 'in the Training Matrix as "(not signed up)"');
  check(await page.getByText('30 Jun 27', {exact: true}).count() > 0, 'their certificate expiry shows in the matrix');

  // 4. Desktop shots
  await page.setViewportSize({width: 1300, height: 900});
  await page.goto(B + '/pm/operatives'); await page.waitForTimeout(5000);
  await page.screenshot({path: path.join(SHOTS, 'manualop-list-desk.png'), fullPage: true});
  await page.getByText('Sam Price', {exact: true}).click(); await page.waitForTimeout(5000);
  check(page.url().endsWith('/pm/operatives/m-' + m.id), 'tapping them in the list opens their page');
  await page.screenshot({path: path.join(SHOTS, 'manualop-page-desk.png'), fullPage: true});

  // 5. Link to their login
  await page.getByLabel('Link To').click(); await page.waitForTimeout(600);
  await page.getByText('Jake Morris — j@x.co', {exact: true}).last().click(); await page.waitForTimeout(500);
  await page.getByText('Link', {exact: true}).first().click(); await page.waitForTimeout(800);
  await page.screenshot({path: path.join(SHOTS, 'manualop-link-desk.png')});
  await page.getByText('Link', {exact: true}).last().click(); await page.waitForTimeout(4000);
  check(rpcs.length === 1 && rpcs[0].p_manual === m.id && rpcs[0].p_profile === 'o1', 'Link calls link_manual_operative with them and the login');
  check(page.url().endsWith('/pm/operatives/o1'), 'then opens the signed-up operative\'s page');
  check(db.operative_certifications.find((c) => c.id === 'mc1').operative_id === 'o1', 'certificate is now on their login');
  await page.goto(B + '/pm/operatives'); await page.waitForTimeout(5000);
  check(await page.getByText(/Not Signed Up Yet/).count() === 0, 'no longer under "Not Signed Up Yet"');

  check(!errs.length, `no page errors ${errs.join(' | ')}`);
  await browser.close();
})();
