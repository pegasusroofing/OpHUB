// Construction Phase Plan builder (Andy, 19 Nov 2026: "replicate it as a rams style builder, pull through as much info
// as you have from the job, ie read schedule of works, start dates, find the nearest hospitals etc. can we just do on
// beta for now?"), and his second round the same day: a map snapshot of the job marked up in the app for the site
// layout and fire route plans; Save and Next at the bottom; contact rows lined up; the A&E search from the job's
// address, changeable; emergency numbers two to a row (one on a phone); a CPP template under Admin > H&S; revisions.
// On the test copy (localhost counts as the beta). Fake database; map searches caught. node cpp19-check.js
const {chromium, makeContext, S1} = require('./harness');
const path = require('path');
const fs = require('fs');
const B = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'cpp19');
fs.mkdirSync(SHOTS, {recursive: true});
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };

(async () => {
  // WebGL for the map snapshot.
  const browser = await chromium.launch({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']}); const errs = [];
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
    // Map searches: the hospital search (King's College Hospital, an A&E, and a nearer hospital without one) and postcodes.
    const mapAsks = [];
    // OpenStreetMap's own search first (19 Nov 2026: Overpass turns most requests away); the box's centre is noted.
    await ctx.route(/nominatim\.openstreetmap\.org\/search/, (r) => {
      const vb = (new URL(r.request().url()).searchParams.get('viewbox') || '').split(',').map(Number);
      mapAsks.push(`around:${((vb[1] + vb[3]) / 2).toFixed(4)},${((vb[0] + vb[2]) / 2).toFixed(4)}`);
      r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify([
        {category: 'amenity', type: 'hospital', name: 'Small Clinic Hospital', lat: '51.462', lon: '-0.138', extratags: {}, address: {}},
        {category: 'amenity', type: 'hospital', name: "King's College Hospital", lat: '51.468', lon: '-0.094', extratags: {emergency: 'yes', phone: '020 3299 9000'}, address: {road: 'Denmark Hill', city: 'London', postcode: 'SE5 9RS'}},
        {category: 'highway', type: 'residential', name: 'Hospital Road', lat: '51.461', lon: '-0.137'},
      ])});
    });
    await ctx.route(/overpass-api\.de/, (r) => { mapAsks.push(decodeURIComponent(r.request().postData() || '')); r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({elements: [
      {type: 'node', lat: 51.462, lon: -0.138, tags: {amenity: 'hospital', name: 'Small Clinic Hospital'}},
      {type: 'way', center: {lat: 51.468, lon: -0.094}, tags: {amenity: 'hospital', emergency: 'yes', name: "King's College Hospital", 'addr:street': 'Denmark Hill', 'addr:city': 'London', 'addr:postcode': 'SE5 9RS', phone: '020 3299 9000'}},
    ]})}); });
    await ctx.route(/api\.postcodes\.io\/postcodes\/E1/, (r) => r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({status: 200, result: {latitude: 51.5203, longitude: -0.0723}})}));
    const pdfs = [];
    await ctx.route(/storage\/v1\/object\/mc-documents\/.*cpp\/.*\.pdf/, (r) => { pdfs.push(r.request().postDataBuffer()); r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({Key: 'mc-documents/x.pdf', Id: 'x'})}); });
    const pics = [];
    await ctx.route(/storage\/v1\/object\/mc-documents\/.*cpp-images\//, (r) => { if (r.request().method() === 'POST') { pics.push(r.request().url()); return r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({Key: 'mc-documents/i.jpg', Id: 'i'})}); } r.fallback(); });
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(B + '/login'); await page.waitForTimeout(5000);
    await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
    await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(6000);
    const text = () => page.evaluate(() => document.body.innerText);
    const values = () => page.evaluate(() => [...document.querySelectorAll('input,textarea')].map((i) => i.value).join(' | '));
    const tab = async (re) => { await page.getByRole('tab').filter({hasText: re}).first().click(); await page.waitForTimeout(1200); };
    await page.goto(`${B}/sites/${S1}/mc/docs/cpp`); await page.waitForTimeout(4500);
    let t = await text();
    check(/Build A Construction Phase Plan/.test(t) && /\+ Build A New Plan/.test(t), `${dev}: the CPP folder has Build A Construction Phase Plan`);
    await page.getByText('+ Build A New Plan', {exact: true}).click(); await page.waitForTimeout(6000);
    const plan = db.cpp_plans[0] && db.cpp_plans[0].data;
    check(!!plan && /\/mc\/cpp\//.test(page.url()), `${dev}: a plan is made and opens`);
    if (!plan) { await ctx.close(); continue; }
    check(plan.pc.name === db.organizations[0].name && /Hyde Group/.test(plan.client.name) && /Roof Strip/.test(plan.outline) && plan.startDate === '2026-12-01', `${dev}: filled from the job (company, client, SOW outline, start date)`);
    check(plan.hospital.name === "King's College Hospital" && plan.hospitalFrom.postcode === 'SW4 6RZ' && /Studley/.test(plan.hospitalFrom.address), `${dev}: the nearest A&E is found from the job's address (${plan.hospitalFrom.address} / ${plan.hospitalFrom.postcode})`);
    check(new RegExp(o1 ? o1.name.split(' ')[0] : 'x').test(plan.firstAiders) && plan.pm.name === me.name, `${dev}: first aider and PM (${plan.firstAiders} / ${plan.pm.name})`);
    // Next at the bottom; it saves by itself, so no Save button (Andy, 20 Nov 2026).
    t = await text();
    check(/Next: People ›/.test(t) && /saves by itself/i.test(t) && !/\bSave\b/.test(t.replace(/saves by itself/gi, '')), `${dev}: Next at the bottom of Details; saves by itself, no Save button`);
    await page.getByText('Next: People ›', {exact: true}).click(); await page.waitForTimeout(1200);
    t = await text();
    check(/Contact Details Sheet/i.test(t) && /Next: Plan ›/.test(t), `${dev}: Next goes to People`);
    // The contact rows line up: Name above and Out Of Hours below end at the same place.
    const edges = await page.evaluate(() => {
      const box = (ph) => [...document.querySelectorAll('div')].filter((d) => d.childElementCount === 0 && d.textContent === ph).map((d) => d.parentElement?.parentElement?.querySelector('input')?.getBoundingClientRect().right);
      return {name: box('Name')[0], ooh: box('Out Of Hours')[0], person: box('Person')[0], day: box('Daytime Phone')[0]};
    });
    check(edges.name && Math.abs(edges.name - edges.ooh) < 1.5 && Math.abs(edges.person - edges.day) < 1.5, `${dev}: contact rows line up (Name ends ${Math.round(edges.name)}, Out Of Hours ${Math.round(edges.ooh)})`);
    await page.screenshot({path: path.join(SHOTS, `${dev}-people.png`)});
    // Emergency: the A&E search from the address, changeable; numbers two to a row on a laptop.
    await tab(/^Emergency/);
    const pc = page.locator('input').filter({has: page.locator('xpath=.')}).nth(0);
    t = await values();
    check(/SW4 6RZ/.test(t) && !/Search From/.test(await text()), `${dev}: the A&E search starts from the job's postcode (no address box)`);
    check(plan.hospital.phone === '020 3299 9000' && /Denmark Hill, London, SE5 9RS/.test(plan.hospital.address), `${dev}: the A&E's phone and address come through (${plan.hospital.address})`);
    const before = mapAsks.length;
    const pcBox = page.locator('input[value="SW4 6RZ"]').first();
    await pcBox.fill('E1 6AN'); await page.waitForTimeout(400);
    await page.getByText('Find Nearest A&E', {exact: true}).click(); await page.waitForTimeout(2500);
    check(mapAsks.length > before && /51\.5203/.test(mapAsks[mapAsks.length - 1]), `${dev}: a changed postcode searches from there (${(mapAsks[mapAsks.length - 1] || '').match(/around:[\d.]+,[\d.-]+/)?.[0] || 'no search'})`);
    const tops = await page.evaluate(() => [...document.querySelectorAll('input')].filter((i) => ['Gas', 'Electricity'].includes(i.value)).map((i) => Math.round(i.getBoundingClientRect().top)));
    check(dev === 'laptop' ? tops.length === 2 && tops[0] === tops[1] : tops.length === 2 && tops[0] !== tops[1], `${dev}: emergency numbers ${dev === 'laptop' ? 'two to a row' : 'one to a row on a phone'} (${tops.join(', ')})`);
    check(/Emergency Contact No\./.test(await text()), `${dev}: each number has its Emergency Contact No. underneath`);
    await page.screenshot({path: path.join(SHOTS, `${dev}-emergency.png`), fullPage: dev === 'laptop'});
    if (dev === 'laptop') {
      // Site layout plan: a map snapshot of the job, marked up in the app.
      await tab(/^Details/);
      await ctx.unroute(/tiles\.openfreemap\.org/); // the real map for the picture (works without it, just blank)
      // Satellite (Andy, 19 Nov 2026): Esri World Imagery with the key from app_settings; tiles caught here.
      db.app_settings = [{key: 'esri_basemap_key', value: 'TESTKEY123'}];
      const satTiles = [], SAMPLE = fs.readFileSync(path.join(__dirname, 'shots', 'samples', 'site-photo.jpg'));
      await ctx.route(/ibasemaps-api\.arcgis\.com/, (r) => { satTiles.push(r.request().url()); r.fulfill({status: 200, contentType: 'image/jpeg', headers: {'Access-Control-Allow-Origin': '*'}, body: SAMPLE}); });
      await page.getByText('Add Plan', {exact: true}).first().click(); await page.waitForTimeout(800);
      await page.getByText('🗺 Map Snapshot Of The Job', {exact: true}).click(); await page.waitForTimeout(3000);
      t = await text();
      check(/Choose A Map Snapshot/.test(t), 'laptop: Map Snapshot opens the map on the job');
      await page.getByText('Use This View', {exact: true}).waitFor({timeout: 20000}).catch(() => {});
      check(/Satellite/.test(t) && /Street Map/.test(t) && satTiles.some((u) => /World_Imagery.*token=TESTKEY123/.test(u)), `laptop: it opens on Satellite (Esri, with the key) and can switch to Street Map (${satTiles.length} satellite tiles)`);
      await page.screenshot({path: path.join(SHOTS, 'laptop-satellite.png')});
      await page.getByText('Street Map', {exact: true}).click(); await page.waitForTimeout(500);
      await page.getByText('Use This View', {exact: true}).waitFor({timeout: 20000}).catch(() => {});
      await page.waitForTimeout(6000);
      await page.screenshot({path: path.join(SHOTS, 'laptop-snapshot.png')});
      await page.getByText('Use This View', {exact: true}).click(); await page.waitForTimeout(4000);
      const saveBtn = page.getByText('Save', {exact: true}).last();
      check(pics.length >= 1 && await saveBtn.count() > 0, `laptop: the snapshot is kept and opens in the mark-up tools (${pics.length} picture saved)`);
      // Draw an arrow-ish pen line, then save.
      const area = await page.evaluate(() => { const s = [...document.querySelectorAll('svg')].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 300).sort((a, b) => b.width * b.height - a.width * a.height)[0]; return s ? {x: s.left, y: s.top, w: s.width, h: s.height} : null; });
      if (area) { await page.mouse.move(area.x + area.w * 0.3, area.y + area.h * 0.5); await page.mouse.down(); await page.mouse.move(area.x + area.w * 0.6, area.y + area.h * 0.4, {steps: 8}); await page.mouse.up(); }
      await page.screenshot({path: path.join(SHOTS, 'laptop-markup.png')});
      await saveBtn.click(); await page.waitForTimeout(4000);
      const d1 = db.cpp_plans[0].data;
      check(!!d1.sitePlan && !!d1.sitePlanMarks.base && d1.sitePlan !== d1.sitePlanMarks.base && pics.length >= 2, `laptop: the marked-up site layout plan is saved, and the plain snapshot kept for marking up again (${(d1.sitePlanMarks.ops || []).length} marks)`);
      check(/✎ Mark Up/.test(await text()), 'laptop: the plan can be marked up again');
      await page.getByText('Add Plan', {exact: true}).first().click(); await page.waitForTimeout(800);
      check(/Start From The Site Layout Map/.test(await text()), 'laptop: the fire route plan can start from the site layout map');
      await page.keyboard.press('Escape'); await page.waitForTimeout(500);
      await page.screenshot({path: path.join(SHOTS, 'laptop-siteplans.png'), fullPage: true});
      // Issue, then a revision.
      await tab(/^Issue/);
      await page.getByText('Issue Plan', {exact: true}).click(); await page.waitForTimeout(7000);
      check((db.mc_documents || []).some((d) => /Construction Phase Plan v1/.test(d.name)) && db.cpp_plans[0].status === 'issued', 'laptop: Issue Plan files v1 in the CPP folder');
      // The issued plan first, as a RAMS row, with View / Export / Email; revising under it (Andy, 19 Nov 2026).
      check(/Construction Phase Plan · Version 1/.test(await text()) && /👁 View/.test(await text()) && /⬇ Export/.test(await text()) && /✉ Email/.test(await text()) && /Revise The Plan/i.test(await text()) && /Issue Revision 2/.test(await text()), 'laptop: once issued: the issued plan with View / Export / Email, then Revise The Plan');
      await page.screenshot({path: path.join(SHOTS, 'laptop-issued-v1.png'), fullPage: true});
      await page.getByText('Issue Revision 2', {exact: true}).click(); await page.waitForTimeout(800);
      // Typing boxes that pop up are ready to type in (Andy, 19 Nov 2026: the mark-up's Text box "doesnt automatically
      // take me into the box"): it's the same pop-up everywhere, so type without clicking into it.
      await page.keyboard.type('Scaffold moved');
      check(/Scaffold moved/.test(await page.locator('input,textarea').filter({visible: true}).last().inputValue()), 'laptop: the "what has changed" box is ready to type in without clicking it');
      await page.locator('input,textarea').filter({visible: true}).last().fill('Scaffold moved to the rear elevation'); await page.getByText('OK', {exact: true}).last().click(); await page.waitForTimeout(7000);
      const docs = db.mc_documents || [];
      check(docs.some((d) => /v2/.test(d.name)) && docs.some((d) => /v1.*Superseded by v2/.test(d.name)), `laptop: revision 2 is filed and v1 is marked superseded (${docs.map((d) => d.name).join(' / ')})`);
      const revs = db.cpp_plans[0].data.revisions || [];
      check(revs.length === 2 && revs[1].note === 'Scaffold moved to the rear elevation' && db.cpp_plans[0].version === 2, `laptop: the revision history has what changed (${revs.map((r) => `v${r.version}: ${r.note}`).join('; ')})`);
      const pages = pdfs.length ? (await require('pdf-lib').PDFDocument.load(pdfs[pdfs.length - 1])).getPageCount() : 0;
      check(pages >= 9, `laptop: the revision's PDF is made (${pages} pages, with the site plan)`);
      if (pdfs.length) fs.writeFileSync(path.join(SHOTS, 'cpp-sample.pdf'), pdfs[pdfs.length - 1]);
      await page.screenshot({path: path.join(SHOTS, 'laptop-issue.png'), fullPage: true});
      check(/Construction Phase Plan · Version 2/.test(await text()) && /Earlier Versions/i.test(await text()) && /Version 1 \(Superseded\)/.test(await text()), 'laptop: after a revision the top shows Version 2, with Version 1 under Earlier Versions');
      const sent = []; global.__fn = (name, body) => { if (name === 'send-document-email') sent.push(body); return null; };
      await page.getByText('✉ Email', {exact: true}).first().click(); await page.waitForTimeout(800);
      await page.locator('input[placeholder="name@company.co.uk"]').fill('client@example.co.uk'); await page.getByText('Send', {exact: true}).last().click(); await page.waitForTimeout(4000);
      check(sent.length === 1 && sent[0].recipient_email === 'client@example.co.uk' && /Construction Phase Plan .*Version 2/.test(sent[0].doc_title || ''), `laptop: ✉ Email sends the issued plan (${sent.length ? sent[0].doc_title : 'nothing sent'})`);
      global.__fn = null;
      // Export asks how, as everywhere (📄 PDF, or ☁️ OneDrive when it's linked): choose the PDF.
      const [dl] = await Promise.all([page.waitForEvent('download', {timeout: 20000}).catch(() => null), (async () => {
        await page.getByText('⬇ Export', {exact: true}).first().click(); await page.waitForTimeout(2500);
        const pdfChoice = page.getByText('📄 PDF', {exact: true}); if (await pdfChoice.count()) await pdfChoice.last().click();
      })()]);
      check(!!dl && /Construction Phase Plan - .* - v2\.pdf$/.test(dl.suggestedFilename()), `laptop: ⬇ Export saves the issued plan (${dl ? dl.suggestedFilename() : 'no file: ' + ((await text()).match(/Could not[^.]*/) || ['no message'])[0]})`);
      // The CPP template under Admin > H&S.
      await page.goto(`${B}/pm/admin/cpptemplate`); await page.waitForTimeout(5000);
      t = await text();
      check(/Construction Phase Plan Template/.test(t) && /CPP Template/.test(t) && /Company/.test(t) && /Contacts/.test(t), 'laptop: the CPP Template under Admin > H&S');
      await page.getByPlaceholder('e.g. HS Direct Ltd', {exact: true}).fill('HS Direct Ltd'); await page.waitForTimeout(300);
      await page.waitForTimeout(2500); // the template saves by itself (Andy, 20 Nov 2026); there's no Save button
      const def = (db.cpp_defaults || [])[0];
      check(!!def && def.data.advisor === 'HS Direct Ltd' && (def.data.sections || []).length === 17, `laptop: the template saves by itself (${def ? def.data.advisor : 'nothing saved'})`);
      t = await text();
      check(/Next: Plan ›/.test(t) && !/\bSave\b/.test(t.replace(/saves by itself/gi, '')), 'laptop: Next: Plan › at the bottom, and no Save button');
      await page.getByRole('tab').filter({hasText: /^Plan/}).first().click(); await page.waitForTimeout(1000);
      check(/\{company\}/.test(await text()), 'laptop: the template shows the fill-in words, like {company}');
      await page.screenshot({path: path.join(SHOTS, 'laptop-template.png')});
    }
    await ctx.close();
  }
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
