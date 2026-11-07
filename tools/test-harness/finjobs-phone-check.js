// Finance › Projects on a phone (Andy, 7 Nov 2026): Option 2, a small table of Job No, Project (client underneath),
// Value and PM. No Owed. Job No, Value and PM centred in their columns; the project on the left. + New Project sits
// beside Filter, so the Finance tabs get the whole width. Tap a heading to sort; tap a row to open the project.
// Fake database. node finjobs-phone-check.js
const {chromium, makeContext} = require('./harness');
const seed = require('./fresh/seed');
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const {ctx, db} = await makeContext(browser, 'admin', [], {shot: true});
  seed(db); db.profiles[0].finance_enabled = true; db.profiles[0].howto_dismissed = ['*'];
  const O = db.organizations[0].id;
  // A few more live projects, so the table looks like a real list.
  [['Harbour Mill – Industrial Unit', 'J110', 'Hollin Developments Ltd', 96400], ['Kestrel House – Office Refurb', 'J111', 'Kestrel Facilities Management', 42750], ['Oakfield Primary School – Re-roof', 'J112', 'Ashcroft Estates Ltd', 186000], ['Richardson Court', 'J113', 'Ashcroft Estates Ltd', 1000], ['Riverside Apartments – Flat Roof', 'J114', 'Northgate Build Ltd', 248500]]
    .forEach(([name, no, cli, v], i) => { const id = 'sx' + i; db.sites.push({...db.sites[0], id, name, job_number: no, client_name: cli, responsible_pm_id: i % 2 ? 'me' : null}); db.job_finance.push({site_id: id, org_id: O, billing_type: 'invoice', contract_value: v, billing_name: cli}); });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8081/login'); await page.waitForTimeout(4000);
  await page.fill('input[placeholder="you@yourcompany.co.uk"]', 'a@x.co'); await page.fill('input[type="password"]', 'pw123456');
  await page.getByText('Sign In', {exact: true}).click(); await page.waitForTimeout(5000);
  await page.goto('http://localhost:8081/fin/jobs'); await page.waitForTimeout(6000);

  const tbl = page.getByLabel('Projects table');
  const txt = await tbl.innerText();
  check(/Job No/.test(txt) && /Project/.test(txt) && /Value/.test(txt) && /\bPM\b/.test(txt), 'the table has Job No, Project, Value and PM');
  check(!/Owed/.test(txt), 'no Owed');
  check(/Harbour Mill/.test(txt) && /Hollin Developments Ltd/.test(txt), 'each project shows its client underneath');
  check(/Andy Admin/.test(txt), 'the PM is shown');

  // + New Project beside Filter, not squeezing the tabs.
  const nb = await page.getByText('+ New Project', {exact: true}).boundingBox();
  const fb = await page.getByRole('button', {name: 'Filter', exact: true}).boundingBox();
  check(nb && fb && Math.abs((nb.y + nb.height / 2) - (fb.y + fb.height / 2)) < 4, '+ New Project is on the Filter row');
  // 7 Nov: + New Project the left two-thirds, Filter the right third, the same height.
  const nbb = await page.getByRole('button', {name: '+ New Project', exact: true}).boundingBox(); const nbtn = nbb && {x: nbb.x, w: nbb.width, h: nbb.height};
  check(nbtn && fb && nbtn.x < fb.x && Math.abs(nbtn.w / fb.width - 2) < 0.15, '+ New Project is on the left, twice as wide as Filter (' + (nbtn && Math.round(nbtn.w)) + ' / ' + Math.round(fb.width) + ')');
  check(nbtn && fb && Math.abs(nbtn.h - fb.height) < 1, 'and the same height (' + (nbtn && Math.round(nbtn.h)) + ' / ' + Math.round(fb.height) + ')');
  const foot = await page.evaluate(() => { const f = document.querySelector('[aria-label="Value of works"]'); const [a, b] = f ? [...f.children] : []; const s = (e) => e && {x: e.getBoundingClientRect().x, size: getComputedStyle(e).fontSize, col: getComputedStyle(e).color}; return {w: f && f.getBoundingClientRect().width, a: s(a), b: s(b)}; });
  check(foot.a && foot.b && foot.a.x < 40 && foot.b.x > foot.w / 2, 'bottom bar: the count on the left, the value of works on the right');
  check(foot.b && foot.b.size === '11.5px' && foot.b.col === 'rgb(91, 100, 114)', 'and small and grey (' + (foot.b && foot.b.size + ' ' + foot.b.col) + ')');
  const tabs = await page.getByText('Purchases', {exact: true}).first().boundingBox();
  check(tabs && tabs.x + tabs.width < 390, 'the Purchases tab is on the screen');

  // Job No, Value and PM centred under their headings; the project name on the left.
  const pos = await page.evaluate(() => {
    const t = document.querySelector('[aria-label="Projects table"]'); const rows = [...t.children];
    const mid = (el) => { const r = el.getBoundingClientRect(); return {c: r.x + r.width / 2, l: r.x, w: r.width, a: getComputedStyle(el).textAlign}; };
    const hd = [...rows[0].children].map(mid); const r1 = [...rows[1].children].map(mid);
    return {hd, r1};
  });
  check([0, 2, 3].every((i) => pos.r1[i].a === 'center' && Math.abs(pos.r1[i].c - pos.hd[i].c) < 2), 'Job No, Value and PM are centred under their headings');
  check(Math.abs(pos.r1[1].l - pos.hd[1].l) < 2, 'the project name starts at the left of its column');
  await page.screenshot({path: 'shots/finjobs-phone.png'});

  // Tap Value: biggest first.
  await page.getByLabel('Sort by Value').click(); await page.waitForTimeout(500);
  const first = (await tbl.innerText()).split('\n').slice(4, 6).join(' ');
  check(/Riverside Apartments/.test(first), 'Value sorts biggest first (' + first + ')');
  await page.screenshot({path: 'shots/finjobs-phone-value.png'});

  // Tap a row: the project opens.
  await page.getByText('Richardson Court', {exact: true}).click(); await page.waitForTimeout(3000);
  check(/\/fin\/job\/sx3/.test(page.url()), 'tapping a row opens the project (' + page.url().replace(/^.*8081/, '') + ')');
  check(!errs.length, `no errors ${errs.slice(0, 2).join(' | ')}`);
  await browser.close();
})();
