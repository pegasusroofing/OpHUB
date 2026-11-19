// A clean slate for every company's OneDrive (Andy, 19 Nov 2026: "the where things save is pre populated, which copies
// rtb roofing. i need it to be a clean slate for every company, that then set up themselves"), and the Expenses settings
// closing once saved with an Edit button ("close it once saved and have an edit button for this please").
// Set It Up saves nothing anywhere and has no folders of RTB's; choosing the template reads its folders and documents
// from OneDrive; a new item to save asks for its folder. Fake database; server calls caught. node cleanslate19-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const path = require('path');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
const BASE = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'shots', 'cleanslate19');
require('fs').mkdirSync(SHOTS, {recursive: true});
// A company's own OneDrive: its folder, its template, and what's in the template.
const KIDS = {
  '': [{id: 'f-con', name: 'RTB Construction', driveId: 'd1'}],
  'f-con': [{id: 'f-tpl', name: '- New Job Pack - Template', driveId: 'd1'}, {id: 'f-live', name: '3. Live Projects', driveId: 'd1'}],
  'f-tpl': [{id: 'f-1', name: '1. Contract', driveId: 'd1'}, {id: 'f-2', name: '2. Health & Safety', driveId: 'd1'}],
  'f-1': [{id: 'f-11', name: '1. Orders', driveId: 'd1'}],
};
const FILES = {'f-tpl': ['Handover Checklist.xlsx'], 'f-1': ['Application For Payment.xlsx']};

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {viewport: {width: 1366, height: 900}});
  seed(db); db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id; db.organizations[0].name = 'RTB Construction Group';
  db.onedrive_connections = [{org_id: O, account_email: 'andy@rtb.example', folder_path: 'RTB Construction', connected_at: new Date().toISOString()}];
  db.job_pack_settings = [];
  global.__fn = (name, b) => (name === 'onedrive-list-folders' ? {folders: KIDS[b.parent_id || ''] || [], files: b.includeFiles ? (FILES[b.parent_id] || []).map((n) => ({name: n})) : []} : {ok: true});
  global.__rpc = (n) => (n === 'onedrive_status' ? {exists: true, connected: true, needs_reconnect: false, account_email: 'andy@rtb.example', folder_path: 'RTB Construction'} : undefined);
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  await page.goto(BASE + '/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);

  // ---- OneDrive: Set It Up is a clean slate ----
  await page.goto(`${BASE}/pm/admin/onedrive`); await page.waitForTimeout(4500);
  await page.getByText('Set It Up', {exact: true}).click(); await page.waitForTimeout(2500);
  let c = (db.job_pack_settings[0] || {}).config || {};
  check(c.parent_path === 'RTB Construction' && !Object.keys(c.rules || {}).length && !(c.folders || []).length && !(c.files || []).length, `Set It Up: nothing saving, no folders or documents of RTB's (${Object.keys(c.rules || {}).length} rules, ${(c.folders || []).length} folders, ${(c.files || []).length} documents)`);
  let t = await text();
  check(/Nothing saving here yet/.test(t), 'Where Things Save starts empty');
  // Built From: the picker opens in the company's main folder; the template's own folders and documents are read in.
  await page.getByText(/^📁 Choose A Folder/).first().click(); await page.waitForTimeout(3000);
  t = await text();
  check(/My Files › RTB Construction/.test(t) && /- New Job Pack - Template/.test(t), 'the folder picker opens in the company’s main folder');
  await page.getByText('- New Job Pack - Template', {exact: true}).last().click(); await page.waitForTimeout(1200);
  await page.getByText('Use “- New Job Pack - Template”', {exact: true}).click(); await page.waitForTimeout(5000);
  c = db.job_pack_settings[0].config;
  check(c.template_path === 'RTB Construction/- New Job Pack - Template', `the template is saved (${c.template_path})`);
  check(JSON.stringify([...c.folders].sort()) === JSON.stringify(['1. Contract', '1. Contract/1. Orders', '2. Health & Safety']), `its folders are read from OneDrive (${c.folders.join(' | ')})`);
  check(c.files.length === 2 && c.files.some((f) => f.folder === '' && f.name === 'Handover Checklist.xlsx') && c.files.some((f) => f.folder === '1. Contract' && f.name === 'Application For Payment.xlsx'), `and its documents (${c.files.map((f) => `${f.folder || 'top'}/${f.name}`).join(' | ')})`);
  t = await text();
  check(/3 Folders, 2 Documents/.test(t) && /Read Again From The Template/.test(t), 'the page shows 3 Folders, 2 Documents, with Read Again From The Template');
  // Adding something to save: each job's own folder unless another is chosen, from the template in OneDrive.
  await page.getByText('+ Add Something To Save', {exact: true}).click(); await page.waitForTimeout(1200);
  t = await text();
  check(/Save It In 📁 Each Job’s Folder/.test(t), 'a new item saves into each job’s own folder to start with');
  await page.getByText('📁 Each Job’s Folder ▾', {exact: true}).last().click(); await page.waitForTimeout(3000);
  t = await text();
  check(/1\. Contract/.test(t) && /2\. Health & Safety/.test(t) && !/5\. OpHUB/.test(t) && /Use Each Job’s Folder/.test(t), 'choosing a folder shows the template’s own folders from OneDrive');
  await page.getByText('1. Contract', {exact: true}).last().click(); await page.waitForTimeout(1500);
  await page.getByText('Use “1. Contract”', {exact: true}).click(); await page.waitForTimeout(800);
  await page.getByText('Add', {exact: true}).last().click(); await page.waitForTimeout(2000);
  c = db.job_pack_settings[0].config;
  let added = Object.entries(c.rules || {});
  check(added.length === 1 && added[0][1].folder === '1. Contract' && added[0][1].on, `one item saving, into 1. Contract (${added.map(([k, r]) => `${k} → ${r.folder}`).join(', ')})`);
  await page.getByText('+ Add Something To Save', {exact: true}).click(); await page.waitForTimeout(1200);
  await page.getByText('Add', {exact: true}).last().click(); await page.waitForTimeout(2000);
  added = Object.entries(db.job_pack_settings[0].config.rules || {});
  check(added.length === 2 && added.some(([, r]) => r.folder === '' && r.on), `added straight away: it saves into each job’s own folder (${added.map(([k, r]) => `${k} → ${r.folder || 'each job’s folder'}`).join(', ')})`);
  await page.screenshot({path: path.join(SHOTS, 'onedrive.png'), fullPage: true});
  // A folder list copied from another company before is read again from this company's own template.
  Object.assign(db.job_pack_settings[0].config, {folders: ['5. OpHUB x Photos & Inspections', '2. Health & Safety/1. RAMS'], files: [{folder: '', name: 'RTB Handover Checklist.xlsx'}]});
  delete db.job_pack_settings[0].config.template_read;
  await page.goto(`${BASE}/pm/admin/onedrive`); await page.waitForTimeout(7000);
  c = db.job_pack_settings[0].config;
  check(!c.folders.some((f) => /OpHUB x Photos/.test(f)) && c.folders.includes('1. Contract/1. Orders') && !c.files.some((f) => /RTB/.test(f.name)) && !!c.template_read, `a copied folder list is replaced by its own template’s (${c.folders.join(' | ')})`);

  // ---- Expenses: a summary once saved, with Edit ----
  db.organizations[0].expenses_email = 'office@rtb.example'; db.organizations[0].expenses_retention_months = 6;
  await page.goto(`${BASE}/pm/admin/expensesemail`); await page.waitForTimeout(4000);
  t = await text();
  check(/Send Expenses To office@rtb\.example/.test(t) && /6 Months/.test(t) && /✎ Edit/.test(t) && !(await page.locator('input[placeholder="e.g. info@yourcompany.co.uk"]').count()), 'Expenses: once saved it shows as a summary with ✎ Edit (no open form)');
  await page.screenshot({path: path.join(SHOTS, 'expenses-saved.png')});
  await page.getByText('✎ Edit', {exact: true}).click(); await page.waitForTimeout(1000);
  await page.fill('input[placeholder="e.g. info@yourcompany.co.uk"]', 'accounts@rtb.example');
  await page.getByText('Save', {exact: true}).click(); await page.waitForTimeout(2500);
  t = await text();
  check(db.organizations[0].expenses_email === 'accounts@rtb.example' && /Send Expenses To accounts@rtb\.example/.test(t) && !(await page.locator('input[placeholder="e.g. info@yourcompany.co.uk"]').count()), 'Edit, change, Save: saved and closed again');
  db.organizations[0].expenses_email = null;
  await page.goto(`${BASE}/pm/admin/expensesemail`); await page.waitForTimeout(4000);
  check(await page.locator('input[placeholder="e.g. info@yourcompany.co.uk"]').count() === 1, 'not set yet: the form is open');
  check(!errs.length, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
