// Old app vs new app, side by side, for the Admin Centre and every Finance screen (5 Nov 2026). Fake database only.
//   MSYS_NO_PATHCONV=1 node cmp-fin.js [width] [only-these,names] [old|new]
// Same rows in both apps (seeds/fincmp.js). For each screen it saves
//   shots/cmp/fin/<name>-old-<w>.png and <name>-new-<w>.png
// and writes shots/cmp/fin/inv-<w>-old.json / -new.json: the buttons, boxes, headings and text each app shows, so every
// button can be compared. `node cmp-fin.js diff [width]` prints, per screen, the buttons only one app has
// (words seen on most screens - the menus round the page - are left out).
const {chromium, makeContext, serve, login, S1} = require('./harness');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'shots', 'cmp', 'fin'); fs.mkdirSync(OUT, {recursive: true});
const NEW = 'http://localhost:8081';
const J = `/site/${S1}`;
// [name, old hash route, new route]
const PAIRS = [
  // ---- Finance: section pages
  ['fin-overview', '#/finance', '/fin'],
  ['fin-projects', '#/finance/jobs', '/fin/jobs'],
  ['fin-sales-apps', '#/finance/sales/apps', '/fin/sales?tab=apps'],
  ['fin-sales-invoices', '#/finance/sales/invoices', '/fin/sales?tab=invoices'],
  ['fin-sales-retention', '#/finance/sales/retention', '/fin/sales?tab=retention'],
  ['fin-pur-orders', '#/finance/purchases/orders', '/fin/purchases?tab=orders'],
  ['fin-pur-invoices', '#/finance/purchases/invoices', '/fin/purchases?tab=invoices'],
  ['fin-pur-plant', '#/finance/purchases/plant', '/fin/purchases?tab=plant'],
  ['fin-pur-pricebook', '#/finance/purchases/pricebook', '/fin/purchases?tab=pricebook'],
  ['fin-pur-pricelists', '#/finance/purchases/pricebook', '/fin/purchases?tab=pricelists'],
  ['fin-pur-statements', '#/finance/purchases/statements', '/fin/statements'],
  ['fin-pur-yard', '#/finance/purchases/yard', '/fin/yard'],
  ['fin-inbox', '#/finance/inbox', '/fin/inbox/ib1'],
  ['fin-subs-opinv', '#/finance/subs/opinv', '/fin/subs?tab=opinv'],
  ['fin-subs-orders', '#/finance/subs/orders', '/fin/subs?tab=orders'],
  ['fin-subs-apps', '#/finance/subs/apps', '/fin/subs?tab=apps'],
  ['fin-subs-cis', '#/finance/labour/cis', '/fin/subs?tab=cis'],
  ['fin-subs-payrun', '#/finance/labour/payrun', '/fin/subs?tab=payrun'],
  ['fin-labour-payment', '#/finance/labour/payment/sp1', '/fin/labour/w1'],
  ['fin-reports', '#/finance/reports', '/fin/reports'],
  ['fin-rep-debtors', '#/finance/reports/debtors', '/fin/reports?id=debtors'],
  ['fin-rep-cvr', '#/finance/reports/cvr', '/fin/reports?id=cvr'],
  ['fin-dir-clients', '#/finance/directory/clients', '/fin/directory?kind=client'],
  ['fin-dir-suppliers', '#/finance/directory/suppliers', '/fin/directory?kind=supplier'],
  ['fin-dir-labour', '#/finance/directory/labour', '/fin/directory?kind=labour'],
  ['fin-settings', '#/finance/settings', '/fin/settings'],
  ['fin-codes', '#/finance/settings/codes', '/fin/directory?kind=codes'],
  ['fin-templates', '#/finance/settings', '/fin/templates'],
  ['fin-team', '#/finance/settings', '/fin/team'],
  // ---- Finance: one project
  ['job-overview', `#${J}/finance`, `/fin/job/${S1}`],
  ['job-sales', `#${J}/finance?tab=sales`, `/fin/job/${S1}?tab=sales`],
  ['job-purchases', `#${J}/finance?tab=purchases`, `/fin/job/${S1}?tab=purchases`],
  ['job-subs', `#${J}/finance?tab=subs`, `/fin/job/${S1}?tab=subs`],
  ['job-setup', `#${J}/finance?tab=setup`, `/fin/job/${S1}?tab=setup`],
  ['job-boq', `#${J}/finance/contract`, `/fin/job/${S1}/boq`],
  ['job-variations', `#${J}/finance/variations`, `/fin/job/${S1}/variations`],
  ['job-summary', `#${J}/finance/summary`, `/fin/job/${S1}/summary`],
  ['job-costs', `#${J}/finance/costs`, `/fin/job/${S1}/costs`],
  ['job-budget', `#${J}/finance/budget`, `/fin/job/${S1}/budget`],
  ['job-monthly', `#${J}/finance/monthly`, `/fin/job/${S1}/monthly`],
  ['job-parts', `#${J}/finance/parts`, `/fin/job/${S1}/parts`],
  ['job-quotes', `#${J}/finance/shopping`, `/fin/job/${S1}/quotes`],
  ['job-app-cert', `#${J}/finance/application/a1`, `/fin/job/${S1}/application/a1`],
  ['job-app-draft', `#${J}/finance/application/a3`, `/fin/job/${S1}/application/a3`],
  ['job-invoice', `#${J}/finance/invoice/v1`, `/fin/job/${S1}/invoice/v1`],
  ['job-po', `#${J}/finance/po/po1`, '/fin/po/po1'],
  ['job-sub', `#${J}/finance/sub/sc1`, '/fin/sub/sc1'],
  ['fin-pinv', '#/finance/purchases/invoices', '/fin/pinv/pi1'],
  ['fin-plant', '#/finance/purchases/plant', '/fin/plant/h1'],
  // ---- Admin Centre
  ['adm-front', '#/team', '/pm/admin'],
  ['adm-company', '#/team/company', '/pm/admin?page=company'],
  ['adm-libraries', '#/team/libraries', '/pm/admin?page=libraries'],
  ['adm-people', '#/team/people', '/pm/admin?page=people'],
  ['adm-branding', '#/team/company/branding', '/pm/admin/branding'],
  ['adm-expenses', '#/team/company/expensesemail', '/pm/admin/expensesemail'],
  ['adm-onedrive', '#/team/company/onedrive', '/pm/admin/onedrive'],
  ['adm-jobpack', '#/team/company/onedrive', '/pm/admin/jobpack'],
  ['adm-reporttpl', '#/team/libraries/reporttemplates', '/pm/admin/templates'],
  ['adm-signtpl', '#/sign-templates', '/pm/admin/signtemplates'],
  ['adm-sowlib', '#/team/libraries/sowlibrary', '/pm/admin/sowlibrary'],
  ['adm-ratecard', '#/team/libraries/pricebuilder', '/pm/admin/ratecard'],
  ['adm-suppliers', '#/suppliers', '/pm/admin/suppliers'],
  ['adm-maincon', '#/team/libraries/maincontractor', '/pm/admin/companylibrary'],
  ['adm-hspolicy', '#/team/libraries/hspolicy', '/pm/admin/hspolicy'],
  ['adm-havs', '#/team/libraries/havstools', '/pm/admin/havstools'],
  ['adm-rams', '#/rams-library', '/pm/admin/ramslibrary'],
  ['adm-coshh', '#/coshh-substances', '/pm/admin/coshh'],
  ['adm-tbt', '#/team/libraries/tbt', '/pm/admin/tbt'],
  ['adm-ppelog', '#/team/libraries/ppelog', '/pm/admin/ppelog'],
  ['adm-invites', '#/team/people/invites', '/pm/admin/invites'],
  ['adm-users', '#/team/people/users', '/pm/admin/users'],
  ['adm-devicelocks', '#/team/people/devicelocks', '/pm/admin/devicelocks'],
  ['adm-checkinlogs', '#/team/people/checkinlogs', '/pm/admin/checkinlogs'],
  ['adm-drivercheck', '#/team/people/drivercheckins', '/pm/admin/drivercheckins'],
  ['adm-subapps', '#/subapplications', '/pm/admin/subapps'],
  ['adm-subapp1', '#/subapplications/ap1', '/pm/admin/subapps/ap1'],
  ['adm-operatives', '#/operatives', '/pm/operatives'],
  ['adm-hr', '#/hr', '/pm/hr'],
  ['adm-hr-holidays', '#/hr/holidays', '/pm/hr/holidays'],
  ['adm-hr-requests', '#/hr/holidays/req', '/pm/hr/holidays?view=req'],
  ['adm-hr-policies', '#/hr/policies', '/pm/hr/policies'],
  ['adm-activity', `#${J}/activity`, `/sites/${S1}/activity`],
  ['adm-superadmin', '#/', '/home', 'superadmin'],
];

// What each app shows: buttons, boxes, headings and the text. Runs in the page.
function inventory() {
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const clean = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean)[0] || '';
  const txt = (el) => clean(el.innerText || el.getAttribute('aria-label') || el.title || el.value || '').slice(0, 70);
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const btnSel = 'button, a[href], [onclick], [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=radio], [tabindex="0"]';
  const buttons = uniq([...document.querySelectorAll(btnSel)].filter(vis).filter((el) => !el.querySelector(btnSel) || (el.innerText || '').length < 40).map(txt));
  const inputs = uniq([...document.querySelectorAll('input, textarea, select')].filter(vis).map((el) => {
    const lab = el.getAttribute('aria-label') || el.placeholder || (el.labels && el.labels[0] && el.labels[0].innerText) || '';
    const kind = el.tagName === 'SELECT' ? 'select' : (el.type || 'text');
    return `${kind}: ${clean(lab).slice(0, 50)}`;
  }));
  const heads = uniq([...document.querySelectorAll('th, [role=columnheader], [role=heading], h1, h2, h3, .sectiontitle')].filter(vis).map(txt));
  const text = (document.body.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 6000);
  return {buttons, inputs, heads, text, url: location.href};
}

const W = +(process.argv[2] || 1300);
async function run() {
  const only = process.argv[3] ? process.argv[3].split(',') : null;
  const which = process.argv[4] || 'both';
  const list = PAIRS.filter((p) => !only || only.includes(p[0]));
  const files = {old: path.join(OUT, `inv-${W}-old.json`), neu: path.join(OUT, `inv-${W}-new.json`)};
  const load = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});
  const inv = {old: load(files.old), neu: load(files.neu)};
  // OneDrive can hold the file for a moment: try again rather than stop the run.
  const keep = (side) => { for (let i = 0; i < 5; i++) { try { fs.writeFileSync(files[side], JSON.stringify(inv[side], null, 1)); return; } catch (e) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); } } };
  const browser = await chromium.launch();
  const opt = {viewport: {width: W, height: W < 500 ? 844 : 1000}};
  const seedBoth = (db, role) => { require('./seeds/fincmp')(db, S1); const me = db.profiles.find((p) => p.id === 'me'); me.role = role; me.howto_dismissed = ['*']; me.signature_path = 'sig/me.png'; me.finance_enabled = true; };
  for (const role of ['admin', 'superadmin']) {
    const mine = list.filter((p) => (p[3] || 'admin') === role); if (!mine.length) continue;
    // Old app (app.html)
    if (which !== 'new') {
      const {srv, port} = await serve();
      const {ctx, db} = await makeContext(browser, 'admin', [], opt); seedBoth(db, role);
      const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
      page.on('dialog', (d) => d.dismiss().catch(() => {}));
      await login(page, port);
      for (const [name, old] of mine) {
        errs.length = 0;
        await page.evaluate((h) => { try { closeModal && closeModal(); } catch (e) { /* none */ } go(h); }, old).catch(() => {});
        await page.waitForTimeout(3500);
        await page.screenshot({path: path.join(OUT, `${name}-old-${W}.png`), fullPage: true});
        inv.old[name] = Object.assign(await page.evaluate(inventory), {errors: errs.slice(0, 3)}); keep('old');
        console.log(name, 'old', inv.old[name].buttons.length, 'buttons', errs.length ? 'ERR ' + errs[0].slice(0, 80) : '');
      }
      await ctx.close(); srv.close();
    }
    // New app (Expo dev server)
    if (which !== 'old') {
      const {ctx, db} = await makeContext(browser, 'admin', [], opt); seedBoth(db, role);
      const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
      await page.goto(NEW + '/login'); await page.waitForTimeout(5000);
      await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
      await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
      for (const [name, , neu] of mine) {
        errs.length = 0;
        await page.goto(NEW + neu).catch(() => {}); await page.waitForTimeout(4500);
        await page.screenshot({path: path.join(OUT, `${name}-new-${W}.png`), fullPage: true});
        inv.neu[name] = Object.assign(await page.evaluate(inventory), {errors: errs.slice(0, 3)}); keep('neu');
        console.log(name, 'new', inv.neu[name].buttons.length, 'buttons', errs.length ? 'ERR ' + errs[0].slice(0, 80) : '');
      }
      await ctx.close();
    }
  }
  await browser.close();
}

// Words on most screens are the menus round the page: leave them out of the per-screen lists.
function diff() {
  const w = +(process.argv[3] || 1300);
  const rd = (x) => JSON.parse(fs.readFileSync(path.join(OUT, `inv-${w}-${x}.json`), 'utf8'));
  const io = rd('old'), inn = rd('new'), inv = {};
  Object.keys(io).forEach((k) => { inv[k] = {old: io[k], neu: inn[k]}; });
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9£%&+ ]/g, ' ').replace(/\s+/g, ' ').trim();
  const names = Object.keys(inv);
  const common = (side) => { const n = {}; names.forEach((k) => { const x = inv[k][side]; if (x) new Set(x.buttons.map(norm)).forEach((b) => { n[b] = (n[b] || 0) + 1; }); }); return new Set(Object.keys(n).filter((b) => n[b] > names.length * 0.5)); };
  const shellOld = common('old'), shellNew = common('neu');
  for (const k of names) {
    const o = inv[k].old, n = inv[k].neu; if (!o || !n) continue;
    const ob = new Set(o.buttons.map(norm).filter((b) => b && !shellOld.has(b))), nb = new Set(n.buttons.map(norm).filter((b) => b && !shellNew.has(b)));
    const oi = new Set(o.inputs.map(norm)), ni = new Set(n.inputs.map(norm));
    const oh = new Set(o.heads.map(norm)), nh = new Set(n.heads.map(norm));
    const only = (a, b) => [...a].filter((x) => !b.has(x));
    console.log(`\n### ${k}`);
    console.log('  old only buttons:', only(ob, nb).join(' | '));
    console.log('  new only buttons:', only(nb, ob).join(' | '));
    console.log('  old only boxes:', only(oi, ni).join(' | '));
    console.log('  new only boxes:', only(ni, oi).join(' | '));
    console.log('  old only headings:', only(oh, nh).join(' | '));
    console.log('  new only headings:', only(nh, oh).join(' | '));
    if (o.errors.length || n.errors.length) console.log('  errors:', o.errors.concat(n.errors).join(' / ').slice(0, 300));
  }
}
if (process.argv[2] === 'diff') diff(); else run();
