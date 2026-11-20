// A sample O&M for Andy (20 Nov 2026: "show me how the o&ms look with my handover and a painters o&m"). Made through the
// real app against the fake database: a painter subcontractor (Pro Finish Decorators) builds and submits their O&M from
// their company page; then RTB's own O&M is built from the job and its Construction Phase Plan and issued, with the
// painter's in the back. Sample guarantees, data sheets and COSHH are one-page stand-ins. Nothing is sent.
// Writes shots/om-sample/RTB-OM-with-painter.pdf and Painter-OM.pdf. node om-sample.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const fs = require('fs'), path = require('path');
const {PDFDocument, StandardFonts, rgb} = require('../../app-native/node_modules/pdf-lib');
const B = 'http://localhost:8081';
const OUT = path.join(__dirname, 'shots', 'om-sample'); fs.mkdirSync(OUT, {recursive: true});
const stand = async (title, lines) => {
  const d = await PDFDocument.create(), f = await d.embedFont(StandardFonts.Helvetica), fb = await d.embedFont(StandardFonts.HelveticaBold);
  const p = d.addPage([595, 842]);
  p.drawRectangle({x: 40, y: 760, width: 515, height: 40, color: rgb(0.93, 0.94, 0.95)});
  p.drawText('SAMPLE DOCUMENT', {x: 50, y: 775, size: 11, font: fb, color: rgb(0.6, 0.1, 0.1)});
  p.drawText(title, {x: 50, y: 720, size: 18, font: fb});
  lines.forEach((l, i) => p.drawText(l, {x: 50, y: 690 - i * 18, size: 11, font: f}));
  return Buffer.from(await d.save());
};
(async () => {
  const files = {
    guarantee: await stand('Bauder 20 Year Guarantee Certificate', ['Project: 81 Redington Road, Hampstead NW3 7RR', 'Guarantee ref: BG-48211', 'Valid until: 20 November 2046', 'System: Bauder Thermofol single ply (rear extension)']),
    warranty: await stand('RTB Roofing 10 Year Workmanship Warranty', ['Project: 81 Redington Road, Hampstead NW3 7RR', 'Covers: workmanship on all roofing works', 'Valid until: 20 November 2036']),
    thermofol: await stand('Bauder Thermofol - Technical Data Sheet', ['Single ply PVC membrane, 1.5 mm', 'Fire: Broof(t4) / BS 476-3']),
    slate: await stand('Cupa Pizarras R12 Natural Slate - Data Sheet', ['Natural slate 500 x 250 mm', 'EN 12326 T1 S1 A1']),
    coshh: await stand('COSHH Assessment - Bauder Thermofol Adhesive', ['Hazard: flammable, irritant', 'Controls: ventilation, gloves, eye protection']),
    paint: await stand('COSHH Assessment - Dulux Weathershield Gloss', ['Hazard: solvent vapour', 'Controls: ventilation, gloves']),
    paintds: await stand('Dulux Weathershield Exterior Gloss - Data Sheet', ['Coverage 16 m2/L', 'Recoat after 16 hours']),
  };
  const logo = fs.readFileSync(path.join(OUT, 'rtb-logo.jpg')), photo = fs.readFileSync(path.join(OUT, 'roof1.jpg')), photo2 = fs.readFileSync(path.join(OUT, 'roof2.jpg'));
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'operative', [], {viewport: {width: 1300, height: 900}});
  seed(db);
  const me = db.profiles.find((p) => p.id === 'me'); const O = me.org_id;
  Object.assign(me, {role: 'operative', name: 'Dan Price', email: 'dan@profinish.co.uk', phone: '07700 900123', howto_dismissed: ['*'], finance_enabled: false, signature_path: 'sig/me.png'});
  Object.assign(db.organizations[0], {name: 'RTB Roofing Ltd', logo_path: `${O}/logo.jpg`, rams_settings: {address: 'Unit 3, Chelmsford Business Park\nChelmsford CM2 5PX', phone: '01245 600 600'}});
  db.profiles.push({id: 'pm1', name: 'Andy Cramp', role: 'admin', org_id: O, email: 'andy@rtb.co.uk', phone: '07700 900001'});
  Object.assign(db.sites.find((s) => s.id === S1), {name: '2602 81 Redington Road', address: '81 Redington Rd, Hampstead, London', postcode: 'NW3 7RR', client_name: 'Hampstead Homes Ltd', job_number: '2602', acting_as_main_contractor: true, responsible_pm_id: 'pm1', status: 'live'});
  if (!db.site_assignments.some((a) => a.user_id === 'me' && a.site_id === S1)) db.site_assignments.push({id: 'sam', site_id: S1, user_id: 'me'});
  db.cpp_plans = [{id: 'cpp1', site_id: S1, org_id: O, title: 'Construction Phase Plan', status: 'issued', version: 1, updated_at: '2026-08-20T10:00:00Z', data: {
    pc: {name: 'RTB Roofing Ltd', address: 'Unit 3, Chelmsford Business Park\nChelmsford CM2 5PX', phone: '01245 600 600', email: 'office@rtb.co.uk'},
    siteName: '81 Redington Road', siteAddress: '81 Redington Rd\nHampstead, London NW3 7RR', outline: 'Main roof re-slate and rear extension flat roof', startDate: '2026-09-01',
    client: {name: 'Hampstead Homes Ltd', address: '', phone: '020 7000 1234', email: 'projects@hampsteadhomes.co.uk', contact: 'James Hart'},
    clientAgent: 'Pellings LLP', principalDesigner: 'Stace LLP', architect: 'Ash Architects', pm: {name: 'Andy Cramp', phone: '07700 900001', email: 'andy@rtb.co.uk'},
    contacts: [{role: 'Principal Designer', name: 'Stace LLP', day: '020 7000 2222', ooh: ''}, {role: 'Architects', name: 'Ash Architects', day: '020 7000 3333', ooh: ''}], sections: [], revisions: []}}];
  db.subcontractor_companies = [{id: 'co1', org_id: O, site_id: S1, name: 'Pro Finish Decorators Ltd', created_at: '2026-09-01T09:00:00Z'}];
  db.subcontractor_operatives = [{id: 'so1', site_id: S1, subcontractor_company_id: 'co1', user_id: 'me', is_admin: true}];
  db.schedule_sections = [{id: 'ss1', site_id: S1, name: 'Main Roof', position: 0}, {id: 'ss2', site_id: S1, name: 'Rear Extension', position: 1}, {id: 'ss3', site_id: S1, name: 'Decorations', position: 2}];
  const task = (id, sec, name, pos, co = null) => ({id, site_id: S1, section_id: sec, name, status: 'done', percent_complete: 100, position: pos, subcontractor_company_id: co});
  db.schedule_tasks = [task('t1', 'ss1', 'Strip existing slates, battens and felt', 0), task('t2', 'ss1', 'Install breathable membrane and new treated battens', 1), task('t3', 'ss1', 'Re-slate in Cupa Pizarras R12 natural slate', 2), task('t4', 'ss1', 'New code 5 lead flashings, soakers and valleys', 3),
    task('t5', 'ss2', 'Strip and install Bauder Thermofol single ply system', 4), task('t6', 'ss3', 'Prepare and paint timber fascias and soffits', 5, 'co1'), task('t7', 'ss3', 'Prepare and paint cast iron rainwater goods', 6, 'co1')];
  db.schedule_photos = [{id: 'ph1', task_id: 't3', storage_path: 'p/slate.jpg', uploaded_at: '2026-10-01T10:00:00Z'}, {id: 'ph2', task_id: 't5', storage_path: 'p/ext.jpg', uploaded_at: '2026-10-02T10:00:00Z'}, {id: 'ph3', task_id: 't6', storage_path: 'p/fascia.jpg', uploaded_at: '2026-10-03T10:00:00Z'}];
  db.handover_docs = [
    {id: 'hd1', site_id: S1, org_id: O, kind: 'guarantee', name: 'Bauder 20 Year Guarantee.pdf', provider: 'Bauder', ref: 'BG-48211', expiry_date: '2046-11-20', maintenance: 'Clear outlets and inspect the membrane every 6 months', storage_path: 'h/guarantee.pdf', position: 0},
    {id: 'hd2', site_id: S1, org_id: O, kind: 'guarantee', name: 'RTB 10 Year Workmanship Warranty.pdf', provider: 'RTB Roofing Ltd', ref: 'RTB-2602', expiry_date: '2036-11-20', maintenance: 'Annual roof inspection', storage_path: 'h/warranty.pdf', position: 1},
    {id: 'hd3', site_id: S1, org_id: O, kind: 'datasheet', name: 'Bauder Thermofol data sheet.pdf', provider: 'Bauder', storage_path: 'h/thermofol.pdf', position: 2},
    {id: 'hd4', site_id: S1, org_id: O, kind: 'datasheet', name: 'Cupa Pizarras R12 slate data sheet.pdf', provider: 'Cupa Pizarras', storage_path: 'h/slate.pdf', position: 3},
  ];
  db.coshh_docs = [{id: 'c1', site_id: S1, org_id: O, name: 'COSHH — Bauder Thermofol Adhesive.pdf', storage_path: 'c/adhesive.pdf', uploaded_at: '2026-09-05T10:00:00Z', subcontractor_company_id: null},
    {id: 'c2', site_id: S1, org_id: O, name: 'COSHH — Dulux Weathershield Gloss.pdf', storage_path: 'c/paint.pdf', uploaded_at: '2026-09-20T10:00:00Z', subcontractor_company_id: 'co1'}];
  db.handover_om_manuals = []; db.drawing_files = [];
  global.__rpc = (name) => name === 'site_completion' ? [{pc_date: '2026-11-20', defects_months: 12}] : name === 'site_boq_works' ? [] : undefined;
  const pdfs = []; let painterPath = null;
  await ctx.route(/supabase\.co\/storage\/v1\/object\//, async (route) => {
    const req = route.request(), u = decodeURIComponent(req.url());
    if (req.method() === 'POST' && /\/issued\//.test(u)) { pdfs.push(req.postDataBuffer()); return route.fallback(); }
    if (req.method() !== 'GET') return route.fallback();
    const pdf = (b) => route.fulfill({status: 200, contentType: 'application/pdf', body: b});
    if (/org-logos/.test(u)) return route.fulfill({status: 200, contentType: 'image/jpeg', body: logo});
    if (/ext.jpg/.test(u)) return route.fulfill({status: 200, contentType: 'image/jpeg', body: photo2});
    if (/site-photos|\.jpg/.test(u) && !/\.pdf/.test(u)) return route.fulfill({status: 200, contentType: 'image/jpeg', body: photo});
    if (painterPath && u.includes(painterPath)) return pdf(pdfs[0]);
    for (const [k, b] of [['guarantee', files.guarantee], ['warranty', files.warranty], ['thermofol', files.thermofol], ['slate', files.slate], ['adhesive', files.coshh], ['paint.pdf', files.paint], ['weathershield', files.paintds]]) if (u.includes(k)) return pdf(b);
    return route.fallback();
  });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const tab = async (n) => { await page.getByRole('tab', {name: new RegExp(`^${n}`)}).first().click(); await page.waitForTimeout(900); };
  await page.goto(B + '/login'); await page.waitForTimeout(5000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // ---- The painter builds theirs ----
  await page.goto(`${B}/sites/${S1}/mc/subcontractors/co1/om`); await page.waitForTimeout(4000);
  await page.locator('text="+ Build One Here" >> visible=true').first().click(); await page.waitForTimeout(7000);
  const pm = db.handover_om_manuals[0];
  // What the painter would type in (as their admin would on the Works and People tabs).
  const sec = (re) => pm.data.sections.find((s) => re.test(s.title || ''));
  sec(/materials/i).rows = [['1', 'Primer', 'Johnstone’s Stormshield Primer', 'Johnstone’s'], ['2', 'Finish', 'Dulux Weathershield Exterior Gloss (Black)', 'Dulux'], ['3', 'COSHH', 'Dulux Weathershield Gloss', 'Dulux']];
  sec(/materials/i).links = [[], [{bucket: 'mc-documents', path: 'h/weathershield.pdf', name: 'Dulux Weathershield data sheet'}], [{bucket: 'coshh-docs', path: 'c/paint.pdf', name: 'COSHH — Dulux Weathershield Gloss'}]];
  sec(/guarantee/i).rows = [['Pro Finish Decorators – 2 Year Workmanship Guarantee', 'PF-2602', '20/11/2028', 'Wash down annually; touch up any damage within 3 months']];
  sec(/maintenance/i).items = [{id: 'm1', key: null, title: 'Painted timber and rainwater goods', text: 'Every year:\n• Wash fascias, soffits, gutters and downpipes with warm water and a mild detergent; rinse with clean water.\n• Check for cracking, flaking or bare timber, especially on south and west faces, and touch up straight away.\nEvery 5 to 7 years:\n• Rub down, spot prime bare areas and apply two coats of the same exterior gloss (Dulux Weathershield, black).\nNotes:\n• Do not use pressure washers or solvent cleaners on the paintwork.'}];
  sec(/health & safety/i).body = 'Residual risks for anyone maintaining these works:\n• Work at height on fascias and gutters: use a tower scaffold or MEWP, not ladders, for anything more than a short inspection.\n• Lead in old paint layers: assume older coats contain lead; wet-sand only, no dry sanding or burning off.\n• Paints and solvents: use in line with the COSHH assessment (attached), with good ventilation.';
  sec(/contacts/i).rows = [['Contact name', 'Dan Price'], ['Position', 'Director'], ['Telephone', '07700 900123'], ['Email', 'dan@profinish.co.uk']];
  (sec(/contractor details/i).rows.find((r) => /^address/i.test(r[0])) || [])[1] = '14 Station Road, Witham CM8 2AA';
  (sec(/contractor details/i).rows.find((r) => /^tele/i.test(r[0])) || [])[1] = '01376 500 500';
  await page.reload(); await page.waitForTimeout(7000);
  await tab('Issue');
  await page.getByRole('button', {name: 'Submit Revision 1'}).first().click(); await page.waitForTimeout(12000);
  painterPath = (db.handover_om_manuals[0].data.revisions?.[0]?.path || '').split('/').pop();
  fs.writeFileSync(path.join(OUT, 'Painter-OM.pdf'), pdfs[0]);
  console.log('painter submitted:', !!db.handover_om_manuals[0].submitted_at, (await PDFDocument.load(pdfs[0])).getPageCount(), 'pages');

  // ---- RTB's own, built from the job and its CPP, with the painter's in the back ----
  Object.assign(me, {role: 'admin', name: 'Andy Cramp', email: 'andy@rtb.co.uk', phone: '07700 900001'}); db.subcontractor_operatives = [];
  await page.goto(`${B}/sites/${S1}/handover`); await page.waitForTimeout(6000);
  await page.locator('text="+ New O&M Manual" >> visible=true').first().click(); await page.waitForTimeout(8000);
  await tab('Issue');
  await page.getByRole('button', {name: 'Issue Revision 1'}).first().click(); await page.waitForTimeout(25000);
  const mc = pdfs[1];
  fs.writeFileSync(path.join(OUT, 'RTB-OM-with-painter.pdf'), mc);
  console.log('RTB O&M:', (await PDFDocument.load(mc)).getPageCount(), 'pages; not attached:', (await page.locator('body').innerText()).match(/could not be added[^\n]*/)?.[0] || 'none');
  await page.screenshot({path: path.join(OUT, 'viewer.png')});
  // Every page, a few at a time, for checking.
  await page.setViewportSize({width: 900, height: 6000}); await page.waitForTimeout(6000);
  for (let i = 1; i <= 5; i++) { await page.screenshot({path: path.join(OUT, 'pages-' + i + '.png')}); await page.mouse.move(450, 3000); await page.mouse.wheel(0, 5800); await page.waitForTimeout(3500); }
  console.log('errors:', errs.slice(0, 3).join(' | ') || 'none');
  global.__rpc = undefined;
  await browser.close();
})();
