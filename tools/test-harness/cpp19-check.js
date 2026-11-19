// Construction Phase Plan builder (Andy, 19 Nov 2026: "replicate it as a rams style builder, pull through as much info
// as you have from the job, ie read schedule of works, start dates, find the nearest hospitals etc. can we just do on
// beta for now?"). On the test copy (localhost counts as the beta): the CPP folder has Build A Construction Phase Plan;
// a new plan is filled from the job (company, site, client, PM, first aider from certificates, SOW outline, start date,
// nearest A&E from a caught map search); the tabs work; Issue makes a PDF and files it in the folder.
// Fake database. node cpp19-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'cpp19');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [w, h, dev] of [[1300, 900, 'laptop'], [390, 844, 'phone']]) {
    const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: w, height: h}});
    require('./seeds/world')(db);
    const me = db.profiles.find((p) => p.id === 'me'); Object.assign(me, {role: 'admin', howto_dismissed: ['*'], phone: '07700 900111'});
    const site = db.sites.find((s) => s.id === S1);
    Object.assign(site, {acting_as_main_contractor: true, client_name: 'Hyde Group', client_contact_name: 'Tom Golding', client_phone: '0800 3 282 282', client_email: 'tom@hyde.example', start_date: '2026-12-01', postcode: 'SW4 6RZ', geofence_lat: 51.4613, geofence_lon: -0.1376, responsible_pm_id: 'me'});
    db.schedule_sections = [{id: 'ss1', site_id: S1, name: 'Roof Strip', position: 1}, {id: 'ss2', site_id: S1, name: 'New Roof', position: 2}];
    db.schedule_tasks = [{id: 'st1', site_id: S1, section_id: 'ss1', name: 'Strip tiles and felt', position: 1, status: 'todo'}, {id: 'st2', site_id: S1, section_id: 'ss2', name: 'Breather membrane, battens and tiles', position: 1, status: 'todo'}];
    const o1 = db.profiles.find((p) => p.id === 'o1'); if (o1) o1.phone = '07700 900222';
    db.operative_certifications = [{id: 'fa1', operative_id: 'o1', name: 'First Aid at Work', category: 'First Aid', expiry_date: '2027-06-01'}];
    db.rams_docs = [{id: 'rd1', site_id: S1, name: 'Risk Assessment — Roof Strip', status: 'current', uploaded_at: new Date().toISOString()}];
    db.coshh_docs = [{id: 'cd1', site_id: S1, name: 'Bitumen primer', uploaded_at: new Date().toISOString()}];
    db.cpp_plans = []; db.cpp_defaults = []; db.mc_documents = [];
    // The map search: King's College Hospital marked as an A&E, and a nearer hospital without one.
    let mapCalls = 0;
    await ctx.route(/overpass-api\.de/, (r) => { mapCalls += 1; r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({elements: [
      {type: 'node', lat: 51.462, lon: -0.138, tags: {amenity: 'hospital', name: 'Small Clinic Hospital'}},
      {type: 'way', center: {lat: 51.468, lon: -0.094}, tags: {amenity: 'hospital', emergency: 'yes', name: "King's College Hospital", 'addr:street': 'Denmark Hill', 'addr:city': 'London', 'addr:postcode': 'SE5 9RS', phone: '020 3299 9000'}},
    ]})}); });
    let pdfBytes = null;
    await ctx.route(/storage\/v1\/object\/mc-documents\/.*cpp\/.*\.pdf/, (r) => { pdfBytes = r.request().postDataBuffer(); r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({Key: 'mc-documents/x.pdf', Id: 'x'})}); });
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
    const text = () => page.evaluate(() => document.body.innerText);
    await page.goto(`${B}/sites/${S1}/mc/docs/cpp`); await page.waitForTimeout(4500);
    let t = await text();
    check(/Build A Construction Phase Plan/.test(t) && /\+ Build A New Plan/.test(t), `${dev}: the CPP folder has Build A Construction Phase Plan`);
    await page.getByText('+ Build A New Plan', {exact: true}).click(); await page.waitForTimeout(6000);
    const plan = db.cpp_plans[0] && db.cpp_plans[0].data;
    check(!!plan && /\/mc\/cpp\//.test(page.url()), `${dev}: a plan is made and opens (${page.url().split('/').slice(-3).join('/')})`);
    if (!plan) { await ctx.close(); continue; }
    check(plan.pc.name === db.organizations[0].name && /Hyde Group/.test(plan.client.name) && plan.client.contact === 'Tom Golding', `${dev}: company and client filled in (${plan.pc.name} / ${plan.client.name})`);
    check(/Roof Strip/.test(plan.outline) && /Breather membrane/.test(plan.outline), `${dev}: the outline comes from the Schedule of Works (${plan.outline.replace(/\n/g, ' | ')})`);
    check(plan.startDate === '2026-12-01', `${dev}: the start date comes from the job (${plan.startDate})`);
    check(plan.hospital.name === "King's College Hospital" && /SE5 9RS/.test(plan.hospital.address) && plan.hospital.phone === '020 3299 9000' && mapCalls >= 1, `${dev}: the nearest A&E is found (${plan.hospital.name}, ${plan.hospital.distance})`);
    check(new RegExp(o1 ? o1.name.split(' ')[0] : 'x').test(plan.firstAiders), `${dev}: the first aider comes from certificates (${plan.firstAiders})`);
    check(plan.pm.name === me.name && plan.emergencyMobile === '07700 900111', `${dev}: the PM and emergency mobile (${plan.pm.name}, ${plan.emergencyMobile})`);
    t = await text();
    check(/Details/.test(t) && /People/.test(t) && /Plan \(17\)/.test(t) && /Emergency/.test(t) && /Issue/.test(t), `${dev}: the tabs Details / People / Plan / Emergency / Issue`);
    await page.screenshot({path: path.join(SHOTS, `${dev}-details.png`), fullPage: dev === 'laptop'});
    // A change saves by itself.
    await page.getByPlaceholder('e.g. 6', {exact: true}).fill('6'); await page.getByPlaceholder('e.g. 6 weeks', {exact: true}).fill('6 weeks'); await page.waitForTimeout(1800);
    check(db.cpp_plans[0].data.workers === '6' && /not need an F10/.test(await text()), `${dev}: changes save by themselves, and the F10 check shows`);
    await page.getByRole('tab').filter({hasText: /^Plan/}).first().click(); await page.waitForTimeout(1200);
    t = await text();
    check(/2\. Health and Safety Policy Statement and Site Rules/.test(t) && /18\. Fire Plan/.test(t) && new RegExp(db.organizations[0].name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(t), `${dev}: the Plan tab lists sections 2-18 with the company name filled in`);
    await page.screenshot({path: path.join(SHOTS, `${dev}-plan.png`)});
    await page.getByRole('tab').filter({hasText: /^Emergency/}).first().click(); await page.waitForTimeout(1200);
    t = await text();
    check(/Find Nearest A&E/.test(t) && /0800 111 999/.test(await page.evaluate(() => [...document.querySelectorAll('input,textarea')].map((i) => i.value).join(' '))), `${dev}: the Emergency tab: Find Nearest A&E and the gas emergency number`);
    await page.screenshot({path: path.join(SHOTS, `${dev}-emergency.png`)});
    await page.getByRole('tab').filter({hasText: /^Issue/}).first().click(); await page.waitForTimeout(1200);
    await page.screenshot({path: path.join(SHOTS, `${dev}-issue.png`)});
    await page.getByText('Issue Plan', {exact: true}).click(); await page.waitForTimeout(7000);
    const doc = (db.mc_documents || []).find((d) => d.category === 'cpp');
    check(!!doc && /Construction Phase Plan v1/.test(doc.name), `${dev}: issuing files the PDF in the CPP folder (${doc ? doc.name : 'none'})`);
    const pdf = pdfBytes ? pdfBytes.toString('latin1') : '';
    const pages = pdfBytes ? (await require('pdf-lib').PDFDocument.load(pdfBytes)).getPageCount() : 0;
    check(pdf.startsWith('%PDF') && pages >= 8,`${dev}: the PDF is made (${pages} pages, ${pdfBytes ? Math.round(pdfBytes.length / 1024) : 0} KB)`);
    if (dev === 'laptop' && pdfBytes) fs.writeFileSync(path.join(SHOTS, 'cpp-sample.pdf'), pdfBytes);
    check(db.cpp_plans[0].status === 'issued' && /Issued v1/.test(await text()), `${dev}: the plan shows as issued`);
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
