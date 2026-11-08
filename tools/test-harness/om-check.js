// The O&M, simplified (Andy, 8 Nov 2026): + New O&M Manual searches the job's OneDrive folder for guarantees and data sheets
// first (photo folders skipped, invoices left out) and copies the ticked ones in; the manual is four steps (Cover, Scope Of
// Works from the Bill of Quantities when the company has Finance, What Goes In The Back, The Rest folded); + Add To The
// Back ▾ adds the Bill of Quantities (no prices) and a Schedule of Works report for the sections ticked; one Export ▾.
// Fake database, laptop size. node om-check.js
const {chromium, makeContext, S1} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const BASE = 'http://localhost:8081';
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1300, height: 900}});
  seed(db); db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id;
  Object.assign(db.sites[0], {onedrive_folder_id: 'od-root', onedrive_drive_id: 'drv1', onedrive_folder_name: 'J101 Studley Rd'});
  db.handover_docs = []; db.handover_om_manuals = [];
  db.schedule_sections = [{id: 'ss1', site_id: S1, name: 'Main Roof', position: 0}, {id: 'ss2', site_id: S1, name: 'Gutters', position: 1}];
  db.schedule_tasks = [{id: 'st1', site_id: S1, section_id: 'ss1', name: 'Strip felt', status: 'done', position: 0}, {id: 'st2', site_id: S1, section_id: 'ss2', name: 'New gutter', status: 'done', position: 1}];
  const listed = [];
  global.__fn = (name, b) => {
    if (name === 'onedrive-list-folders') {
      listed.push(b.parent_id);
      if (b.parent_id === 'od-root') return {folders: [{id: 'od-ho', name: 'Handover', driveId: 'drv1'}, {id: 'od-ph', name: 'Survey Photos', driveId: 'drv1'}], files: [{id: 'f1', name: 'Bauder 20yr Guarantee.pdf', driveId: 'drv1'}, {id: 'f2', name: 'Invoice 7781.pdf', driveId: 'drv1'}]};
      if (b.parent_id === 'od-ho') return {folders: [{id: 'od-war', name: 'Warranties', driveId: 'drv1'}], files: [{id: 'f3', name: 'Sika DoP.pdf', driveId: 'drv1'}]};
      if (b.parent_id === 'od-war') return {folders: [], files: [{id: 'f4', name: 'Cert 0091.pdf', driveId: 'drv1'}]};
      return {folders: [], files: []};
    }
    if (name === 'onedrive-download-file') return {content_base64: 'JVBERi0xLjQK'};
    return {ok: true};
  };
  global.__rpc = (name) => name === 'site_boq_works' ? [
    {id: 'b1', position: 0, kind: 'section', ref: null, section: null, description: 'Main Roof', qty: null, unit: null},
    {id: 'b2', position: 1, kind: 'item', ref: '1.1', section: null, description: 'Bauder 2-layer system', qty: 120, unit: 'm²'},
  ] : undefined;
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const menu = (label) => page.locator(`text="${label}" >> visible=true`).last();
  await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // ---- Handover: + New O&M Manual looks in OneDrive first ----
  await page.goto(`${BASE}/sites/${S1}/handover`); await page.waitForTimeout(5000);
  let t = await text();
  check(/O&M Manuals/.test(t) && /Data Sheets/.test(t) && /job’s OneDrive folder is searched/.test(t), 'Handover: capitalised tabs; says OneDrive is searched first');
  await page.getByText('+ New O&M Manual', {exact: true}).click(); await page.waitForTimeout(3000);
  t = await text();
  check(/Found In The Job’s OneDrive Folder/.test(t) && /Bauder 20yr Guarantee\.pdf/.test(t) && /Cert 0091\.pdf/.test(t) && /Sika DoP\.pdf/.test(t) && !/Invoice 7781/.test(t), 'found: two guarantees (one by its Warranties folder) and a data sheet; the invoice left out');
  check(!listed.includes('od-ph'), 'the Survey Photos folder isn’t searched');
  await page.screenshot({path: 'shots/om-onedrive.png'});
  await page.getByText('Add 3 Ticked', {exact: true}).click(); await page.waitForTimeout(6000);
  const kinds = db.handover_docs.map((x) => `${x.kind}:${x.name}`).sort().join(' | ');
  check(kinds === 'datasheet:Sika DoP.pdf | guarantee:Bauder 20yr Guarantee.pdf | guarantee:Cert 0091.pdf' && db.handover_docs.every((x) => x.storage_path), `copied into the handover as guarantees / data sheets (${kinds})`);
  check(/\/om\//.test(page.url()) && db.handover_om_manuals.length === 1, 'then the manual is built and opened (no name to type)');

  // ---- The manual: four steps ----
  await page.waitForTimeout(3000);
  t = await text();
  check(/1\. Cover/.test(t) && /2\. Scope Of Works Completed/.test(t) && /3\. What Goes In The Back/.test(t) && /4\. The Rest Of The Manual/.test(t) && /Export ▾/.test(t), 'four steps and one Export ▾');
  const scope = await page.getByLabel('Scope of works').inputValue();
  check(/The following works were carried out to Main Roof:/.test(scope) && /Bauder 2-layer system \(120 m²\)/.test(scope) && !/£/.test(scope), 'Scope of Works from the Bill of Quantities, quantities but no prices');
  check(/Guarantees \(2\)/.test(t) && /Data Sheets \(1\)/.test(t), 'what goes in the back counts the guarantees and data sheets found');
  check(await page.getByLabel('Cover title').count() === 0 && await page.getByLabel('Section heading').count() === 0, 'the cover and the other sections are folded until opened');
  await page.screenshot({path: 'shots/om-manual.png', fullPage: true});

  // + Add To The Back: the Bill of Quantities, then a Schedule of Works report for one section, completed works only.
  await page.getByText('+ Add To The Back ▾', {exact: true}).click(); await page.waitForTimeout(800);
  await menu('📋 Bill Of Quantities (Works Completed, No Prices)').click(); await page.waitForTimeout(600);
  await page.getByText('+ Add To The Back ▾', {exact: true}).click(); await page.waitForTimeout(800);
  await menu('📋 Schedule Of Works Report (Choose The Sections)').click(); await page.waitForTimeout(1500);
  t = await text();
  check(/Main Roof \(1 Task\)/.test(t) && /Gutters \(1 Task\)/.test(t) && /Completed Works Only\?/.test(t), 'Schedule Of Works Report: the sections to tick, and Completed Works Only? Yes / No');
  await page.getByText('Gutters (1 Task)').click(); await page.waitForTimeout(300);
  await page.getByText('Add To The Back', {exact: true}).last().click(); await page.waitForTimeout(2500);
  const ap = db.handover_om_manuals[0].data?.appendix || [];
  check(ap[0]?.kind === 'boq' && ap.some((e) => e.kind === 'sow-app' && JSON.stringify(e.sections) === '["ss1"]' && e.doneOnly === true && /Main Roof/.test(e.label)), `saved: the BoQ first, the Schedule of Works for Main Roof only (${ap.map((e) => e.label).join(' | ')})`);

  // A folded section opens with a tap; Export ▾ offers PDF, Word and email.
  await page.getByRole('button', {name: /Introduction/}).first().click(); await page.waitForTimeout(500);
  check(await page.getByLabel('Section heading').count() === 1, 'tap a section: it opens to edit');
  await page.getByText('Export ▾', {exact: true}).click(); await page.waitForTimeout(500);
  t = await text();
  check(/Download PDF/.test(t) && /Download Word/.test(t) && /Email PDF/.test(t) && /Email Word/.test(t), 'Export ▾: Download PDF / Word, Email PDF / Word');
  const dl = page.waitForEvent('download', {timeout: 90000}).catch(() => null);
  await menu('📄 Download PDF').click();
  const pdfPick = page.locator('text="📄 PDF" >> visible=true').last(); await pdfPick.waitFor({timeout: 90000}).catch(() => {}); if (await pdfPick.count()) await pdfPick.click();
  const file = await dl; const fp = file ? await file.path() : null;
  const head = fp ? require('fs').readFileSync(fp).slice(0, 5).toString() : '';
  const size = fp ? require('fs').statSync(fp).size : 0;
  check(head === '%PDF-' && size > 3000, 'Download PDF: the manual builds with the BoQ and the chosen Schedule of Works in the back (' + size + ' bytes)');
  check(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
})();
